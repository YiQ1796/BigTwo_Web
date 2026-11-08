"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const {webcrypto}=require("node:crypto");
const html=fs.readFileSync("docs/index.html","utf8");
const css=fs.readFileSync("docs/theme.css","utf8");

assert(html.includes('class="opponents-bar"'),"Compact opponent rail missing");
assert(html.indexOf('class="opponents-bar"')<html.indexOf('class="table" aria-label="中央出牌區"'),"Player rail must be above the board");
assert(css.includes(".opponents-bar .seat")&&css.includes("position:static;left:auto"),"Opponents should not occupy table corners");
assert(css.includes(".room-actions #leave{order:4}"),"Return to lobby must share a toolbar row on phones");
assert(css.includes("border-radius:22px"),"Rectangular playing area needs compact rounded corners");
assert(css.includes(".trick .card{"),"Centre cards must have their own enlarged rule");
console.log("PASS compact three-player status rail, larger centre cards and mobile toolbar structure");

function element(){
 const states=new Set();
 return {
  style:{},dataset:{},textContent:"",value:"",children:[],
  classList:{
   add:x=>states.add(x),remove:x=>states.delete(x),contains:x=>states.has(x),
   toggle:(x,on)=>{const present=on===undefined?!states.has(x):!!on;present?states.add(x):states.delete(x);return present;}
  },
  setAttribute(name,value){this[name]=value},
  append(...nodes){this.children.push(...nodes)},
  replaceChildren(...nodes){this.children=[...nodes]},
  click(){this.onclick?.()}
 };
}
const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)};
let ready;
const sandbox={
 window:{addEventListener:(name,fn)=>{if(name==="DOMContentLoaded")ready=fn;},BIG_TWO_CARD_IMAGES:{}},
 document:{getElementById:get,createElement:element,createDocumentFragment:element,addEventListener(){}},
 localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
 crypto:webcrypto,URLSearchParams,location:{search:"",origin:"https://example.test",pathname:"/"},
 history:{replaceState(){}},console,setTimeout:()=>1,clearTimeout:()=>{}
};
const script=html.match(/<script>\s*("use strict";[\s\S]*?)<\/script>/)?.[1];
assert(script,"Inline game code missing");
const inject='window.__qa={newRoom,startRound,joinOnHost,render,snapshot,ensureGame,setGame:g=>{game=g},setHost:value=>{host=value},setPeers:p=>{peers=p},setHostRelay:value=>{hostRelay=value},retryConnection};\n';
const loaded=script.replace("const urlRoom=new URLSearchParams",inject+"const urlRoom=new URLSearchParams");
assert.notEqual(script,loaded);
vm.runInNewContext(loaded,sandbox,{timeout:1500});ready();
const app=sandbox.window.__qa;
function connection(){
 return {open:true,messages:[],send(value){this.messages.push(value)},close(){this.open=false}};
}
const g=app.newRoom("123456","Host","h".repeat(36));
const friendToken="f".repeat(36);
g.players.push({name:"Friend",token:friendToken,ai:false,hand:[]});
g.players.push({name:"CPU 2",token:null,ai:true,hand:[]});
g.players.push({name:"CPU 3",token:null,ai:true,hand:[]});
g.phase="finished";g.round=1;g.champion=0;g.winnerSeat=0;
const friend=connection(),peerMap=new Map([[1,friend]]);
app.setGame(g);app.setHost(true);app.setPeers(peerMap);
app.startRound();
assert.equal(g.round,2);
assert.equal(g.phase,"playing");
assert.equal(g.players[1].token,friendToken);
assert.equal(g.players[1].name,"Friend");
assert.equal(g.players[1].ai,false);
assert.equal(g.players[1].hand.length,13);
assert.equal(g.players.length,4);
assert.equal(peerMap.get(1),friend);
const sent=friend.messages.at(-1);
assert.equal(sent.type,"state");
assert.equal(sent.state.me,1);
assert.equal(sent.state.phase,"playing");
assert.equal(sent.state.round,2);
assert.equal(sent.state.hand.length,13);
assert.equal(g.turn,g.players.findIndex(p=>p.hand.includes("3C")));
console.log("PASS second round keeps human identity, seat, connection, hand and fresh club-three lead");

const opponent=get("seat1").children;
assert.equal(opponent.length,3);
assert.equal(opponent[1].textContent,"Friend");
assert.equal(opponent[2].textContent,"13張");
console.log("PASS compact opponent status always shows the card count separately from the name");

g.phase="finished";g.champion=2;friend.open=false;peerMap.delete(1);
const beforeRound=g.round;
assert.throws(()=>app.startRound(),/等待真人玩家重新連線/);
assert.equal(g.round,beforeRound);
assert.equal(g.phase,"finished");
assert.equal(g.players[1].token,friendToken);
console.log("PASS offline human is never silently replaced when host starts next round");

const returned=connection();
app.joinOnHost(returned,{name:"Friend",token:friendToken});
assert.equal(peerMap.get(1),returned);
assert.equal(returned.messages[0].type,"state");
assert.equal(returned.messages[0].state.me,1);
assert.equal(g.players.filter(p=>!p.ai).length,2);
app.startRound();
assert.equal(g.round,3);
assert.equal(g.phase,"playing");
assert.equal(returned.messages.at(-1).state.round,3);
console.log("PASS original player token rejoins the same reserved seat and can continue round three");

app.setHostRelay({close(){}});
const previous=peerMap.get(1),messageCount=returned.messages.length;
app.retryConnection();
assert.equal(peerMap.get(1),previous);
assert(returned.messages.length>messageCount,"Host manual retry should re-broadcast without destroying guest");
console.log("PASS host retry preserves working guest channels rather than resetting the room");
console.log("PASS V0.6.1 multiplayer next-round and compact mobile arena regressions");
