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

sql("delete from requests; delete from claims; delete from ereignisse; delete from ledger");
sql("insert into ledger (id, couple_id, member_id, delta, reason, source_type) select lower(hex(randomblob(8))), couple_id, user_id, 50, 'Testguthaben', 'start' from members where user_id in ('u-a','u-b','u-c')");

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

console.log("== A beantragt eine Belohnung mit Termin");
await laden(a);
await a.click('.navbar [data-go="belohnungen"]');
await a.waitForSelector('[data-sheet="antrag"]');
await a.click('[data-sheet="antrag"]:not([data-locked])');
await a.waitForSelector('[data-senden="antrag"]');
await a.fill("#termin", "Freitag Abend");
await a.click('[data-senden="antrag"]');
await a.waitForTimeout(1200);
pruefe("Antrag raus", await a.locator(".sheet").count(), 0);

console.log("== B fragt nach, statt zu entscheiden");
await laden(b);
await b.click('.navbar [data-go="pruefen"]');
await b.waitForSelector('[data-sheet="rueckfrage"]');
await b.screenshot({ path: `${AUS}/s1-pruefen-nachfragen.png` });
await b.click('[data-sheet="rueckfrage"][data-bereich="requests"]');
await b.waitForSelector("#rtermin");
pruefe("Termin vorbelegt", await b.inputValue("#rtermin"), "Freitag Abend");
await b.fill("#rtermin", "Samstag Abend");
await b.fill("#rtext", "Freitag schaffe ich nicht");
await b.screenshot({ path: `${AUS}/s2-rueckfrage.png` });
await b.click('[data-senden="rueckfrage"]');
await b.waitForTimeout(1200);
pruefe("Antrag ist raus aus dem Stapel", await b.locator('[data-entscheiden="requests"]').count(), 0);

console.log("== A sieht die Rückfrage und antwortet");
await laden(a);
pruefe("Rückfrage auf der Startseite", (await a.locator(".body").innerText()).includes("Freitag schaffe ich nicht"), true);
await a.screenshot({ path: `${AUS}/s3-rueckfrage-start.png` });
await a.click('[data-sheet="antwort"]');
await a.waitForSelector("#atermin");
pruefe("Vorschlag übernommen", await a.inputValue("#atermin"), "Samstag Abend");
await a.fill("#atext", "Passt, dann Samstag");
await a.click('[data-senden="antwort"]');
await a.waitForTimeout(1200);
pruefe("Rückfrage weg", (await a.locator(".body").innerText()).includes("fragt nach"), false);

console.log("== B genehmigt, A muss den Empfang bestätigen");
await laden(b);
await b.click('.navbar [data-go="pruefen"]');
await b.waitForSelector('[data-entscheiden="requests"][data-status="bestaetigt"]');
await b.click('[data-entscheiden="requests"][data-status="bestaetigt"]');
await b.waitForTimeout(1500);
await momenteWeg(b);
await b.click('.navbar [data-go="start"]');
await b.waitForTimeout(400);
pruefe("B sieht seine Zusage auf der Startseite", (await b.locator(".body").innerText()).includes("Du schuldest"), true);
await b.screenshot({ path: `${AUS}/s4-zusage.png` });

await laden(a);
await a.click('.navbar [data-go="pruefen"]');
await a.waitForSelector("[data-empfang]");
pruefe("Empfangsfrage da", (await a.locator(".body").innerText()).includes("Hast du sie bekommen?"), true);
await a.screenshot({ path: `${AUS}/s5-empfang.png` });

console.log("== Kam nicht: Strafe für B");
const vorher = await a.evaluate(async () => (await (await fetch("/api/state")).json()).mitglieder.find((m) => m.id === "u-b").punkte);
await a.click('[data-empfang][data-erhalten="nein"]');
await a.waitForTimeout(1500);
const nachher = await a.evaluate(async () => (await (await fetch("/api/state")).json()).mitglieder.find((m) => m.id === "u-b").punkte);
pruefe("B hat Punkte verloren", nachher < vorher, true);

console.log("== B holt nach, A bestätigt");
await laden(b);
pruefe("B sieht die Nachhol-Zeile", (await b.locator(".body").innerText()).includes("nachholen?"), true);
await b.screenshot({ path: `${AUS}/s6-nachholen.png` });
await b.click('[data-sheet="zusage"]');
await b.waitForSelector("[data-nachholen]");
await b.click("[data-nachholen]");
await b.waitForTimeout(1500);

await laden(a);
await a.click('.navbar [data-go="pruefen"]');
await a.waitForSelector("[data-nachhol]");
await a.screenshot({ path: `${AUS}/s7-nachhol-pruefen.png` });
await a.click('[data-nachhol][data-ja="ja"]');
await a.waitForTimeout(1500);
const zurueck = await a.evaluate(async () => (await (await fetch("/api/state")).json()).mitglieder.find((m) => m.id === "u-b").punkte);
pruefe("B hat die Punkte zurück", zurueck, vorher);
pruefe("Nichts mehr offen", await a.evaluate(async () => (await (await fetch("/api/state")).json()).belohnungenOffen.length), 0);

console.log("== Haken bei einer neuen Belohnung");
await laden(a);
await a.click('.navbar [data-go="belohnungen"]');
await a.waitForSelector('[data-sheet="neue-belohnung"]');
await a.click('[data-sheet="neue-belohnung"]');
await a.waitForSelector("[data-bestaetigen]");
pruefe("Haken ist an", await a.locator('[data-bestaetigen][aria-pressed="true"]').count(), 1);
await a.click("[data-bestaetigen]");
await a.waitForTimeout(150);
pruefe("Haken lässt sich ausschalten", await a.locator('[data-bestaetigen][aria-pressed="false"]').count(), 1);
await a.screenshot({ path: `${AUS}/s8-neue-belohnung.png` });

console.log(fehler ? `\n${fehler} FEHLER` : "\nALLES GRÜN");
await browser.close();
process.exit(fehler ? 1 : 0);
