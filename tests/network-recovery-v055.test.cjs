"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const {webcrypto}=require("node:crypto");
const html=fs.readFileSync("docs/index.html","utf8");
function createHarness({urlRoom="",saved=null}={}){
 const timers=new Map(), peers=[],elements=new Map(),events={};
 let id=0,ready;
 const setTimer=(callback,delay)=>{const number=++id;timers.set(number,{callback,delay});return number;};
 const clearTimer=number=>timers.delete(number);
 const fireTimer=delay=>{const match=[...timers.entries()].find(([_,v])=>v.delay===delay);assert(match,"Missing timer "+delay);timers.delete(match[0]);match[1].callback();};
 function element(){
  const c=new Set();
  return {style:{},dataset:{},children:[],textContent:"",value:"",disabled:false,
   classList:{add:x=>c.add(x),remove:x=>c.delete(x),contains:x=>c.has(x),toggle:(x,b)=>{const next=b===undefined?!c.has(x):!!b;next?c.add(x):c.delete(x);return next;}},
   setAttribute(k,v){this[k]=v;},append(...xs){this.children.push(...xs);},replaceChildren(...xs){this.children=[...xs];},click(){this.onclick?.()}};
 }
 const get=key=>{if(!elements.has(key))elements.set(key,element());return elements.get(key)};
 class Emitter{
  constructor(){this.listeners=new Map();}
  on(key,fn){const list=this.listeners.get(key)||[];list.push(fn);this.listeners.set(key,list);return this;}
  emit(key,...args){for(const callback of this.listeners.get(key)||[])callback(...args);}
 }
 class FakeConnection extends Emitter{
  constructor(){super();this.open=false;this.messages=[];this.closed=false;}
  send(message){this.messages.push(message);}
  close(){if(this.closed)return;this.closed=true;this.open=false;this.emit("close");}
  fireOpen(){this.open=true;this.emit("open");}
 }
 class FakePeer extends Emitter{
  constructor(peerId){super();this.id=peerId||"guest-"+(peers.length+1);this.destroyed=false;this.disconnected=false;this.channel=null;peers.push(this);queueMicrotask(()=>this.emit("open",this.id));}
  connect(target){this.target=target;this.channel=new FakeConnection();return this.channel;}
  reconnect(){this.reconnected=true;this.disconnected=false;this.emit("open",this.id);}
  destroy(){if(this.destroyed)return;this.destroyed=true;this.channel?.close();}
 }
 const stored=saved?JSON.stringify(saved):null;
 const sandbox={
  window:{BIG_TWO_CARD_IMAGES:{},addEventListener:(name,fn)=>{events[name]=fn;if(name==="DOMContentLoaded")ready=fn;}},
  document:{visibilityState:"visible",getElementById:get,createElement:element,createDocumentFragment:element,addEventListener:(name,fn)=>{events[name]=fn;}},
  Peer:FakePeer,localStorage:{getItem:()=>stored,setItem(){},removeItem(){}},crypto:webcrypto,URLSearchParams,
  location:{pathname:"/BigTwo_Web/",origin:"https://example.invalid",search:urlRoom?"?room="+urlRoom:""},
  history:{replaceState(){}},setTimeout:setTimer,clearTimeout:clearTimer,console
 };
 const script=html.match(/<script>\s*("use strict";[\s\S]*?)<\/script>/)?.[1];
 assert(script,"Expected inline game script");
 const hook="window.__qa={guestJoin,hostCreate,guestSend,retryConnection,startGuestConnection,connectionHint,state,getPeer:()=>peer,getConn:()=>conn,getGame:()=>game,connected:()=>guestHasState};\n";
 const injected=script.replace("const urlRoom=new URLSearchParams",hook+"const urlRoom=new URLSearchParams");
 assert.notEqual(injected,script,"Test injection failed");
 vm.runInNewContext(injected,sandbox,{timeout:1500});
 ready();
 return {qa:sandbox.window.__qa,peers,timers,fireTimer,get,events};
}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const check=(name,fn)=>{console.log("PASS",name);return fn();};
(async()=>{
 const h=createHarness(),{qa,get,peers,fireTimer}=h;
 get("code").value="273514";get("nick").value="Phone";
 qa.guestJoin(null);
 await flush();
 assert.equal(peers.length,1);
 assert.equal(peers[0].target,"bigtwo-v1-273514");
 assert.notEqual(get("game").style.display,"block");
 check("Joining does not display a false empty game state",()=>{assert(get("connection-description").textContent.includes("正在加入房間"));});
 const first=peers[0].channel;
 first.emit("error",{type:"negotiation-failed"});
 check("Failed WebRTC negotiation shows retry feedback",()=>{assert(get("connection-description").textContent.includes("自動重連"));});
 fireTimer(1500);await flush();
 check("Retry creates new Peer and new DataConnection",()=>{
  assert.equal(peers.length,2);
  assert.notEqual(peers[0],peers[1]);
  assert.equal(peers[1].target,"bigtwo-v1-273514");
 });
 const second=peers[1].channel;second.fireOpen();
 check("Join request contains original room identity",()=>{
  assert.equal(second.messages[0].type,"join");
  assert.equal(second.messages[0].name,"Phone");
  assert.equal(second.messages[0].token.length,36);
 });
 const snapshot={room:"273514",me:1,phase:"lobby",round:0,first:true,turn:0,trick:null,lastSeat:-1,champion:null,
  players:[{name:"Host",ai:false,count:0},{name:"Phone",ai:false,count:0}],hand:[],playedCards:[],playedHands:[],log:["join"]};
 second.emit("data",{type:"state",state:snapshot});
 check("Receiving verified host state opens real game",()=>{
  assert.equal(get("game").style.display,"block");
  assert.equal(get("net").textContent,"已連線到房主");
  assert.equal(qa.connected(),true);
  assert(get("connection-hint").classList.contains("hidden"));
 });
 second.emit("close");
 check("Reconnection disables playing until host resumes",()=>{
  assert.equal(qa.connected(),false);
  assert.equal(get("play").disabled,true);
  assert(get("connection-description").textContent.includes("自動重連"));
 });
 get("retry-connect").onclick();await flush();
 check("Manual reconnect restarts a fresh attempt",()=>{
  assert.equal(peers.length,3);
  assert.equal(peers[2].target,"bigtwo-v1-273514");
 });
 const oldHost={room:"111111",name:"Previous",token:"abc",host:true,game:{room:"111111",players:[]}};
 const different=createHarness({urlRoom:"273514",saved:oldHost});
 check("Invite URL wins over unrelated stored host room",()=>{
  assert.equal(different.peers.length,0);
  assert.equal(different.get("code").value,"273514");
  assert(different.get("connection-description").textContent.includes("已讀取邀請房號"));
 });
 const home=createHarness();
 home.get("nick").value="Host";
 await home.qa.hostCreate(null);await flush();
 check("Host begins with registered room and game state",()=>{
  assert.equal(home.peers.length,1);
  assert.equal(home.get("game").style.display,"block");
  assert.equal(home.get("net").textContent,"房主連線中");
 });
 home.peers[0].disconnected=true;home.peers[0].emit("disconnected");
 home.fireTimer(3000);
 check("Host restores signal registration after disconnection",()=>{
  assert.equal(home.peers[0].reconnected,true);
  assert.equal(home.get("net").textContent,"房主連線中");
 });
 console.log("PASS 10 simulated P2P recovery scenarios");
})().catch(error=>{console.error(error);process.exitCode=1;});
