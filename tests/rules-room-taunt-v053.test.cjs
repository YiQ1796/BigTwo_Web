"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const {webcrypto}=require("node:crypto");
const html=fs.readFileSync("docs/index.html","utf8");
const elements=new Map();
function element(){
 const classes=new Set();
 return {style:{},dataset:{},children:[],textContent:"",value:"",
 classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle:(x,b)=>{const use=b===undefined?!classes.has(x):!!b;use?classes.add(x):classes.delete(x);return use;}},
 append(...v){this.children.push(...v)},replaceChildren(...v){this.children=v},
 setAttribute(k,v){this[k]=v},click(){this.onclick?.()}};
}
function get(id){if(!elements.has(id))elements.set(id,element());return elements.get(id)}
let ready;
const win={addEventListener:(name,fn)=>{if(name==="DOMContentLoaded")ready=fn},BIG_TWO_CARD_IMAGES:{}};
const sandbox={window:win,document:{getElementById:get,createElement:element,createDocumentFragment:element,addEventListener(){}},
 localStorage:{getItem:()=>null,setItem(){},removeItem(){}},crypto:webcrypto,URLSearchParams,
 location:{pathname:"/",origin:"https://example.test",search:""},history:{replaceState(){}},console,setTimeout,clearTimeout};
const inline=html.match(/<script>\s*("use strict";[\s\S]*?)<\/script>/)?.[1];
assert(inline,"inline script");
const hook='window.__qa={classify,compare,randomCode,newRoom,applyTaunt,snapshot,play,options,renderTaunt,setGame:g=>{game=g;host=false}};\n';
const injected=inline.replace("const urlRoom=new URLSearchParams",hook+"const urlRoom=new URLSearchParams");
assert.notEqual(injected,inline);
vm.runInNewContext(injected,sandbox,{timeout:1500});ready();
const T=win.__qa;let passed=0;
function check(name,fn){fn();passed++;console.log("PASS",name)}
check("Numeric six-digit room IDs",()=>{
 for(let i=0;i<128;i++)assert(/^\d{6}$/.test(T.randomCode()));
});
check("Mobile numeric keypad",()=>assert.match(html,/id="code"[^>]*inputmode="numeric"/));
const pair2=T.classify(["2C","2D"]),iron=T.classify(["7C","7D","7H","7S","3C"]);
check("Iron is five-card type",()=>{assert.equal(iron.type,"four");assert.equal(iron.size,5)});
check("Pair 2 is two-card type",()=>{assert.equal(pair2.type,"pair");assert.equal(pair2.size,2)});
check("Iron beats pair of 2",()=>assert.equal(T.compare(iron,pair2),true));
check("Pair 2 cannot beat iron",()=>assert.equal(T.compare(pair2,iron),false));
check("Iron can beat pair of A",()=>assert.equal(T.compare(iron,T.classify(["AC","AD"])),true));
check("Iron cannot beat single 2",()=>assert.equal(T.compare(iron,T.classify(["2S"])),false));
check("Straight cannot beat pair of 2",()=>assert.equal(T.compare(T.classify(["3C","4D","5H","6S","7C"]),pair2),false));
check("AI finds the legal iron reply",()=>assert(T.options(["7C","7D","7H","7S","3C"]).some(x=>T.compare(x.pattern,pair2))));
function game(){
 const g=T.newRoom("123456","Alice","token");
 g.players=[{name:"Alice",ai:false,hand:["7C","7D","7H","7S","3C"]},
 {name:"Bob",ai:false,hand:["2C","2D"]},{name:"Carol",ai:false,hand:["5C"]},
 {name:"AI",ai:true,hand:["4D"]}];
 g.phase="playing";g.first=false;g.turn=0;g.trick={player:1,cards:["2C","2D"],pattern:pair2};g.lastSeat=1;
 return g;
}
check("Actual turn allows iron to beat pair of 2",()=>{
 const g=game();T.setGame(g);
 T.play(0,["7C","7D","7H","7S","3C"]);
 assert.equal(g.trick.pattern.type,"four");assert.equal(g.phase,"finished");
});
check("Taunt appears in every player snapshot",()=>{
 const g=game();T.setGame(g);T.applyTaunt(1,"1");
 assert.equal(T.snapshot(0).taunt.id,"1");assert.equal(T.snapshot(2).taunt.player,1);
 assert(!Object.hasOwn(T.snapshot(0).players[1],"hand"));
});
check("Taunt cooldown rejects flood",()=>{
 T.setGame(game());T.applyTaunt(1,"2");
 assert.throws(()=>T.applyTaunt(1,"3"),/冷卻/);
});
check("Unknown taunt ID rejected",()=>{T.setGame(game());assert.throws(()=>T.applyTaunt(0,"999"),/未知/)});
check("AI cannot taunt",()=>{T.setGame(game());assert.throws(()=>T.applyTaunt(3,"1"),/真人/)});
check("Taunt disabled before game begins",()=>{
 const g=game();g.phase="lobby";T.setGame(g);
 assert.throws(()=>T.applyTaunt(0,"1"),/開始/);
});
check("Taunt is shown as safe text mini-card",()=>{
 T.setGame(game());T.applyTaunt(1,"4");T.renderTaunt(T.snapshot(0));
 assert(get("taunt-bubble").textContent.includes("Bob"));
 assert(get("taunt-bubble").textContent.includes("別緊張"));
});
check("All four taunt buttons wired",()=>{
 for(let i=1;i<=4;i++)assert.equal(typeof get("taunt-"+i).onclick,"function");
});
check("Network messages are routed to host validation",()=>{
 assert(html.includes('else if(data.type==="taunt")applyTaunt(c.seat,data.id)'));
});
console.log("PASS "+passed+" V0.5.3 regression tests");
