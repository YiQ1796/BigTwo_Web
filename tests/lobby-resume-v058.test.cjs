"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const {webcrypto}=require("node:crypto");

const html=fs.readFileSync("docs/index.html","utf8");
const css=fs.readFileSync("docs/theme.css","utf8");
for(const id of ["resume-choice","resume-continue","resume-new","entry-form","waiting-room","waiting-slots","waiting-invite","waiting-start"]){
 assert(html.includes('id="'+id+'"'),"Missing UI element "+id);
}
assert(css.includes("#game.waiting-room-active .table-layout{display:none}"),"Waiting room must hide active table layout");

function harness({saved=null,invite=""}={}){
 const nodes=new Map(),listeners={},storage=new Map();
 if(saved)storage.set("bigtwo-online-v04",JSON.stringify(saved));
 let ready=null,peerCount=0;
 function element(){
  const classes=new Set();
  return {style:{},dataset:{},children:[],value:"",textContent:"",className:"",disabled:false,
   classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle:(c,force)=>{const shouldAdd=force===undefined?!classes.has(c):!!force;shouldAdd?classes.add(c):classes.delete(c);return shouldAdd;}},
   setAttribute(name,value){this[name]=value;},
   append(...children){this.children.push(...children);},
   replaceChildren(...children){this.children=[...children];},
   click(){this.onclick?.();}
  };
 }
 const get=id=>{if(!nodes.has(id)){const node=element();if(["resume-choice","waiting-room","connection-hint","taunt-bubble","toast"].includes(id))node.classList.add("hidden");nodes.set(id,node);}return nodes.get(id)};
 class FakePeer{
  constructor(){peerCount++;this.listeners=new Map();this.destroyed=false;this.disconnected=false;}
  on(type,callback){this.listeners.set(type,callback);return this;}
  destroy(){this.destroyed=true;}
 }
 const sandbox={
  window:{BIG_TWO_CARD_IMAGES:{},addEventListener:(event,callback)=>{listeners[event]=callback;if(event==="DOMContentLoaded")ready=callback;}},
  document:{visibilityState:"visible",getElementById:get,createElement:element,createDocumentFragment:element,addEventListener(){}},
  Peer:FakePeer,crypto:webcrypto,URLSearchParams,console,
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
  location:{search:invite?"?room="+invite:"",pathname:"/BigTwo_Web/",origin:"https://example.test"},
  history:{replaceState(){}},navigator:{clipboard:{writeText:async()=>{}}},
  setTimeout:()=>1,clearTimeout(){}
 };
 const script=html.match(/<script>\s*("use strict";[\s\S]*?)<\/script>/)?.[1];
 assert(script,"Embedded game script should exist");
 const hook='window.__ux={newRoom,render,snapshot,canResume,setGame:g=>{game=g;host=false},setHost:value=>{host=value},getGame:()=>game};\n';
 const injected=script.replace("const urlRoom=new URLSearchParams",hook+"const urlRoom=new URLSearchParams");
 assert.notEqual(script,injected,"Test injection point missing");
 vm.runInNewContext(injected,sandbox,{timeout:1500});
 ready();
 return {get,storage,qa:sandbox.window.__ux,getPeerCount:()=>peerCount};
}
const previous={room:"123456",name:"Host",token:"a".repeat(36),host:true,game:{room:"123456",phase:"lobby",round:2,players:[{name:"Host",token:"a".repeat(36),ai:false,hand:[]}],log:[]}};
{
 const h=harness({saved:previous});
 assert.equal(h.getPeerCount(),0,"Saved host must not auto-connect");
 assert(!h.get("resume-choice").classList.contains("hidden"),"Restore choice should be visible");
 assert(h.get("entry-form").classList.contains("hidden"),"New room controls should not precede explicit restore choice");
 assert(h.get("resume-summary").textContent.includes("123456"));
 h.get("resume-new").click();
 assert.equal(h.storage.has("bigtwo-online-v04"),false,"Restart must discard saved credentials and game");
 assert(h.get("resume-choice").classList.contains("hidden"),"Restore choice should close");
 assert(!h.get("entry-form").classList.contains("hidden"),"New game form should appear");
 assert.equal(h.getPeerCount(),0,"Restart must not reconnect old game");
 console.log("PASS restart shows fresh lobby without automatic recovery");
}
{
 const h=harness({saved:previous});
 h.get("resume-continue").click();
 assert.equal(h.getPeerCount(),1,"Only explicit resume may reconnect old host");
 assert.equal(h.qa.getGame().room,"123456");
 console.log("PASS saved host connection begins only after pressing resume");
}
{
 const h=harness({saved:{...previous,host:false,game:null},invite:"123456"});
 assert.equal(h.getPeerCount(),0,"Guest invite must not auto-rejoin old room");
 assert(!h.get("resume-choice").classList.contains("hidden"));
 console.log("PASS guest invite with matching old room offers resume choice");
}
{
 const h=harness({saved:previous,invite:"654321"});
 assert(h.get("resume-choice").classList.contains("hidden"),"Unrelated invitation must take precedence");
 assert.equal(h.get("code").value,"654321");
 assert.equal(h.getPeerCount(),0);
 console.log("PASS different invitation does not restore unrelated saved room");
}
{
 const h=harness();
 const g=h.qa.newRoom("123456","Host","a".repeat(36));
 g.players.push({name:"Friend",token:"b".repeat(36),ai:false,hand:[]});
 h.qa.setGame(g);
 const snapshot=h.qa.snapshot(0);
 assert.equal(snapshot.players[0].online,true);
 assert.equal(snapshot.players[1].online,false);
 h.qa.render(snapshot);
 assert(!h.get("waiting-room").classList.contains("hidden"),"Waiting room visible before start");
 assert(h.get("game").classList.contains("waiting-room-active"),"Table is visually hidden before start");
 assert(h.get("waiting-count").textContent.includes("1 / 4"));
 assert(h.get("waiting-count").textContent.includes("暫時離線"));
 const slots=h.get("waiting-slots").children[0].children;
 assert.equal(slots.length,4);
 assert(slots[1].children[1].children[1].textContent==="Friend");
 assert(slots[2].className.includes("slot-empty"));
 assert(h.get("waiting-start").classList.contains("hidden"),"Guest must not start game");
 h.qa.setHost(true);
 h.qa.render(snapshot);
 assert(!h.get("waiting-start").classList.contains("hidden"),"Host can start game");
 g.phase="playing";h.qa.render({...snapshot,phase:"playing"});
 assert(h.get("waiting-room").classList.contains("hidden"),"Waiting room must disappear when game starts");
 assert(!h.get("game").classList.contains("waiting-room-active"));
 console.log("PASS four-seat lobby shows online/offline/empty seats and hides on start");
}
console.log("PASS V0.5.8 lobby and explicit-session-choice regression tests");
