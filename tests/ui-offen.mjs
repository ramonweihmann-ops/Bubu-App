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

sql("delete from claims; delete from requests; delete from transfers; delete from ereignisse; delete from bewerbungen");
sql("delete from ledger");
sql("insert into ledger (id, couple_id, member_id, delta, reason, source_type) select lower(hex(randomblob(8))), couple_id, user_id, 60, 'Testguthaben', 'start' from members where user_id in ('u-a','u-b','u-c')");
sql("update quests set wiederkehrend = 0, faellig_am = null, zugewiesen = null, dran = null, vergabe_runde = null");

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
await ctx.addCookies([{ name: "hq_sitzung", value: "tok-a", domain: "127.0.0.1", path: "/" }]);
const s = await ctx.newPage();
s.on("pageerror", (e) => { console.log("  FEHL pageerror: " + e.message); fehler++; });
s.on("console", (m) => { if (m.type() === "error" && !/ERR_NAME_NOT_RESOLVED|favicon|vibrate|status of 40/.test(m.text())) { console.log("  FEHL console: " + m.text()); fehler++; } });

const momenteWeg = async () => {
  for (let i = 0; i < 10 && (await s.locator("#celebrate[data-open]").count()); i++) {
    await s.click("#celebrate [data-schliessen]"); await s.waitForTimeout(300);
  }
};
const laden = async () => { await s.goto(URL, { waitUntil: "networkidle" });
  await s.waitForSelector(".navbar", { timeout: 12000 }); await momenteWeg(); };

console.log("== Nichts offen: kein Kasten");
await laden();
pruefe("Kein Wartet-auf-Kasten", /wartet auf/i.test(await s.locator(".body").innerText()), false);

console.log("== Quest melden");
await s.click('.navbar [data-go="quests"]');
await s.waitForSelector('[data-sheet="melden"]');
const questName = (await s.locator('[data-sheet="melden"] .t').first().innerText()).trim();
await s.click('[data-sheet="melden"]');
await s.waitForSelector('[data-senden="melden"]');
await s.click('[data-senden="melden"]');
await s.waitForTimeout(1200);
await s.click('.navbar [data-go="start"]');
await s.waitForTimeout(500);
let text = await s.locator(".body").innerText();
pruefe("Kasten erscheint", /wartet auf/i.test(text), true);
pruefe("Quest steht drin", text.includes(questName), true);
pruefe("Als Quest gekennzeichnet", text.includes("Quest gemeldet"), true);

console.log("== Belohnung beantragen");
await s.click('.navbar [data-go="belohnungen"]');
await s.waitForSelector('[data-sheet="antrag"]');
const belName = (await s.locator('[data-sheet="antrag"] .n').first().innerText()).trim();
await s.click('[data-sheet="antrag"]:not([data-locked])');
await s.waitForSelector('[data-senden="antrag"]');
await s.fill("#termin", "Samstag");
await s.click('[data-senden="antrag"]');
await s.waitForTimeout(1200);
await s.click('.navbar [data-go="start"]');
await s.waitForTimeout(500);
text = await s.locator(".body").innerText();
pruefe("Belohnung steht drin", text.includes(belName), true);
pruefe("Als Antrag gekennzeichnet", text.includes("Belohnung beantragt"), true);
pruefe("Termin dabei", text.includes("Samstag"), true);

console.log("== Punkte übertragen");
await s.click('.navbar [data-go="belohnungen"]');
await s.waitForSelector('[data-sheet="transfer"]');
await s.click('[data-sheet="transfer"]');
await s.waitForSelector('[data-senden="transfer"]');
await s.click('[data-senden="transfer"]');
await s.waitForTimeout(1200);
await s.click('.navbar [data-go="start"]');
await s.waitForTimeout(500);
text = await s.locator(".body").innerText();
pruefe("Übertragung steht drin", text.includes("Übertragung angeboten"), true);
await s.screenshot({ path: `${AUS}/o1-offene-sachen.png`, fullPage: true });

console.log("== Nach der Entscheidung verschwindet es");
const ctxB = await browser.newContext({ viewport: { width: 390, height: 780 } });
await ctxB.addCookies([{ name: "hq_sitzung", value: "tok-b", domain: "127.0.0.1", path: "/" }]);
const b = await ctxB.newPage();
await b.goto(URL, { waitUntil: "networkidle" });
await b.waitForSelector(".navbar");
for (let i = 0; i < 10 && (await b.locator("#celebrate[data-open]").count()); i++) {
  await b.click("#celebrate [data-schliessen]"); await b.waitForTimeout(300);
}
await b.click('.navbar [data-go="pruefen"]');
await b.waitForSelector('[data-entscheiden="claims"][data-status="bestaetigt"]');
await b.click('[data-entscheiden="claims"][data-status="bestaetigt"]');
await b.waitForTimeout(1500);

await laden();
text = await s.locator(".body").innerText();
pruefe("Quest ist raus", text.includes("Quest gemeldet"), false);
pruefe("Belohnung steht noch", text.includes("Belohnung beantragt"), true);

console.log("== Rückfrage taucht im Kasten auf");
await b.reload({ waitUntil: "networkidle" });
await b.waitForSelector(".navbar");
for (let i = 0; i < 10 && (await b.locator("#celebrate[data-open]").count()); i++) {
  await b.click("#celebrate [data-schliessen]"); await b.waitForTimeout(300);
}
await b.click('.navbar [data-go="pruefen"]');
await b.waitForSelector('[data-sheet="rueckfrage"][data-bereich="requests"]');
await b.click('[data-sheet="rueckfrage"][data-bereich="requests"]');
await b.waitForSelector("#rtext");
await b.fill("#rtext", "Sonntag besser?");
await b.click('[data-senden="rueckfrage"]');
await b.waitForTimeout(1300);

await laden();
text = await s.locator(".body").innerText();
pruefe("Rückfrage sichtbar", text.includes("Sonntag besser?"), true);
await s.screenshot({ path: `${AUS}/o2-mit-rueckfrage.png`, fullPage: true });

console.log(fehler ? `\n${fehler} FEHLER` : "\nALLES GRÜN");
await browser.close();
process.exit(fehler ? 1 : 0);
