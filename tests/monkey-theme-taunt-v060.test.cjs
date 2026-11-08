"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const {webcrypto}=require("node:crypto");
const html=fs.readFileSync("docs/index.html","utf8");
const css=fs.readFileSync("docs/theme.css","utf8");

// The taunt status strip must be a sibling of the table instead of its child.
// The table clips descendants; it must never clip or obscure taunt messages.
const playStart=html.indexOf('<div class="play-column">');
const bannerStart=html.indexOf('<div class="taunt-message-bar"',playStart);
const tableStart=html.indexOf('<div class="table">',playStart);
assert(playStart>=0&&bannerStart>playStart&&tableStart>bannerStart,
 "Taunt message strip must precede the table within the play column");
assert.equal((html.match(/id="taunt-bubble"/g)||[]).length,1);
assert(html.includes('id="taunt-idle"'));
assert(css.includes(".taunt-message-bar .taunt-bubble{"));
assert(css.includes("position:static;top:auto;left:auto"),"Taunt must not be positioned inside the table");
assert(css.includes("#c88b59"),"Playing surface should be warm caramel");
assert(css.includes("#ffd18b"),"Theme should use honey-gold accents");
assert(!css.includes("#285941")&&!css.includes("#1a4a37"),"Old dark-green table should be removed");
console.log("PASS warm Monkey Sanmao palette and independent taunt message placement");

function element(){
 const entries=new Set(["hidden"]);
 return {style:{},dataset:{},textContent:"",
  classList:{add:x=>entries.add(x),remove:x=>entries.delete(x),contains:x=>entries.has(x),toggle:(x,v)=>{const on=v===undefined?!entries.has(x):!!v;on?entries.add(x):entries.delete(x)}},
  setAttribute(){}
 };
}
const els=new Map();
const get=id=>{if(!els.has(id))els.set(id,element());return els.get(id)};
let ready;
const sandbox={
 window:{addEventListener:(name,fn)=>{if(name==="DOMContentLoaded")ready=fn}},
 document:{getElementById:get,addEventListener(){}},
 crypto:webcrypto,URLSearchParams,location:{search:"",pathname:"/"},
 localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
 console,setTimeout:()=>1,clearTimeout(){}
};
const script=html.match(/<script>\s*("use strict";[\s\S]*?)<\/script>/)?.[1];
assert(script);
const injected=script.replace("const urlRoom=new URLSearchParams",
 'window.__tauntTest={renderTaunt};\nconst urlRoom=new URLSearchParams');
vm.runInNewContext(injected,sandbox);
ready();
const st={room:"123456",round:1,phase:"playing",
 players:[{name:"Player"},{name:"Bot"}],
 taunt:{id:"5",player:1,at:Date.now(),seq:1}};
sandbox.window.__tauntTest.renderTaunt(st);
assert(!get("taunt-bubble").classList.contains("hidden"));
assert(get("taunt-bubble").textContent.includes("是要等多久"));
assert(get("taunt-idle").classList.contains("hidden"));
sandbox.window.__tauntTest.renderTaunt({...st,taunt:null});
assert(get("taunt-bubble").classList.contains("hidden"));
assert(!get("taunt-idle").classList.contains("hidden"));
console.log("PASS taunts use visible separate banner and restore idle text");
