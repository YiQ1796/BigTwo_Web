"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const {webcrypto}=require("node:crypto");
const {TextEncoder,TextDecoder}=require("node:util");
const code=fs.readFileSync("docs/relay-transport.js","utf8");
const html=fs.readFileSync("docs/index.html","utf8");
class Events{
 constructor(){this.listeners=new Map();}
 on(name,cb){const all=this.listeners.get(name)||[];all.push(cb);this.listeners.set(name,all);return this;}
 emit(name,...args){for(const cb of this.listeners.get(name)||[])cb(...args);}
}
const published=[];
const clients=new Set();
function topicMatch(pattern,topic){
 const p=pattern.split("/"),s=topic.split("/");
 return p.length===s.length&&p.every((segment,i)=>segment==="+"||segment===s[i]);
}
const mqtt={connect(url,options){
 const client=new Events();
 client.options=options;client.url=url;client.connected=false;client.subs=[];
 client.subscribe=(channel,opts,done)=>{client.subs.push(channel);done(null);};
 client.publish=(topic,payload,options)=>{
  published.push({topic,payload:String(payload)});
  queueMicrotask(()=>{
   for(const target of clients){
    if(!target.connected||target.url!==client.url)continue;
    if(target.subs.some(sub=>topicMatch(sub,topic)))target.emit("message",topic,String(payload));
   }
  });
 };
 client.end=()=>{client.connected=false;clients.delete(client);};
 clients.add(client);queueMicrotask(()=>{client.connected=true;client.emit("connect");});
 return client;
}};
function runtime(){
 const window={mqtt};
 const env={
  window,crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,Promise,JSON,Date,
  console,Buffer,btoa,atob,
  setTimeout,clearTimeout,setInterval,clearInterval,queueMicrotask,
  document:{createElement(){throw Error("No external library needed");}},
 };
 vm.runInNewContext(code,env,{timeout:2000});
 return window.BigTwoRelay;
}
const hostLib=runtime(),guestLib=runtime();
let inbound=null,sentMoves=[];
const room="834921";
async function main(){
 const host=await hostLib.createHost(room,c=>{
  inbound=c;
  c.on("data",data=>{
   if(data.type==="join"){
    assert.equal(data.token,"unit-test-secret");
    c.seat=1;
    c.send({type:"state",state:{room,me:1,hand:["AS"],players:[{count:3},{count:1}]}});
   }else if(data.type==="play"){
    sentMoves.push(data.cards.join(","));
    c.send({type:"state",state:{room,me:1,hand:[],players:[{count:3},{count:0}]}});
   }
  });
 });
 assert(host.brokers>0);
 let updates=[];
 const guest=await Promise.race([
  guestLib.connectGuest(room,{name:"Guest",token:"unit-test-secret",onState:state=>updates.push(state)}),
  new Promise((_,reject)=>setTimeout(()=>reject(Error("Relay end-to-end timeout")),2500))
 ]);
 assert.equal(updates[0].hand[0],"AS");
 assert(inbound,"host accepted encrypted guest transport");
 guest.send({type:"play",cards:["AS"]});
 await new Promise(r=>setTimeout(r,80));
 assert.equal(sentMoves[0],"AS");
 assert(updates.some(s=>s.hand.length===0));
 assert(!published.some(entry=>entry.payload.includes('"hand"')||entry.payload.includes('"token"')||entry.payload.includes('"cards"')),"private card data cannot be sent in plaintext");
 assert(published.some(entry=>JSON.parse(entry.payload).type==="secure"),"AES-GCM must be active");
 assert(published.some(entry=>JSON.parse(entry.payload).type==="hello"));
 assert(published.some(entry=>JSON.parse(entry.payload).type==="welcome"));
 console.log("PASS relay host and guest handshake over separate WSS clients");
 console.log("PASS encrypted join, private state and valid play round trip");
 console.log("PASS public broker has no plaintext tokens or cards");
 guest.close();host.close();
 assert(html.includes('src="./relay-transport.js?v=056"'));
 assert(html.includes("window.BigTwoRelay?.connectGuest"));
 assert(html.includes("Promise.any(attempts)"));
 assert(html.includes('hostRelay=relay;return "加密 WSS 中繼"'));
 assert(html.includes('else if(data.type==="taunt")applyTaunt(c.seat,data.id)'));
 console.log("PASS host/guest fallback wiring and original taunt routes retained");
 console.log("PASS 5 relay integration scenarios");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
