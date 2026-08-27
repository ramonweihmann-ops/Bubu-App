// Der Absender bessert nach und zieht zurück — über die Oberfläche.
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
const enthaelt = (n, text, teil) => {
  const ok = String(text).includes(teil);
  if (!ok) fehler++;
  console.log(`${ok ? "  ok  " : "  FEHL"} ${n}${ok ? "" : `: „${teil}“ fehlt in „${String(text).slice(0, 300)}“`}`);
};

sql("delete from urlaube; delete from claims; delete from requests; delete from transfers; delete from ereignisse; delete from proposal_votes; delete from proposals");
sql("update quests set wiederkehrend = 0, faellig_am = null");
// Ohne Guthaben ist jede Belohnung gesperrt — dann gibt es nichts zu beantragen.
sql("delete from ledger");
sql("insert into ledger (id, couple_id, member_id, delta, reason, source_type) select lower(hex(randomblob(8))), couple_id, user_id, 60, 'Testguthaben', 'start' from members where user_id in ('u-a','u-b','u-c')");

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
async function seiteFuer(token) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 880 }, deviceScaleFactor: 2, locale: "de-DE" });
  await ctx.addCookies([{ name: "hq_sitzung", value: token, domain: "127.0.0.1", path: "/" }]);
  const s = await ctx.newPage();
  s.on("pageerror", (e) => { console.log("  FEHL pageerror: " + e.message); fehler++; });
  s.on("console", (m) => {
    if (m.type() === "error" && !/ERR_NAME_NOT_RESOLVED|favicon|vibrate|status of 40/.test(m.text())) {
      console.log("  FEHL console: " + m.text()); fehler++;
    }
  });
  return s;
}
const momenteWeg = async (s) => {
  for (let i = 0; i < 10 && (await s.locator("#celebrate[data-open]").count()); i++) {
    await s.click("#celebrate [data-schliessen]"); await s.waitForTimeout(300);
  }
};
const laden = async (s) => {
  await s.goto(URL, { waitUntil: "networkidle" });
  await s.waitForSelector(".navbar", { timeout: 12000 });
  await momenteWeg(s);
};

const a = await seiteFuer("tok-a");
const b = await seiteFuer("tok-b");

console.log("== A meldet eine Quest");
await laden(a);
await a.click('.navbar [data-go="quests"]');
await a.waitForSelector(".zeile .rowlink");
await a.click(".zeile .rowlink");
await a.waitForSelector('[data-senden="melden"]');
await a.fill("#grund", "kurz durchgewischt").catch(() => {});
await a.click('[data-senden="melden"]');
await a.waitForTimeout(1500);
await momenteWeg(a);

console.log("== Die Zeile auf der Startseite lässt sich antippen");
await laden(a);
pruefe("Wartekasten da", await a.locator('.offene-zeile[data-sheet="meins"]').count(), 1);
await a.screenshot({ path: `${AUS}/st1-startseite.png` });
await a.click('.offene-zeile[data-sheet="meins"]');
await a.waitForSelector('[data-senden="meins-aendern"]');
const blatt = await a.locator(".sheet").innerText();
enthaelt("Sagt, dass es die eigene Meldung ist", blatt, "Deine Meldung");
enthaelt("Zurückziehen steht bereit", blatt, "Zurückziehen");
enthaelt("Erklärt, was Zurückziehen heißt", blatt, "es war nie da");
await a.screenshot({ path: `${AUS}/st2-blatt.png` });

console.log("== Nachbessern");
await a.fill("#mtext", "Die Fenster waren auch dran");
await a.click('[data-senden="meins-aendern"]');
await a.waitForTimeout(1500);
await momenteWeg(a);
enthaelt("Ergänzung steht auf der Startseite", await a.evaluate(() => document.body.innerText), "Die Fenster waren auch dran");

await laden(b);
await b.click('.navbar [data-go="pruefen"]');
await b.waitForTimeout(700);
enthaelt("B sieht die Ergänzung beim Prüfen", await b.evaluate(() => document.body.innerText), "Die Fenster waren auch dran");
pruefe("Genau eine offene Meldung", await b.evaluate(async () =>
  (await (await fetch("/api/state")).json()).meldungen.length), 1);
await b.screenshot({ path: `${AUS}/st3-pruefen.png` });

console.log("== Zurückziehen");
await laden(a);
await a.click('.offene-zeile[data-sheet="meins"]');
await a.waitForSelector('[data-senden="meins-storno"]');
await a.click('[data-senden="meins-storno"]');
await a.waitForTimeout(1500);
await momenteWeg(a);
pruefe("Wartekasten ist leer", await a.locator('.offene-zeile[data-sheet="meins"]').count(), 0);

await laden(b);
pruefe("B hat nichts mehr zu prüfen", await b.evaluate(async () =>
  (await (await fetch("/api/state")).json()).meldungen.length), 0);
pruefe("Und keine Nachricht darüber", await b.evaluate(async () =>
  (await (await fetch("/api/state")).json()).ereignisse.length), 0);

console.log("== Belohnung: Termin und Text nachschärfen");
await laden(a);
await a.click('.navbar [data-go="belohnungen"]');
await a.waitForSelector(".reward");
await a.locator('.reward[data-sheet="antrag"]:not([data-locked])').first().click();
await a.waitForSelector('[data-senden="antrag"]');
await a.fill("#termin", "Freitag");
await a.click('[data-senden="antrag"]');
await a.waitForTimeout(1500);
await momenteWeg(a);

await laden(a);
await a.click('.offene-zeile[data-sheet="meins"][data-bereich="requests"]');
await a.waitForSelector("#mtermin");
pruefe("Termin ist vorbelegt", await a.inputValue("#mtermin"), "Freitag");
await a.fill("#mtermin", "Sonntag");
await a.fill("#mtext", "Freitag klappt doch nicht");
await a.click('[data-senden="meins-aendern"]');
await a.waitForTimeout(1500);
await momenteWeg(a);

await laden(b);
await b.click('.navbar [data-go="pruefen"]');
await b.waitForTimeout(700);
const beiB = await b.evaluate(() => document.body.innerText);
enthaelt("B sieht den neuen Termin", beiB, "Sonntag");
enthaelt("B sieht den neuen Text", beiB, "Freitag klappt doch nicht");

console.log("== Was entschieden ist, taucht nicht mehr im Wartekasten auf");
await b.click('[data-entscheiden="requests"][data-status="bestaetigt"]');
await b.waitForTimeout(1600);
await momenteWeg(b);
await laden(a);
pruefe("Nichts mehr zum Zurückziehen", await a.locator('.offene-zeile[data-sheet="meins"]').count(), 0);

console.log(fehler ? `\n${fehler} FEHLER` : "\nALLES GRÜN");
await browser.close();
process.exit(fehler ? 1 : 0);
