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
const inject='window.__testRules={classify,compare,play,pass,startRound,newRoom,deck,shuffle,randomIndex,setGame:g=>{game=g;host=false},getGame:()=>game};\n';
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
 g.players=[{name:"A",hand:["4C","5D","6H","7S","8C","9C"],ai:false},{name:"B",hand:["10C"],ai:false},{name:"C",hand:["JC"],ai:false},{name:"D",hand:["QC"],ai:false}];
 g.phase="playing";g.turn=1;g.first=false;g.lastSeat=0;g.trick={cards:["2S"],pattern:r.classify(["2S"]),player:0};
 r.setGame(g);r.pass(1);r.pass(2);r.pass(3);
 assert.equal(g.turn,0);assert.equal(g.trick,null);assert.equal(g.passes,0);
 r.play(0,["4C","5D","6H","7S","8C"]);
 assert.equal(g.trick.pattern.type,"straight");
});
// A single shuffled 52-card deck must produce four disjoint, equally sized hands.
const makeRoom=()=>{
 const g=r.newRoom("123456","QA","token");
 g.players=[
  {name:"Human",hand:[],ai:false},
  {name:"CPU 1",hand:[],ai:true},
  {name:"CPU 2",hand:[],ai:true},
  {name:"CPU 3",hand:[],ai:true}
 ];
 return g;
};
test("deck has exactly 52 distinct cards",()=>{
 const d=r.deck();
 assert.equal(d.length,52);
 assert.equal(new Set(d).size,52);
 assert(d.includes("3C")&&d.includes("2S"));
});
test("each round leads from its own three of clubs holder",()=>{
 const g=makeRoom();r.setGame(g);
 for(let round=1;round<=100;round++){
  g.phase="lobby";
  g.winnerSeat=(round+2)%4; // Previous winner must not control the next lead.
  r.startRound();
  assert.equal(g.round,round);
  assert.equal(g.first,true);
  assert.equal(g.turn,g.players.findIndex(p=>p.hand.includes("3C")));
  assert.equal(g.players.filter(p=>p.hand.includes("3C")).length,1);
 }
});
test("later rounds also require the first move to contain three of clubs",()=>{
 const g=makeRoom();g.round=3;delete g.winnerSeat;r.setGame(g);r.startRound();
 const leader=g.turn;
 const otherCard=g.players[leader].hand.find(card=>card!=="3C");
 assert(otherCard);
 assert.throws(()=>r.play(leader,[otherCard]),/第一手牌必須包含梅花 3/);
 r.play(leader,["3C"]);
 assert.equal(g.first,false);
 assert.equal(g.trick.player,leader);
});
test("shuffling cannot change card count or duplicate cards",()=>{
 for(let round=0;round<200;round++){
  const shuffled=r.shuffle(r.deck());
  assert.equal(shuffled.length,52);
  assert.equal(new Set(shuffled).size,52);
 }
});
test("random deal gives every human or AI seat comparable high-card odds",()=>{
 const g=makeRoom();r.setGame(g);
 const draws=6000;
 const samples={"3C":[0,0,0,0],"2S":[0,0,0,0],"AS":[0,0,0,0]};
 const expectedDeck=new Set(r.deck());
 for(let round=0;round<draws;round++){
  g.phase="lobby";r.startRound();
  const allCards=g.players.flatMap(player=>player.hand);
  assert.equal(allCards.length,52);
  assert.equal(new Set(allCards).size,52);
  assert(allCards.every(card=>expectedDeck.has(card)));
  g.players.forEach((player,seat)=>{
   assert.equal(player.hand.length,13);
   for(const card of Object.keys(samples)){
    if(player.hand.includes(card))samples[card][seat]++;
   }
  });
 }
 // Every seat has expectation draws/4; wide tolerance avoids a flaky random test.
 const expected=draws/4;
 for(const [card,counts] of Object.entries(samples)){
  assert.equal(counts.reduce((sum,n)=>sum+n,0),draws);
  for(let seat=0;seat<4;seat++){
   assert(Math.abs(counts[seat]-expected)<200,
    card+" distribution unexpectedly uneven at seat "+seat+": "+counts.join(","));
  }
 }
 console.log("FAIR-DEAL seat samples",JSON.stringify(samples));
});
console.log("PASS all V0.5.7 rules and lead scenarios");
