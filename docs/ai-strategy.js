/* Big Two AI v0.5.2
   Pure deterministic move selection: never sees hidden opponent cards.
   Only already validated legalMoves from the host rules engine are considered. */
(function registerBigTwoStrategy(root){
 "use strict";
 const RANKS=["3","4","5","6","7","8","9","10","J","Q","K","A","2"];
 function rankOf(id){return RANKS.indexOf(String(id).slice(0,-1));}
 function countsOf(cards){
  const counts=new Map();
  for(const card of cards){const rank=rankOf(card);counts.set(rank,(counts.get(rank)||0)+1);}
  return counts;
 }
 function moveScore(move,hand,freeTurn,urgent){
  const played=move.cards,remaining=hand.filter(id=>!played.includes(id));
  // A direct win always outranks conserving a high card.
  if(remaining.length===0)return -100000;
  const highCostScale=urgent?0.12:1;
  let cost=0;
  for(const card of played){
   const rank=rankOf(card);
   cost+=Math.max(0,rank)*2;
   if(rank===11)cost+=78*highCostScale; // A as late-round control
   if(rank===12)cost+=138*highCostScale; // 2 is the strongest rank
  }
  // Lead with economical multi-card groups, not necessarily the biggest combination.
  const shedding=freeTurn?({1:0,2:-43,5:-155}[played.length]||0):
    ({1:0,2:-15,5:-22}[played.length]||0);
  cost+=shedding;
  const before=countsOf(hand),after=countsOf(remaining);
  for(const [rank,count] of before){
   const leftover=after.get(rank)||0;
   // Breaking up a pair or a triple to lead a lone card is usually inefficient.
   if(count>=2&&leftover===1&&played.some(card=>rankOf(card)===rank))cost+=16;
  }
  // If the next opponent is about to win, blocking them and shedding cards matter more.
  if(urgent)cost-=played.length*26;
  return cost;
 }
 function chooseMove({hand,legalMoves,freeTurn,opponentMinCards}={}){
  if(!Array.isArray(hand)||!Array.isArray(legalMoves)||!legalMoves.length)return null;
  const urgent=Number(opponentMinCards)<=2||hand.length<=3;
  const candidates=legalMoves.filter(m=>m&&Array.isArray(m.cards)&&
    [1,2,5].includes(m.cards.length)&&m.cards.every(card=>hand.includes(card)));
  if(!candidates.length)return null;
  const scored=candidates.map(move=>({move,score:moveScore(move,hand,!!freeTurn,urgent)}));
  scored.sort((a,b)=>a.score-b.score||
    (a.move.cards.join(",")<b.move.cards.join(",")?-1:1));
  // Save A / 2 on an ordinary response if the only answers are very costly.
  // Never PASS while holding the initiative, facing an imminent winner, or able to finish.
  if(!freeTurn&&!urgent&&scored[0].score>65)return null;
  return scored[0].move;
 }
 root.BigTwoAiStrategy=Object.freeze({chooseMove});
})(window);
