// Crustys Fall: zwei offene Abstimmungen „Quest wird wiederkehrende Aufgabe“.
// Sie müssen bei „Prüfen“ stehen und sagen, worum es geht.
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
  console.log(`${ok ? "  ok  " : "  FEHL"} ${n}${ok ? "" : `: „${teil}“ fehlt in „${String(text).slice(0, 260)}“`}`);
};

sql("delete from bewerbungen; delete from claims; delete from proposal_votes; delete from proposals; delete from ereignisse");
sql("delete from requests; delete from transfers");
sql("update quests set wiederkehrend = 0, rhythmus = null, faellig_am = null, tage = null");

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
async function seiteFuer(token) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
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
const c = await seiteFuer("tok-c");

/** Übernommen wird ein Vorschlag erst, wenn alle zugestimmt haben — im
 *  Testhaushalt sind das drei. C gibt die letzte Stimme. */
async function cStimmtAllemZu() {
  for (let i = 0; i < 4; i++) {
    await laden(c);
    await c.click('.navbar [data-go="pruefen"]');
    await c.waitForTimeout(500);
    if (!(await c.locator(".card.vote [data-stimme]").count())) return;
    await c.click('.card.vote [data-stimme][data-antwort="ja"]');
    await c.waitForTimeout(1500);
    await momenteWeg(c);
  }
}

console.log("== A stellt zwei Quests auf wiederkehrend um");
await laden(a);
const ziele = await a.evaluate(async () => (await (await fetch("/api/state")).json()).quests.slice(0, 2)
  .map((q) => ({ id: q.id, name: q.name })));
await a.evaluate(async ([q1, q2]) => {
  const senden = (körper) => fetch("/api/proposals", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(körper) });
  await senden({ art: "aufgabe_aendern", zielId: q1.id, wiederkehrend: true, rhythmus: "1× pro Woche" });
  await senden({ art: "aufgabe_aendern", zielId: q2.id, wiederkehrend: true, rhythmus: "1× im Monat",
                 grund: "Der Keller staubt schneller zu, als uns lieb ist." });
}, ziele);

console.log("== B sieht sie bei „Prüfen“, nicht nur unter „Wir“");
await laden(b);
const badge = await b.locator('.navbar [data-go="pruefen"] .badge, .navbar [data-go="pruefen"] [class*="badge"]').first().innerText().catch(() => "");
pruefe("Zähler in der Leiste", badge.trim(), "2");
await b.click('.navbar [data-go="pruefen"]');
await b.waitForSelector(".card.vote", { timeout: 8000 });
pruefe("Zwei Abstimmungskarten bei Prüfen", await b.locator(".card.vote").count(), 2);

const karte = await b.locator(".card.vote").first().innerText();
enthaelt("Quest-Name steht drauf", karte, ziele[0].name);
enthaelt("Sagt, worum es geht", karte, "soll eine wiederkehrende Aufgabe werden");
enthaelt("Alter Zustand", karte, "jederzeit meldbar");
enthaelt("Neuer Rhythmus", karte, "1× pro Woche");
enthaelt("Wer es vorgeschlagen hat", karte, "Vorgeschlagen von Anna");
enthaelt("Zustimmen steht bereit", karte, "Zustimmen");

const zweite = await b.locator(".card.vote").nth(1).innerText();
enthaelt("Zweiter Rhythmus", zweite, "1× im Monat");
enthaelt("Begründung wird mitgeliefert", zweite, "Der Keller staubt schneller");
enthaelt("Fehlende Begründung wird benannt", karte, "Keine Begründung angegeben");
await b.screenshot({ path: `${AUS}/ab1-pruefen.png`, fullPage: true });

console.log("== B stimmt direkt bei „Prüfen“ zu");
await b.click('.card.vote [data-stimme][data-antwort="ja"]');
await b.waitForTimeout(1500);
await momenteWeg(b);
pruefe("Eine Karte weniger", await b.locator(".card.vote").count(), 1);

console.log("== A sieht nichts bei „Prüfen“ — A hat schon zugestimmt");
await laden(a);
await a.click('.navbar [data-go="pruefen"]');
await a.waitForTimeout(600);
pruefe("Keine Abstimmung für den Absender", await a.locator(".card.vote").count(), 0);
enthaelt("Beim Absender steht sie auf der Startseite", await a.evaluate(() => document.body.innerText), "Alles geprüft");

console.log("== Nach der letzten Stimme greift die Änderung");
await b.click('.card.vote [data-stimme][data-antwort="ja"]');
await b.waitForTimeout(1800);
await momenteWeg(b);
await cStimmtAllemZu();
const umgestellt = await b.evaluate(async (ids) => {
  const j = await (await fetch("/api/state")).json();
  return ids.map((i) => j.quests.find((q) => q.id === i)).map((q) => q && { w: q.wiederkehrend, r: q.rhythmus });
}, ziele.map((z) => z.id));
pruefe("Erste Quest ist wiederkehrend", umgestellt[0]?.w, 1);
pruefe("Mit dem gewählten Rhythmus", umgestellt[0]?.r, "1× pro Woche");
pruefe("Zweite Quest ebenso", umgestellt[1]?.r, "1× im Monat");

console.log("== Rhythmuswechsel an einer, die schon wiederkehrend ist");
await a.evaluate(async (qid) => fetch("/api/proposals", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ art: "aufgabe_aendern", zielId: qid, wiederkehrend: true, rhythmus: "1× im Quartal" })
}), ziele[0].id);
await laden(b);
await b.click('.navbar [data-go="pruefen"]');
await b.waitForSelector(".card.vote", { timeout: 8000 });
const wechsel = await b.locator(".card.vote").first().innerText();
enthaelt("Erkennt den reinen Rhythmuswechsel", wechsel, "der Rhythmus soll sich ändern");
enthaelt("Alter Rhythmus steht da", wechsel, "1× pro Woche");
enthaelt("Neuer Rhythmus steht da", wechsel, "1× im Quartal");
await b.screenshot({ path: `${AUS}/ab2-rhythmuswechsel.png`, fullPage: true });

console.log("== Zurück auf normale Quest");
await a.evaluate(async (qid) => fetch("/api/proposals", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ art: "aufgabe_aendern", zielId: qid, wiederkehrend: false })
}), ziele[1].id);
await laden(b);
await b.click('.navbar [data-go="pruefen"]');
await b.waitForSelector(".card.vote", { timeout: 8000 });
const zurueck = (await b.locator(".card.vote").allInnerTexts()).join("\n---\n");
enthaelt("Sagt, dass sie wieder normal wird", zurueck, "soll wieder eine normale Quest werden");
enthaelt("Nennt den bisherigen Rhythmus", zurueck, "1× im Monat");

console.log(fehler ? `\n${fehler} FEHLER` : "\nALLES GRÜN");
await browser.close();
process.exit(fehler ? 1 : 0);
