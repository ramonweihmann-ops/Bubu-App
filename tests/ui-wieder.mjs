import { chromium } from "playwright";
import { execSync } from "node:child_process";
const AUS = process.env.HQ_BILDER || "/tmp";
const URL = "http://127.0.0.1:8792/app/";
const sql = (s) => execSync(`cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --command "${s}" > /dev/null 2>&1`);

let fehler = 0;
const pruefe = (n, ist, soll) => {
  const ok = ist === soll;
  if (!ok) fehler++;
  console.log(`${ok ? "  ok  " : "  FEHL"} ${n}: ${JSON.stringify(ist)}${ok ? "" : " soll=" + JSON.stringify(soll)}`);
};

sql("delete from bewerbungen; delete from claims; delete from proposal_votes; delete from proposals; delete from ereignisse");
sql("delete from quests where wiederkehrend = 1");
sql("update quests set wiederkehrend = 0, faellig_am = null");

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
async function seiteFuer(token) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: "hq_sitzung", value: token, domain: "127.0.0.1", path: "/" }]);
  const s = await ctx.newPage();
  s.on("pageerror", (e) => { console.log("  FEHL pageerror: " + e.message); fehler++; });
  s.on("console", (m) => { if (m.type() === "error" && !/ERR_NAME_NOT_RESOLVED|favicon|vibrate|status of 40/.test(m.text())) { console.log("  FEHL console: " + m.text()); fehler++; } });
  return s;
}
const momenteWeg = async (s) => {
  for (let i = 0; i < 10 && (await s.locator("#celebrate[data-open]").count()); i++) {
    await s.click("#celebrate [data-schliessen]"); await s.waitForTimeout(300);
  }
};
const laden = async (s) => { await s.goto(URL, { waitUntil: "networkidle" });
  await s.waitForSelector(".navbar", { timeout: 12000 }); await momenteWeg(s); };

const a = await seiteFuer("tok-a");
const b = await seiteFuer("tok-b");
const c = await seiteFuer("tok-c");

console.log("== Beim Anlegen einer Quest");
await laden(a);
await a.click('.navbar [data-go="quests"]');
await a.waitForSelector('[data-sheet="neu"]');
await a.click('[data-sheet="neu"]');
await a.waitForSelector("#qname");
pruefe("Haken ist da", await a.locator("[data-wiederkehrend]").count(), 1);
pruefe("Rhythmus zunächst versteckt", await a.locator("#rhythmusfeld").isVisible(), false);
await a.screenshot({ path: `${AUS}/w1-quest-neu.png` });
await a.fill("#qname", "Wohnung saugen");
await a.click("[data-wiederkehrend]");
await a.waitForTimeout(200);
pruefe("Rhythmus erscheint", await a.locator("#rhythmusfeld").isVisible(), true);
await a.click('[data-rhythmus="2× pro Woche"]');
await a.screenshot({ path: `${AUS}/w2-wiederkehrend.png` });
await a.click('[data-senden="neu"]');
await a.waitForTimeout(1500);
pruefe("Landet bei den Abstimmungen", await a.locator(".appbar .title").innerText(), "Wir");

for (const s of [b, c]) {
  await laden(s);
  await s.click('.navbar [data-go="wir"]');
  await s.waitForSelector("[data-stimme]");
  await s.click('[data-stimme][data-antwort="ja"]');
  await s.waitForTimeout(1200);
  await momenteWeg(s);
}

await laden(a);
const plan = await a.evaluate(async () => (await (await fetch("/api/state")).json()).plan);
pruefe("Im Haushaltsplan gelandet", plan.length, 1);
pruefe("Rhythmus übernommen", plan[0]?.rhythmus, "2× pro Woche");
pruefe("Tage folgen", plan[0]?.tage, 3);
const alsQuest = await a.evaluate(async () => (await (await fetch("/api/state")).json())
  .quests.filter((q) => q.name === "Wohnung saugen" && q.wiederkehrend).length);
pruefe("Steht auch in der Quest-Liste, als wiederkehrend", alsQuest, 1);

console.log("== Ohne Haken bleibt es eine Quest");
await a.click('.navbar [data-go="quests"]');
await a.waitForSelector('[data-sheet="neu"]');
await a.click('[data-sheet="neu"]');
await a.waitForSelector("#qname");
await a.fill("#qname", "Fenster wischen");
await a.click('[data-senden="neu"]');
await a.waitForTimeout(1500);
const offen = await a.evaluate(async () => (await (await fetch("/api/state")).json()).abstimmungen.find((v) => v.status === "offen"));
pruefe("Als Quest vorgeschlagen", offen?.art, "new_quest");

console.log("== Aus einer bestehenden Quest heraus");
await a.click('.navbar [data-go="quests"]');
await a.waitForSelector(".zeile .stiftbtn");
await a.click(".zeile .stiftbtn");
await a.waitForSelector('[data-sheet="rhythmus"]');
pruefe("Weg zum Rhythmus da", await a.locator('[data-sheet="rhythmus"]').count(), 1);
await a.screenshot({ path: `${AUS}/w3-stift-menue.png` });
const questName = (await a.locator(".sheet h3").innerText()).trim();
const questId = await a.locator('[data-sheet="rhythmus"]').getAttribute("data-id");
await a.click('[data-sheet="rhythmus"]');
await a.waitForSelector("[data-rhythmus]");
pruefe("Dieselbe Quest, nichts Neues", (await a.locator(".sheet .card").innerText()).includes(questName), true);
await a.screenshot({ path: `${AUS}/w4-rhythmus.png` });
await a.click('[data-rhythmus="1× im Monat"]');
await a.click('[data-senden="rhythmus"]');
await a.waitForTimeout(1500);

for (const s2 of [b, c]) {
  await laden(s2);
  await s2.click('.navbar [data-go="wir"]');
  await s2.waitForSelector("[data-stimme]");
  await s2.click('[data-stimme][data-antwort="ja"]');
  await s2.waitForTimeout(1200);
  await momenteWeg(s2);
}

await laden(a);
const umgestellt = await a.evaluate(async (qid) => {
  const j = await (await fetch("/api/state")).json();
  return { plan: j.plan.filter((x) => x.id === qid).length, quest: j.quests.filter((x) => x.id === qid).length,
           rhythmus: j.plan.find((x) => x.id === qid)?.rhythmus };
}, questId);
pruefe("Bestehende Quest ist jetzt im Plan", umgestellt.plan, 1);
pruefe("Und immer noch dieselbe Quest", umgestellt.quest, 1);
pruefe("Mit dem gewählten Rhythmus", umgestellt.rhythmus, "1× im Monat");

console.log(fehler ? `\n${fehler} FEHLER` : "\nALLES GRÜN");
await browser.close();
process.exit(fehler ? 1 : 0);
