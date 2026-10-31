"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const {webcrypto}=require("node:crypto");

const html=fs.readFileSync("docs/index.html","utf8");
const sandbox={
  window:{addEventListener:(name,fn)=>{if(name==="DOMContentLoaded")sandbox.ready=fn}},
  crypto:webcrypto,
  document:{addEventListener(){},getElementById:()=>({style:{},classList:{add(){},remove(){},toggle(){}},setAttribute(){}})},
  localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
  URLSearchParams,
  location:{search:"",pathname:"/"},
  console,
  setTimeout,
  clearTimeout
};

const inline=html.match(/<script>\s*("use strict";[\s\S]*?)<\/script>/)?.[1];
assert(inline,"Embedded game script must exist");
const inject='window.__testRules={classify,compare,play,pass,startRound,newRoom,setGame:g=>{game=g;host=false},getGame:()=>game};\n';
const transformed=inline.replace("const urlRoom=new URLSearchParams",inject+"const urlRoom=new URLSearchParams");
vm.runInNewContext(transformed,sandbox);
sandbox.ready();
const r=sandbox.window.__testRules;

const test=(name,fn)=>{fn();console.log("PASS",name)};
const four=r.classify(["9C","9D","9H","9S","4D"]);
const sf=r.classify(["6H","7H","8H","9H","10H"]);
const single=r.classify(["8D"]);
const pair=r.classify(["2C","2S"]);
const straight=r.classify(["6C","7D","8S","9C","10H"]);
const full=r.classify(["7C","7D","7H","9S","9C"]);

test("four-of-a-kind can beat a single",()=>assert(r.compare(four,single)));
test("four-of-a-kind can beat a pair, including pair of 2",()=>assert(r.compare(four,pair)));
test("four-of-a-kind can beat a straight",()=>assert(r.compare(four,straight)));
test("four-of-a-kind can beat a full house",()=>assert(r.compare(four,full)));
test("straight flush is higher than four-of-a-kind",()=>{assert(r.compare(sf,four));assert(!r.compare(four,sf))});
test("game engine permits four-of-a-kind over a single",()=>{
  const g=r.newRoom("123456","QA","token");
  g.players=[
    {name:"QA",hand:["4D","9C","9D","9H","9S"],ai:false},
    {name:"B",hand:[],ai:false},{name:"C",hand:[],ai:false},{name:"D",hand:[],ai:false}
  ];
  g.phase="playing";g.turn=0;g.first=false;
  g.trick={cards:["8D"],pattern:single,player:1};
  r.setGame(g);
  r.play(0,["4D","9C","9D","9H","9S"]);
  assert.equal(g.trick.pattern.type,"four");
  assert.equal(g.players[0].hand.length,0);
});

test("three passes reset trick and return unrestricted lead",()=>{
 const g=r.newRoom("123456","QA","token");
 g.players=[{name:"A",hand:["4C","5C","6C","7C","8C","9C"],ai:false},{name:"B",hand:["10C"],ai:false},{name:"C",hand:["JC"],ai:false},{name:"D",hand:["QC"],ai:false}];
 g.phase="playing";g.turn=1;g.first=false;g.lastSeat=0;g.trick={cards:["2S"],pattern:r.classify(["2S"]),player:0};
 r.setGame(g);r.pass(1);r.pass(2);r.pass(3);
 assert.equal(g.turn,0);assert.equal(g.trick,null);assert.equal(g.passes,0);
 r.play(0,["4C","5C","6C","7C","8C"]);
 assert.equal(g.trick.pattern.type,"straight");
});
test("subsequent round starts with previous winner including seat zero",()=>{
 const g=r.newRoom("123456","QA","token");g.players=[{name:"A",hand:[],ai:false},{name:"B",hand:[],ai:false},{name:"C",hand:[],ai:false},{name:"D",hand:[],ai:false}];
 g.phase="lobby";g.round=1;g.winnerSeat=2;r.setGame(g);r.startRound();assert.equal(g.turn,2);
});
test("missing previous winner is rejected rather than choosing seat zero",()=>{
 const g=r.newRoom("123456","QA","token");g.players=[{name:"A",hand:[],ai:false},{name:"B",hand:[],ai:false},{name:"C",hand:[],ai:false},{name:"D",hand:[],ai:false}];
 g.phase="lobby";g.round=1;delete g.winnerSeat;r.setGame(g);assert.throws(()=>r.startRound(),/上一局贏家資料遺失/);
});
console.log("PASS all V0.5.7 rules and lead scenarios");
