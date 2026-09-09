// Eine Aufgabe aus dem Haushaltsplan bleibt eine Quest.
//
// Sie steht weiter in der Quest-Liste, sie lässt sich dort melden, und weder
// die Sperre noch eine fremde Runde halten auf — beides verlangt nur eine
// Begründung. Der Plan plant sie zusätzlich ein; gehören tut sie ihm nicht.
import { chromium } from "playwright";
import { execSync } from "node:child_process";
const AUS = process.env.HQ_BILDER || "/tmp";
const URL = "http://127.0.0.1:8792/app/";
const sql = (s) => execSync(`cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --command "${s}" > /dev/null 2>&1`);
const frage = (s) => JSON.parse(execSync(
  `cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --json --command "${s}" 2>/dev/null`
).toString())[0].results;

let fehler = 0;
const pruefe = (n, ist, soll) => {
  const ok = ist === soll;
  if (!ok) fehler++;
  console.log(`${ok ? "  ok  " : "  FEHL"} ${n}: ${JSON.stringify(ist)}${ok ? "" : " soll=" + JSON.stringify(soll)}`);
};
const enthaelt = (n, text, teil) => {
  const ok = String(text).includes(teil);
  if (!ok) fehler++;
  console.log(`${ok ? "  ok  " : "  FEHL"} ${n}${ok ? "" : `: „${teil}“ fehlt in „${String(text).slice(0, 400)}“`}`);
};

sql("delete from urlaube; delete from requests; delete from claims; delete from transfers; delete from ereignisse; delete from ledger");
sql("delete from bewerbungen");
sql("update quests set wiederkehrend = 0, faellig_am = null, zugewiesen = null, dran = null, vergabe_runde = null, mahnung_runde = null, strafe_runde = null");

// Eine Quest in den Plan heben — direkt in der Datenbank, den Weg dorthin
// prüft ui-wieder.mjs.
const [q] = frage("select id, name from quests where active = 1 and event_id is null"
  + " and couple_id = (select couple_id from members where user_id = 'u-a') limit 1");
sql(`update quests set wiederkehrend = 1, rhythmus = '1× pro Woche', tage = 7, faellig_am = date('now') where id = '${q.id}'`);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
async function seiteFuer(token) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, locale: "de-DE" });
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
const zurQuest = async (s) => {
  await s.click('.navbar [data-go="quests"]');
  await s.waitForSelector(".zeile .rowlink", { timeout: 8000 });
  return s.locator(`.rowlink[data-id="${q.id}"]`);
};

const a = await seiteFuer("tok-a");
const b = await seiteFuer("tok-b");

console.log("== Sie steht in der Quest-Liste und lässt sich dort melden");
await laden(a);
const zeile = await zurQuest(a);
pruefe("Die Quest ist da", await zeile.count(), 1);
pruefe("Sie führt zum Melden, nicht in den Plan", await zeile.getAttribute("data-sheet"), "melden");
enthaelt("Mit dem Wiederhol-Zeichen", await zeile.innerText(), "↻");
enthaelt("Und dem Rhythmus", await zeile.innerText(), "1× pro Woche");
pruefe("Daneben ein Weg in den Plan",
  await a.locator(`.zeile .stiftbtn[data-plan="${q.id}"]`).count(), 1);
await a.screenshot({ path: `${AUS}/q1-liste.png`, fullPage: true });

console.log("== Das Blatt zeigt, was der Plan über sie weiß");
await zeile.click();
await a.waitForSelector('[data-senden="melden"]', { timeout: 8000 });
const blatt = await a.locator(".sheet").innerText();
enthaelt("Der Streifen zum Plan", blatt, "Steht auch im Haushaltsplan");
enthaelt("Mit Rhythmus und Frist", blatt, "1× pro Woche");
pruefe("Kein Mengenzähler — es ist eine Runde", await a.locator("#menge").count(), 0);
pruefe("Nicht gesperrt, also kein Grundfeld", await a.locator("#grund").count(), 0);
pruefe("Der Knopf verlangt kein Trotzdem",
  await a.locator('[data-senden="melden"]').getAttribute("data-trotzdem"), "nein");
await a.screenshot({ path: `${AUS}/q2-blatt.png`, fullPage: true });

console.log("== Melden aus der Quest-Liste heraus");
await a.click('[data-senden="melden"]');
await a.waitForTimeout(1600);
await momenteWeg(a);
pruefe("Die Meldung liegt an", await a.evaluate(async () =>
  (await (await fetch("/api/state")).json()).meldungen.length), 1);
const wieder = await zurQuest(a);
enthaelt("In der Liste steht sie als gemeldet", await wieder.innerText(), "Gemeldet");
pruefe("Und ist gesperrt", await wieder.isDisabled(), true);

console.log("== Auch für die anderen — es gibt nur eine Runde");
await laden(b);
const beiB = await zurQuest(b);
enthaelt("B sieht es auch", await beiB.innerText(), "Gemeldet");
pruefe("B kann nicht doppelt melden", await beiB.isDisabled(), true);

// Bestätigen, damit die Runde weiterrückt und die Sperre greift.
await b.click('.navbar [data-go="pruefen"]');
await b.waitForSelector('[data-entscheiden="claims"][data-status="bestaetigt"]', { timeout: 8000 });
await b.click('[data-entscheiden="claims"][data-status="bestaetigt"]');
await b.waitForTimeout(1800);
await momenteWeg(b);

console.log("== Gesperrt heißt: mit Begründung geht es trotzdem");
await laden(a);
const gesperrt = await zurQuest(a);
pruefe("Wieder anwählbar", await gesperrt.isDisabled(), false);
await gesperrt.click();
await a.waitForSelector('[data-senden="melden"]', { timeout: 8000 });
enthaelt("Das Blatt heißt jetzt anders", await a.locator(".sheet h3").innerText(), "Trotzdem melden");
pruefe("Ein Grundfeld ist da", await a.locator("#grund").count(), 1);
pruefe("Und der Knopf weiß es", await a.locator('[data-senden="melden"]').getAttribute("data-trotzdem"), "ja");
await a.screenshot({ path: `${AUS}/q3-gesperrt.png`, fullPage: true });
await a.fill("#grund", "Besuch kommt kurzfristig");
await a.click('[data-senden="melden"]');
await a.waitForTimeout(1600);
await momenteWeg(a);
pruefe("Vorzeitig gemeldet", await a.evaluate(async () =>
  (await (await fetch("/api/state")).json()).meldungen[0]?.note?.startsWith("Vorzeitig")), true);
sql("delete from claims");

console.log("== Eine fremde Runde hält auch nicht auf");
sql(`update quests set zugewiesen = 'u-b', faellig_am = date('now') where id = '${q.id}'`);
await laden(a);
const fremd = await zurQuest(a);
await fremd.click();
await a.waitForSelector('[data-senden="melden"]', { timeout: 8000 });
enthaelt("Es steht dran, wem sie gehört", await a.locator(".sheet").innerText(), "Diese Runde gehört");
pruefe("Wieder ein Grundfeld", await a.locator("#grund").count(), 1);
await a.fill("#grund", "War da und hatte Zeit");
await a.click('[data-senden="melden"]');
await a.waitForTimeout(1600);
await momenteWeg(a);
pruefe("Übernommen gemeldet", await a.evaluate(async () =>
  (await (await fetch("/api/state")).json()).meldungen[0]?.note?.startsWith("Für ")), true);

console.log("== Aufräumen");
sql("delete from claims; delete from ereignisse");
sql(`update quests set wiederkehrend = 0, faellig_am = null, zugewiesen = null, dran = null, vergabe_runde = null, mahnung_runde = null, strafe_runde = null`);

console.log(fehler ? `\n${fehler} FEHLER` : "\nALLES GRÜN");
await browser.close();
process.exit(fehler ? 1 : 0);
