"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const {webcrypto}=require("node:crypto");

const html=fs.readFileSync("docs/index.html","utf8");
let onReady;
const nodes=new Map();
function node(){
 const flags=new Set(["hidden"]);
 return {
  style:{},dataset:{},children:[],textContent:"",title:"",value:"",
  classList:{add:v=>flags.add(v),remove:v=>flags.delete(v),contains:v=>flags.has(v),
   toggle:(v,on)=>{(on===undefined?!flags.has(v):on)?flags.add(v):flags.delete(v)}},
  setAttribute(key,value){this[key]=value},
  append(...items){this.children.push(...items)},
  replaceChildren(...items){this.children=[...items]},
  click(){this.onclick?.()}
 };
}
const byId=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)};
const sandbox={
 window:{addEventListener:(event,fn)=>{if(event==="DOMContentLoaded")onReady=fn},BIG_TWO_CARD_IMAGES:{}},
 document:{getElementById:byId,createElement:node,createDocumentFragment:node,addEventListener(){}},
 crypto:webcrypto,URLSearchParams,location:{search:"",pathname:"/"},history:{replaceState(){}},
 localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
 console,setTimeout:()=>1,clearTimeout:()=>{}
};
const inline=html.match(/<script>\s*("use strict";[\s\S]*?)<\/script>/)?.[1];
assert(inline);
const hook='window.__v062={classify,compare,options,play,newRoom,orderedPlayedCards,renderCurrentTrick,renderTablePile,setGame:g=>{game=g;host=false}};\n';
const script=inline.replace("const urlRoom=new URLSearchParams",hook+"const urlRoom=new URLSearchParams");
assert.notEqual(script,inline);
vm.runInNewContext(script,sandbox,{timeout:1500});
onReady();
const r=sandbox.window.__v062;
const check=(name,fn)=>{fn();console.log("PASS",name)};
const highestStraight=["2S","3C","4D","5H","6C"];
const mediumStraight=["6D","7S","8C","9D","10H"];
const fullHouse=["7C","7D","7H","10C","10D"];
const largerFullHouse=["8C","8D","8H","3C","3D"];
const sf=["2H","3H","4H","5H","6H"];
const iron=["7C","7D","7H","7S","2C"];

check("a regular straight cannot beat any full house and vice versa",()=>{
 const straight=r.classify(highestStraight),full=r.classify(fullHouse);
 assert.equal(straight.type,"straight");
 assert.equal(full.type,"full");
 assert.equal(r.compare(full,straight),false);
 assert.equal(r.compare(straight,full),false);
 assert.equal(r.compare(r.classify(mediumStraight),full),false);
});
check("same-type straight and full-house comparisons remain valid",()=>{
 assert.equal(r.compare(r.classify(highestStraight),r.classify(mediumStraight)),true);
 assert.equal(r.compare(r.classify(mediumStraight),r.classify(highestStraight)),false);
 assert.equal(r.compare(r.classify(largerFullHouse),r.classify(fullHouse)),true);
 assert.equal(r.compare(r.classify(fullHouse),r.classify(largerFullHouse)),false);
});
check("only preserved special override hands can cross ordinary types",()=>{
 const full=r.classify(fullHouse),straight=r.classify(highestStraight);
 assert(r.compare(r.classify(iron),straight));
 assert(r.compare(r.classify(iron),full));
 assert(r.compare(r.classify(sf),full));
 assert(r.compare(r.classify(sf),r.classify(iron)));
 assert(!r.compare(r.classify(iron),r.classify(sf)));
});
check("game rejects AI or player full house over 23456",()=>{
 const g=r.newRoom("123456","Tester","valid");
 g.players=[
  {name:"Player",ai:false,hand:fullHouse.slice()},
  {name:"Bot",ai:true,hand:highestStraight.slice()},
  {name:"Bot2",ai:true,hand:[]},
  {name:"Bot3",ai:true,hand:[]}
 ];
 g.phase="playing";g.first=false;g.turn=0;
 g.trick={player:1,cards:highestStraight,pattern:r.classify(highestStraight)};
 r.setGame(g);
 assert.throws(()=>r.play(0,fullHouse),/牌型或大小不足/);
 assert.equal(g.players[0].hand.length,5);
 assert.equal(g.trick.pattern.type,"straight");
 assert(!r.options(g.players[0].hand).some(m=>r.compare(m.pattern,g.trick.pattern)));
 // The very same host comparison also filters AI options.
 g.players[1].hand=fullHouse.slice();g.trick={player:0,cards:highestStraight,pattern:r.classify(highestStraight)};
 const legalAi=r.options(g.players[1].hand).filter(m=>r.compare(m.pattern,g.trick.pattern));
 assert.equal(legalAi.length,0,"AI must PASS instead of responding with a full house");
});
check("game rejects straight over full house",()=>{
 const g=r.newRoom("123456","Tester","valid");
 g.players=[
  {name:"Player",ai:false,hand:highestStraight.slice()},
  {name:"Bot",ai:true,hand:fullHouse.slice()},
  {name:"Bot2",ai:true,hand:[]},
  {name:"Bot3",ai:true,hand:[]}
 ];
 g.phase="playing";g.first=false;g.turn=0;
 g.trick={player:1,cards:fullHouse,pattern:r.classify(fullHouse)};
 r.setGame(g);
 assert.throws(()=>r.play(0,highestStraight),/牌型或大小不足/);
 assert.equal(g.trick.pattern.type,"full");
});
check("played straight 23456 renders 2 first, never last",()=>{
 const original=["3C","4D","5H","6C","2S"];
 const displayed=Array.from(r.orderedPlayedCards(original));
 assert.deepEqual(displayed,["2S","3C","4D","5H","6C"]);
 const a2345=Array.from(r.orderedPlayedCards(["2D","3H","4C","5S","AC"]));
 assert.deepEqual(a2345,["AC","2D","3H","4C","5S"]);
 r.renderCurrentTrick({round:3,trick:{cards:original,pattern:r.classify(original)}});
 const rendered=byId("trick").children.map(card=>card.children[0].textContent);
 assert.deepEqual(rendered,["2","3","4","5","6"]);
});
check("saved or previously sorted 23456 still renders 2 first in table pile",()=>{
 const st={round:3,players:[{name:"Host"},{name:"Friend"}],
  playedHands:[{player:1,cards:["3C","4D","5H","6C","2S"]},{player:0,cards:["7C"]}],
  trick:{player:0,cards:["7C"],pattern:r.classify(["7C"])}
 };
 r.renderTablePile(st);
 const fragment=byId("table-pile").children[0];
 const firstStack=fragment.children[0];
 assert.equal(firstStack.children.length,5);
 const ranks=firstStack.children.map(card=>card.children[0].textContent);
 assert.deepEqual(ranks,["2","3","4","5","6"]);
});
check("playing 23456 stores correct sequence in public game state",()=>{
 const g=r.newRoom("123456","Host","valid");
 g.players=[
  {name:"Host",hand:highestStraight.concat(["7C"]),ai:false},
  {name:"Friend",hand:["9H"],ai:false},
  {name:"Bot2",hand:["10H"],ai:false},
  {name:"Bot3",hand:["JH"],ai:false}
 ];
 g.phase="playing";g.first=false;g.turn=0;g.trick=null;
 r.setGame(g);
 r.play(0,["3C","4D","5H","6C","2S"]);
 assert.deepEqual(Array.from(g.trick.cards),highestStraight);
 assert.deepEqual(Array.from(g.playedHands[0].cards),highestStraight);
 assert.equal(g.players[0].hand.length,1);
});
console.log("PASS V0.6.2 strict ordinary hand comparison and 23456 table ordering");
