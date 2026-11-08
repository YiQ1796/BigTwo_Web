"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const {webcrypto}=require("node:crypto");

const html=fs.readFileSync("docs/index.html","utf8");
const elements=new Map();
function element(){
 const classes=new Set();
 return{
  style:{},dataset:{},textContent:"",disabled:false,children:[],
  classList:{
   add:value=>classes.add(value),
   remove:value=>classes.delete(value),
   contains:value=>classes.has(value),
   toggle:(value,enabled)=>enabled?classes.add(value):classes.delete(value)
  },
  setAttribute(){},append(...nodes){this.children.push(...nodes);},
  replaceChildren(...nodes){this.children=nodes;},
  click(){this.onclick?.();}
 };
}
const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};
let initialize=null;
const sandbox={
 window:{addEventListener:(name,listener)=>{if(name==="DOMContentLoaded")initialize=listener;}},
 document:{getElementById:get,addEventListener(){},createElement:element,createDocumentFragment:element},
 crypto:webcrypto,
 localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
 URLSearchParams,location:{search:"",pathname:"/"},history:{replaceState(){}},
 console,setTimeout,clearTimeout
};
const inline=html.match(/<script>\s*("use strict";[\s\S]*?)<\/script>/)?.[1];
assert(inline,"Missing game logic");
const inject='window.__qa={classify,compare,options,play,newRoom,renderResult,setGame:g=>{game=g;host=false},setHost:value=>{host=value}};\n';
const source=inline.replace("const urlRoom=new URLSearchParams",inject+"const urlRoom=new URLSearchParams");
assert.notEqual(source,inline,"Missing injection point");
vm.runInNewContext(source,sandbox);
initialize();
const rules=sandbox.window.__qa;
const test=(name,fn)=>{fn();console.log("PASS",name)};

// User's exact order: A2345, 34567, 45678, ..., 10JQKA, 23456.
const sequences=[
 ["A","2","3","4","5"],
 ["3","4","5","6","7"],
 ["4","5","6","7","8"],
 ["5","6","7","8","9"],
 ["6","7","8","9","10"],
 ["7","8","9","10","J"],
 ["8","9","10","J","Q"],
 ["9","10","J","Q","K"],
 ["10","J","Q","K","A"],
 ["2","3","4","5","6"]
];
const suits=["C","D","H","S"];
const withSuits=(sequence,assignment)=>sequence.map((rank,index)=>rank+assignment[index]);
const mix=sequence=>withSuits(sequence,["C","D","H","S","C"]);
test("all ten accepted straights are ranked in precisely the stated order",()=>{
 const patterns=sequences.map(sequence=>rules.classify(mix(sequence)));
 for(const [i,pattern] of patterns.entries()){
  assert(pattern,"Missing valid straight "+sequences[i].join("-"));
  assert.equal(pattern.type,"straight");
  assert.equal(pattern.key[0],i);
  if(i>0){
   assert(rules.compare(pattern,patterns[i-1]),"Higher straight cannot beat previous order");
   assert(!rules.compare(patterns[i-1],pattern),"Smaller straight wrongly wins");
  }
 }
});
test("A2345 is weakest while 23456 is strongest",()=>{
 assert(rules.compare(rules.classify(mix(sequences[9])),rules.classify(mix(sequences[8]))));
 assert(rules.compare(rules.classify(mix(sequences[1])),rules.classify(mix(sequences[0]))));
 assert(!rules.compare(rules.classify(mix(sequences[0])),rules.classify(mix(sequences[1]))));
});
test("same straight compares the suit of its final sequence card",()=>{
 for(const sequence of sequences){
  const a=withSuits(sequence,["H","C","C","D","H"]);
  const b=withSuits(sequence,["S","D","D","S","S"]);
  const stronger=rules.classify(b),weaker=rules.classify(a);
  assert(rules.compare(stronger,weaker),"Higher end-card suit must win "+sequence.join("-"));
  assert(!rules.compare(weaker,stronger));
 }
 // For 23456 the final card is 6, not 2; a 2 of spades cannot break that rule.
 const highTwo=rules.classify(["2S","3C","4D","5H","6C"]);
 const highSix=rules.classify(["2C","3D","4H","5C","6S"]);
 assert(rules.compare(highSix,highTwo));
});
test("invalid wrapped sequences, duplicates and unrelated cards are rejected",()=>{
 assert.equal(rules.classify(["JC","QD","KH","AS","2C"]),null);
 assert.equal(rules.classify(["2C","3D","4H","5S","7C"]),null);
 assert.equal(rules.classify(["3C","3C","4D","5H","6S"]),null);
});
test("straight flush follows the same special straight sequence ordering",()=>{
 const weakest=rules.classify(["AH","2H","3H","4H","5H"]);
 const strongest=rules.classify(["2C","3C","4C","5C","6C"]);
 const second=rules.classify(["10S","JS","QS","KS","AS"]);
 assert.equal(weakest.type,"sf");
 assert.equal(strongest.type,"sf");
 assert(rules.compare(strongest,second));
 assert(rules.compare(second,weakest));
 assert(!rules.compare(weakest,second));
});
test("four-of-a-kind must compare its four-card rank, not always win",()=>{
 const five=rules.classify(["5C","5D","5H","5S","3C"]);
 const nine=rules.classify(["9C","9D","9H","9S","2C"]);
 const flush=rules.classify(["2S","3S","4S","5S","6S"]);
 assert(rules.compare(nine,five));
 assert(!rules.compare(five,nine));
 assert(rules.compare(flush,nine));
 assert(!rules.compare(nine,flush));
 assert(rules.compare(five,rules.classify(["2S"])));
});
test("legal screenshot 23456 can beat 678910 straight in the actual game",()=>{
 const g=rules.newRoom("123456","Human","secret");
 g.players=[
  {name:"Human",ai:false,hand:["2S","3C","4D","5H","6C","7D"]},
  {name:"Bot1",ai:true,hand:[]},{name:"Bot2",ai:true,hand:[]},{name:"Bot3",ai:true,hand:[]}
 ];
 g.phase="playing";g.first=false;g.turn=0;
 const previous=["6D","7S","8D","9C","10S"];
 g.trick={cards:previous,pattern:rules.classify(previous),player:1};
 rules.setGame(g);
 rules.play(0,["2S","3C","4D","5H","6C"]);
 assert.equal(g.trick.pattern.type,"straight");
 assert.equal(g.trick.pattern.key[0],9);
 assert.equal(g.players[0].hand.length,1);
});
test("regular straight still cannot be played over a pair",()=>{
 const highest=rules.classify(["2S","3C","4D","5H","6C"]);
 const pair=rules.classify(["KC","KS"]);
 assert(!rules.compare(highest,pair));
});
test("standalone three-of-a-kind is invalid and full house requires exactly 3+2",()=>{
 assert.equal(rules.classify(["7C","7D","7H"]),null);
 assert.equal(rules.classify(["7C","7D","7H","9C","10C"]),null);
 assert.equal(rules.classify(["7C","7D","8C","8D","10H"]),null);
 const full=rules.classify(["7C","7D","7H","9C","9D"]);
 assert(full&&full.type==="full");
 const iron=rules.classify(["7C","7D","7H","7S","9D"]);
 assert(iron&&iron.type==="four");
});
test("five same-suit cards are valid ONLY when they form a listed straight flush",()=>{
 assert.equal(rules.classify(["3H","5H","7H","9H","JH"]),null);
 assert.equal(rules.classify(["2C","4C","6C","8C","10C"]),null);
 assert.equal(rules.classify(["2S","3S","4S","5S","6S"]).type,"sf");
 assert.equal(rules.classify(["AS","2S","3S","4S","5S"]).type,"sf");
 // AI gets the same legal-move constraints as players.
 const hand=["3H","5H","7H","9H","JH"];
 assert(!rules.options(hand).some(move=>move.cards.length===5));
 assert(!rules.options(["7C","7D","7H"]).some(move=>move.cards.length===3));
});
test("engine rejects standalone triples and non-consecutive flushes",()=>{
 const g=rules.newRoom("123456","Player","token");
 g.players=[
  {name:"Player",ai:false,hand:["3H","5H","7H","9H","JH","7C","7D","7S"]},
  {name:"Bot1",ai:true,hand:[]},{name:"Bot2",ai:true,hand:[]},{name:"Bot3",ai:true,hand:[]}
 ];
 g.phase="playing";g.first=false;g.turn=0;rules.setGame(g);
 assert.throws(()=>rules.play(0,["3H","5H","7H","9H","JH"]),/不是有效牌型/);
 assert.throws(()=>rules.play(0,["7H","7C","7D"]),/不是有效牌型/);
 assert.equal(g.players[0].hand.length,8);
});
test("AI legal move generator recognizes both special straights",()=>{
 const hand=["2S","3C","4D","5H","6C","7D","8H"];
 const candidates=rules.options(hand);
 assert(candidates.some(item=>item.pattern.type==="straight"&&item.pattern.key[0]===9));
});
test("win/loss dialog shows a visible result based on local seat",()=>{
 const state={room:"123456",round:2,phase:"finished",champion:2,me:0,
  players:[{name:"Me"},{name:"Bot1"},{name:"Bot2"},{name:"Bot3"}]};
 rules.renderResult(state);
 assert(get("result-title").textContent.includes("落敗"));
 assert(get("result-detail").textContent.includes("Bot2"));
 assert(!get("result-overlay").classList.contains("hidden"));
 assert(get("result-next").classList.contains("hidden"),"Only host can start the next round");
 get("result-stay").click();
 assert(get("result-overlay").classList.contains("hidden"));
 rules.renderResult(state);
 assert(get("result-overlay").classList.contains("hidden"),"Dismissed result should stay hidden");
 rules.setHost(true);
 rules.renderResult({...state,round:3,champion:0});
 assert(get("result-title").textContent.includes("恭喜獲勝"));
 assert(!get("result-next").classList.contains("hidden"));
});
console.log("PASS V0.5.9 ten-straight, suit-tiebreak, iron, and victory dialog regression");
