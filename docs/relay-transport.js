/* Big Two v0.5.6 experimental encrypted WSS relay.
   Uses public test brokers; suitable for temporary testing only, not production.
   ECDH protects against passive eavesdropping, but NOT active MITM without identity verification. */
(function(root){
"use strict";
const BROKERS=["wss://broker.emqx.io:8084/mqtt","wss://test.mosquitto.org:8081"];
const VERSION="bigtwo/relay-v056/";
let loader=null;
function loadMqtt(){
 if(root.mqtt?.connect)return Promise.resolve(root.mqtt);
 if(loader)return loader;
 loader=new Promise((resolve,reject)=>{
  const urls=["https://cdn.jsdelivr.net/npm/mqtt@5.14.1/dist/mqtt.min.js","https://unpkg.com/mqtt@5.14.1/dist/mqtt.min.js"];
  function next(i){
   if(root.mqtt?.connect){resolve(root.mqtt);return;}
   if(i>=urls.length){loader=null;reject(Error("WSS library unavailable"));return;}
   const script=document.createElement("script");
   script.async=true;script.src=urls[i];script.onload=()=>next(i+1);script.onerror=()=>next(i+1);
   document.head.appendChild(script);
  }
  next(0);
 });
 return loader;
}
const randomId=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),v=>v.toString(16).padStart(2,"0")).join("");
const b64=a=>{let s="";for(const byte of new Uint8Array(a))s+=String.fromCharCode(byte);return btoa(s);};
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const generate=()=>crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveKey"]);
const pub=async p=>b64(await crypto.subtle.exportKey("raw",p.publicKey));
async function derive(pair,raw){
 const foreign=await crypto.subtle.importKey("raw",bytes(raw),{name:"ECDH",namedCurve:"P-256"},false,[]);
 return crypto.subtle.deriveKey({name:"ECDH",public:foreign},pair.privateKey,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
async function encrypt(key,message){
 const iv=crypto.getRandomValues(new Uint8Array(12)),plain=new TextEncoder().encode(JSON.stringify(message));
 if(plain.length>16000)throw Error("Relay payload too large");
 const ciphertext=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,plain);
 return {type:"secure",iv:b64(iv),body:b64(ciphertext)};
}
async function decrypt(key,message){
 if(typeof message?.iv!=="string"||typeof message?.body!=="string"||message.body.length>27000)return null;
 const data=await crypto.subtle.decrypt({name:"AES-GCM",iv:bytes(message.iv)},key,bytes(message.body));
 return JSON.parse(new TextDecoder().decode(data));
}
const topic=room=>VERSION+room;
function parse(raw){try{const str=typeof raw==="string"?raw:new TextDecoder().decode(raw);return str.length<=28000?JSON.parse(str):null;}catch{return null;}}
const options=()=>({clientId:"bt-"+randomId(10),protocolVersion:4,clean:true,keepalive:20,reconnectPeriod:2000,connectTimeout:6000});
function send(client,name,data){
 if(!client?.connected)throw Error("WSS disconnected");
 client.publish(name,JSON.stringify(data),{qos:1,retain:false});
}
async function connect(mqtt,url,subscription){
 return new Promise((resolve,reject)=>{
  const client=mqtt.connect(url,options());let settled=false;
  const timer=setTimeout(()=>fail(Error("WSS connect timeout")),7000);
  function fail(e){if(settled)return;settled=true;clearTimeout(timer);try{client.end(true);}catch{}reject(e);}
  client.on("connect",()=>{
   client.subscribe(subscription,{qos:1},e=>{
    if(e){fail(e);return;}
    if(!settled){settled=true;clearTimeout(timer);resolve(client);}
   });
  });
  client.on("error",e=>{if(!settled)fail(e);});
 });
}
function emitter(){
 const handlers=new Map();
 return {open:true,on(type,fn){handlers.set(type,[...(handlers.get(type)||[]),fn]);return this;},
 emit(type,data){for(const fn of handlers.get(type)||[])fn(data);}};
}
async function createHost(room,onConnection,onStatus=()=>{}){
 const mqtt=await loadMqtt(),sessions=new Map(),clients=[];let closed=false;
 async function receive(client,address,raw){
  if(closed)return;
  const id=String(address).split("/").at(-1);
  if(!/^[a-f0-9]{32}$/.test(id))return;
  const data=parse(raw),key=client.options.clientId+"|"+id;
  if(!data)return;
  if(data.type==="hello"&&typeof data.pub==="string"&&data.pub.length<160){
   const session=String(data.session||"");
   if(!/^[a-f0-9]{32}$/.test(session))return;
   let entry=sessions.get(key);
   if(!entry||entry.session!==session){
    try{
     const pair=await generate(),secret=await derive(pair,data.pub),publicPart=await pub(pair),connection=emitter();
     entry={session,secret,publicPart,connection,receiveQueue:Promise.resolve(),sendQueue:Promise.resolve()};
     connection.send=message=>{
      entry.sendQueue=entry.sendQueue.then(async()=>{
       const packet=await encrypt(secret,message);
       if(!closed&&connection.open)send(client,topic(room)+"/to/"+id,{...packet,session});
      }).catch(()=>{});
     };
     connection.close=()=>{
      if(!connection.open)return;
      connection.open=false;connection.emit("close");
      if(sessions.get(key)===entry)sessions.delete(key);
     };
     sessions.set(key,entry);
     onConnection(connection);
    }catch{return;}
   }
   try{send(client,topic(room)+"/to/"+id,{type:"welcome",pub:entry.publicPart,session});}catch{}
   return;
  }
  const entry=sessions.get(key);
  if(!entry||!entry.connection.open||data.type!=="secure"||data.session!==entry.session)return;
  entry.receiveQueue=entry.receiveQueue.then(async()=>{
   const decoded=await decrypt(entry.secret,data);
   if(decoded?.type==="bye"){entry.connection.close();return;}
   if(decoded&&typeof decoded==="object")entry.connection.emit("data",decoded);
  }).catch(()=>{});
 }
 const results=await Promise.allSettled(BROKERS.map(async url=>{
  const client=await connect(mqtt,url,topic(room)+"/from/+");
  client.on("message",(address,raw)=>{receive(client,address,raw);});
  clients.push(client);onStatus("WSS relay ready ("+url+")");return client;
 }));
 if(!results.some(r=>r.status==="fulfilled"))throw Error("No public WSS relay reachable");
 return {brokers:clients.length,close(){
  closed=true;for(const ent of [...sessions.values()])ent.connection.close();
  sessions.clear();for(const client of clients)try{client.end(true);}catch{}
 }};
}
async function connectGuest(room,{name,token,onState,onError=()=>{},onDisconnect=()=>{},onStatus=()=>{}}){
 const mqtt=await loadMqtt();let last;
 for(const broker of BROKERS){
  try{return await guestBroker(mqtt,broker,room,{name,token,onState,onError,onDisconnect,onStatus});}
  catch(e){last=e;onStatus(broker+" failed: "+e.message);}
 }
 throw Error("All WSS relays unavailable: "+(last?.message||"unknown"));
}
async function guestBroker(mqtt,url,room,{name,token,onState,onError,onDisconnect,onStatus}){
 const id=randomId(16),session=randomId(16),pair=await generate(),guestPub=await pub(pair);
 const incoming=topic(room)+"/to/"+id,outgoing=topic(room)+"/from/"+id;
 const connection=emitter();let client=null,key=null,closed=false,joined=false,recv=Promise.resolve(),sending=Promise.resolve(),timer,pulse;
 let resolve,reject;
 const joinedPromise=new Promise((yes,no)=>{resolve=yes;reject=no;});
 function stop(){
  if(closed)return;closed=true;connection.open=false;clearTimeout(timer);clearInterval(pulse);
  try{client?.end(true);}catch{}
 }
 function emit(message){
  if(!key||!client?.connected||closed)throw Error("WSS relay not connected");
  sending=sending.then(async()=>{
   const packet=await encrypt(key,message);
   if(!closed&&client?.connected)send(client,outgoing,{...packet,session});
  }).catch(()=>{});
 }
 connection.send=emit;
 connection.close=()=>{if(!closed&&key)try{emit({type:"bye"});}catch{}stop();};
 timer=setTimeout(()=>{if(!joined){stop();reject(Error("Relay join timeout"));}},9000);
 pulse=setInterval(()=>{
  if(closed||joined||!client?.connected)return;
  try{if(key)emit({type:"join",name,token});else send(client,outgoing,{type:"hello",pub:guestPub,session});}catch{}
 },1700);
 try{
  client=await connect(mqtt,url,incoming);
  client.on("message",(channel,raw)=>{
   if(closed||channel!==incoming)return;
   const msg=parse(raw);
   if(!msg||msg.session!==session)return;
   if(msg.type==="welcome"&&typeof msg.pub==="string"&&!key){
    derive(pair,msg.pub).then(secret=>{
     if(!closed){key=secret;emit({type:"join",name,token});}
    }).catch(()=>{});return;
   }
   if(!key||msg.type!=="secure")return;
   recv=recv.then(async()=>{
    const value=await decrypt(key,msg);
    if(value?.type==="error"){
     if(!joined){stop();reject(Error(String(value.message||"Host refused join")));}
     else onError(String(value.message||"Host error"));
    }else if(value?.type==="state"&&value.state?.room===room&&Number.isInteger(value.state?.me)){
     if(!joined){joined=true;clearTimeout(timer);clearInterval(pulse);onStatus("WSS relay connected");resolve(connection);}
     onState(value.state);
    }
   }).catch(()=>{});
  });
  client.on("offline",()=>{if(joined&&!closed){stop();onDisconnect("WSS relay disconnected");}});
  client.on("error",e=>{if(joined&&!closed)onError("WSS error: "+e.message);});
  send(client,outgoing,{type:"hello",pub:guestPub,session});
 }catch(e){stop();throw e;}
 return joinedPromise;
}
root.BigTwoRelay=Object.freeze({createHost,connectGuest,BROKERS});
})(window);
