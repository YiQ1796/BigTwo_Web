"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const {webcrypto}=require("node:crypto");
const html=fs.readFileSync("docs/index.html","utf8");
const aiCode=fs.readFileSync("docs/ai-strategy.js","utf8");
const sandbox={window:{addEventListener:(name,fn)=>{if(name==="DOMContentLoaded")sandbox.ready=fn},BIG_TWO_CARD_IMAGES:{}},
 crypto:webcrypto,document:{addEventListener(){},getElementById:()=>({style:{},classList:{add(){},remove(){},toggle(){}},setAttribute(){}})},
 localStorage:{getItem:()=>null,setItem(){},removeItem(){}},URLSearchParams,location:{search:"",pathname:"/"},console,setTimeout,clearTimeout};
vm.runInNewContext(aiCode,sandbox);
assert.equal(typeof sandbox.window.BigTwoAiStrategy.chooseMove,"function");
const inline=html.match(/<script>\s*("use strict";[\s\S]*?)<\/script>/)?.[1];
assert(inline,"Embedded game script must exist");
const inject='window.__testRules={classify,options,compare,play,newRoom,setGame:g=>{game=g;host=false},getGame:()=>game};\n';
const transformed=inline.replace("const urlRoom=new URLSearchParams",inject+"const urlRoom=new URLSearchParams");
assert.notEqual(transformed,inline);
vm.runInNewContext(transformed,sandbox);
assert.equal(typeof sandbox.ready,"function");
sandbox.ready();
const r=sandbox.window.__testRules,ai=sandbox.window.BigTwoAiStrategy.chooseMove;
const test=(name,fn)=>{fn();console.log("PASS",name)};
test("single and pair",()=>{assert.equal(r.classify(["3C"]).type,"single");assert.equal(r.classify(["8C","8S"]).type,"pair");assert.equal(r.classify(["8C","9C"]),null)});
test("standalone three-of-kind forbidden",()=>assert.equal(r.classify(["7C","7D","7S"]),null));
test("full house exactly triple plus pair",()=>{assert.equal(r.classify(["7C","7D","7H","9S","9C"]).type,"full");assert.equal(r.classify(["7C","7D","7H","9S","10C"]),null)});
test("four-of-a-kind requires fifth kicker",()=>{assert.equal(r.classify(["8C","8D","8H","8S","2C"]).type,"four");assert.equal(r.classify(["8C","8D","8H","8S"]),null)});
test("straight accepts any suits, five adjacent ranks",()=>{assert.equal(r.classify(["6C","7S","8D","9C","10H"]).type,"straight");assert.equal(r.classify(["6C","7S","8D","10C","JH"]),null)});
test("straight flush requires same suit",()=>{assert.equal(r.classify(["6H","7H","8H","9H","10H"]).type,"sf");assert.equal(r.classify(["6H","7H","8H","9H","10C"]).type,"straight")});
test("five card hierarchy",()=>{const sf=r.classify(["6H","7H","8H","9H","10H"]),four=r.classify(["8C","8D","8H","8S","2C"]),full=r.classify(["7C","7D","7H","9S","9C"]);assert(r.compare(sf,four));assert(r.compare(four,full));assert(!r.compare(full,sf))});
test("AI generator excludes 3-card moves",()=>assert(r.options(["7C","7D","7H","9C","9D","2S"]).every(x=>[1,2,5].includes(x.cards.length))));
function choose(hand,freeTurn=true,opponentMinCards=8,beat=null){
 const legal=r.options(hand).filter(x=>!beat||r.compare(x.pattern,beat));
 return ai({hand,legalMoves:legal,freeTurn,opponentMinCards});
}
test("AI free lead uses low single, preserves A and 2",()=>{const m=choose(["3C","5D","7H","9S","JC","AS","2S"]);assert.equal(m.cards.join(","),"3C")});
test("AI sheds low straight without burning high cards",()=>{const m=choose(["3C","4D","5H","6S","7C","AS","2S"]);assert.equal(m.cards.length,5);assert(!m.cards.includes("AS")&&!m.cards.includes("2S"))});
test("AI prefers inexpensive full house to premium cards",()=>{const m=choose(["6C","6D","6H","9C","9D","AS","2S"]);assert.equal(m.pattern.type,"full");assert(!m.cards.includes("AS")&&!m.cards.includes("2S"))});
test("AI may PASS rather than waste premium cards on ordinary response",()=>{const beat=r.classify(["9H"]);const m=choose(["3C","4D","5C","AS","2S"],false,8,beat);assert.equal(m,null)});
test("AI uses low beating card when available",()=>{const m=choose(["3C","4D","10D","AS","2S"],false,8,r.classify(["9H"]));assert.equal(m.cards.join(","),"10D")});
test("AI answers urgent opponent even with A",()=>{const m=choose(["3C","4D","5C","AS","2S"],false,1,r.classify(["KH"]));assert(m&&m.cards.includes("AS"))});
test("AI plays final 2 to finish",()=>{const m=choose(["2S"]);assert.deepEqual(Array.from(m.cards),["2S"])});
test("game engine refuses standalone triple, permits full house",()=>{
 const g=r.newRoom("ABCDEF","QA","token");g.players=[{name:"QA",hand:["7C","7D","7H","9S","9C","2S"],ai:false},{name:"B",hand:[],ai:false},{name:"C",hand:[],ai:false},{name:"D",hand:[],ai:false}];g.phase="playing";g.turn=0;g.first=false;
 r.setGame(g);assert.throws(()=>r.play(0,["7C","7D","7H"]),/有效牌型/);assert.equal(g.players[0].hand.length,6);
 r.play(0,["7C","7D","7H","9S","9C"]);assert.equal(g.trick.pattern.type,"full");assert.equal(g.playedCards.length,5);
});
console.log("PASS all 16 Big Two rules/AI regression scenarios");
