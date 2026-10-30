"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const {webcrypto}=require("node:crypto");
const html=fs.readFileSync("docs/index.html","utf8");
const css=fs.readFileSync("docs/theme.css","utf8");
assert(!/z-index:(30|80|90)!important/.test(css),"Selected cards must not cover later card hit targets");
assert(html.includes('id="table-pile"')&&html.includes('class="sidebar"'));
assert(html.includes("game.playedHands=[];"),"Pile history must reset each round");
assert(html.includes("playedHands:game.playedHands||[]"),"Public play history must travel to guests");
const elem=()=>{
 const entries=new Set();
 const el={children:[],style:{},dataset:{},className:"",textContent:"",disabled:false,
 classList:{add:c=>entries.add(c),remove:c=>entries.delete(c),toggle:(c,on)=>{const val=on===undefined?!entries.has(c):!!on;val?entries.add(c):entries.delete(c);return val},contains:c=>entries.has(c)},
 setAttribute(k,v){this[k]=v},
 append(...nodes){this.children.push(...nodes)},
 replaceChildren(...nodes){this.children=[...nodes]},
 };
 return el;
};
const elements=new Map();
const get=id=>{if(!elements.has(id))elements.set(id,elem());return elements.get(id)};
let ready;
const storage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
const sandbox={window:{addEventListener:(e,cb)=>{if(e==="DOMContentLoaded")ready=cb},BIG_TWO_CARD_IMAGES:{}},
 document:{getElementById:get,createElement:elem,createDocumentFragment:elem,addEventListener:()=>{}},
 localStorage:storage,crypto:webcrypto,location:{search:"",pathname:"/BigTwo_Web/",origin:"https://example.test"},history:{replaceState:()=>{}},
 navigator:{clipboard:{writeText:async()=>{}}},URLSearchParams,clearTimeout,setTimeout,console};
const script=html.match(/<script>\s*("use strict";[\s\S]*?)<\/script>/)?.[1];
assert(script,"Inline browser script must exist");
const inject='window.__qa={newRoom,startRound,play,pass,snapshot,render,getGame:()=>game,setGame:g=>{game=g;host=false}};\n';
const changed=script.replace('const urlRoom=new URLSearchParams',inject+'const urlRoom=new URLSearchParams');
assert.notEqual(changed,script,"Test hook injection failed");
vm.runInNewContext(changed,sandbox,{timeout:1500});
assert.equal(typeof ready,"function");
ready();
const test=sandbox.window.__qa;
const room=test.newRoom("ABCDEF","QA","token");
test.setGame(room);
test.startRound();
assert.equal(room.players.length,4);
assert.equal(room.playedHands.length,0);
const leader=room.turn;
assert(room.players[leader].hand.includes("3C"));
test.play(leader,["3C"]);
assert.equal(room.playedHands.length,1);
assert.equal(room.playedHands[0].cards.join(","),"3C");
const state0=test.snapshot(0),state1=test.snapshot(1);
assert.equal(state0.playedHands[0].cards[0],"3C");
assert.equal(state1.playedHands[0].cards[0],"3C");
assert(state0.hand.length>0&&state1.hand.length>0);
assert(!Object.hasOwn(state1.players[0],"hand"),"Never leak other player cards");
test.render(state0);
const hand=get("hand").children;
assert.equal(hand.length,room.players[0].hand.length);
for(let i=0;i<hand.length;i++)assert.equal(hand[i].style.zIndex,String(i+1));
if(hand.length>=2){hand[0].onclick();hand[1].onclick();assert.equal(get("play").textContent,"出牌（2）");}
for(let i=0;i<3;i++)test.pass(room.turn);
assert.equal(room.trick,null);
assert.equal(room.playedHands.length,1,"PASS must not clear played hands");
test.render(test.snapshot(0));
assert.equal(get("table-pile").children.length,1,"After all PASS, the played hand is visible on the table");
room.phase="lobby";
test.startRound();
assert.equal(room.playedHands.length,0,"New round must clear the table history");
console.log("PASS 12 UI / game-state assertions: hit layers, public pile, PASS retention, round reset, privacy.");
