from pathlib import Path

INDEX = Path("docs/index.html")
text = INDEX.read_text(encoding="utf-8")

old = """function compare(a,b){if(!a||!b)return false;
// House rule: a legal five-card four-of-a-kind may trump any two-card pair,
// including pairs of J, A, and 2. Other unequal-size types remain incompatible.
if(a.type===\"four\"&&b.type===\"pair\")return true;
if(a.size!==b.size)return false;if(a.size===5&&a.level!==b.level)return a.level>b.level;for(let i=0;i<a.key.length;i++){if(a.key[i]!==b.key[i])return a.key[i]>b.key[i];}return false;}"""

new = """function compare(a,b){if(!a||!b)return false;
// House rules: straight flush is the highest hand; four-of-a-kind beats
// every other hand type. Same-type hands still use their normal size/key rules.
if(a.type===\"sf\")return b.type!==\"sf\"||a.key[0]>b.key[0]||(a.key[0]===b.key[0]&&a.key[1]>b.key[1]);
if(b.type===\"sf\")return false;
if(a.type===\"four\")return true;
if(b.type===\"four\")return false;
if(a.size!==b.size)return false;if(a.size===5&&a.level!==b.level)return a.level>b.level;for(let i=0;i<a.key.length;i++){if(a.key[i]!==b.key[i])return a.key[i]>b.key[i];}return false;}"""

if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit("Expected V0.5.6 compare() implementation was not found")

text = text.replace("猴王金典牌組 · 好友連線 · v0.5.6", "猴王金典牌組 · 好友連線 · v0.5.7", 1)
text = text.replace("relay-transport.js?v=056", "relay-transport.js?v=057", 1)
text = text.replace("theme.css?v=056", "theme.css?v=057", 1)
INDEX.write_text(text, encoding="utf-8")
print("Applied Big Two V0.5.7 rule patch")
