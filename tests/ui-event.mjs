// Events auf dem Schirm: konfigurieren, abstimmen, einlösen — zu dritt.
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
  console.log(`${ok ? "  ok  " : "  FEHL"} ${n}${ok ? "" : `: „${teil}“ fehlt in „${String(text).slice(0, 400)}“`}`);
};

sql("delete from urlaube; delete from requests; delete from claims; delete from transfers; delete from ereignisse; delete from ledger");
sql("delete from rewards where event_id is not null; delete from quests where event_id is not null; delete from events");
sql("delete from proposals where kind in ('neues_event','event_aendern','event_aus')");
sql("insert into ledger (id, couple_id, member_id, delta, reason, source_type) select lower(hex(randomblob(8))), couple_id, user_id, 120, 'Testguthaben', 'start' from members where user_id in ('u-a','u-b','u-c')");

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
const zustimmen = async (s) => {
  await laden(s);
  await s.click('.navbar [data-go="pruefen"]');
  await s.waitForSelector("[data-stimme]", { timeout: 8000 });
  await s.locator("[data-stimme][data-antwort='ja']").first().click();
  await s.waitForTimeout(1400);
  await momenteWeg(s);
};

const a = await seiteFuer("tok-a");
const b = await seiteFuer("tok-b");
const c = await seiteFuer("tok-c");

console.log("== Der Knopf steht unter „Aktionen“");
await laden(a);
await a.click('.navbar [data-go="wir"]');
await a.waitForSelector('[data-sheet="event"]', { timeout: 8000 });
enthaelt("Heißt richtig", await a.locator('[data-sheet="event"]').innerText(), "Event konfigurieren");
enthaelt("Steht neben „Aktion starten“", await a.evaluate(() => document.body.innerText), "Aktion starten");
pruefe("Die Waage hat das Herz abgelöst",
  await a.locator('[data-sheet="aktion"] use[href="#i-waage"]').count(), 1);
await a.screenshot({ path: `${AUS}/e1-knopf.png`, fullPage: true });

console.log("== Das Blatt: frei beschreibbar, mit Satz darunter");
await a.click('[data-sheet="event"]');
await a.waitForSelector("#evtitel");
pruefe("Richtung steht auf ausgeben",
  await a.locator('[data-evrichtung="ausgeben"]').getAttribute("aria-pressed"), "true");
pruefe("Rhythmus versteckt", await a.locator("#rhythmusblock").isVisible(), false);
pruefe("Zeitraum versteckt", await a.locator("#zeitraumfeld").isVisible(), false);
pruefe("Deckelfeld versteckt", await a.locator("#oftfeld").isVisible(), false);
pruefe("Alle drei stehen zur Wahl", await a.locator("[data-evwer]").count(), 3);

await a.fill("#evtitel", "1 Stunde Zockzeit");
await a.fill("#evtext", "Nicht nach 20 Uhr.");
await a.waitForTimeout(250);
enthaelt("Der Satz nennt den Namen", await a.locator("#evsatz").innerText(), "1 Stunde Zockzeit");
enthaelt("… und die Dauer", await a.locator("#evsatz").innerText(), "2 Tage");
enthaelt("… und dass es einmal gilt", await a.locator("#evsatz").innerText(), "einmal pro Person");

console.log("== Mehrfach blendet den Deckel ein");
await a.click('[data-oftwahl="mehrfach"]');
await a.waitForTimeout(250);
pruefe("Deckelfeld sichtbar", await a.locator("#oftfeld").isVisible(), true);
await a.click('[data-proper="-1"]');
await a.waitForTimeout(200);
enthaelt("Der Satz zählt mit", await a.locator("#evsatz").innerText(), "höchstens 2× pro Person");

console.log("== Zeitraum statt Dauer");
await a.click('[data-zeitart="zeitraum"]');
await a.waitForTimeout(250);
pruefe("Zeitraum sichtbar", await a.locator("#zeitraumfeld").isVisible(), true);
pruefe("Dauerchips weg", await a.locator("#laengefeld").isVisible(), false);
await a.click('[data-zeitart="dauer"]');
await a.waitForTimeout(250);
pruefe("Und wieder zurück", await a.locator("#laengefeld").isVisible(), true);

console.log("== Dauerevent zeigt Rhythmus und Starttag");
await a.click("[data-dauerevent]");
await a.waitForTimeout(250);
pruefe("Rhythmus sichtbar", await a.locator("#rhythmusblock").isVisible(), true);
pruefe("Wochentage sichtbar", await a.locator("#wochentage").isVisible(), true);
pruefe("Monatstag versteckt", await a.locator("#monatstag").isVisible(), false);
pruefe("Dauer-oder-Zeitraum weg", await a.locator("#zeitartwahl").isVisible(), false);
// Die Abschnittsüberschriften stellt das Design auf Großbuchstaben um.
enthaelt("Aus „Wie lange“ wird „Und läuft dann“", await a.locator("#laengelabel").innerText(), "UND LÄUFT DANN");
enthaelt("Der Satz nennt den Rhythmus", await a.locator("#evsatz").innerText(), "jede Woche");
await a.click('[data-evrhythmus="1× im Monat"]');
await a.waitForTimeout(250);
pruefe("Jetzt der Monatstag", await a.locator("#monatstag").isVisible(), true);
pruefe("Und keine Wochentage", await a.locator("#wochentage").isVisible(), false);
await a.screenshot({ path: `${AUS}/e2-blatt.png`, fullPage: true });

console.log("== Wieder einmalig, nur für C, und abschicken");
await a.click("[data-dauerevent]");
await a.waitForTimeout(200);
await a.locator("[data-evwer]").nth(2).click();
await a.waitForTimeout(250);
enthaelt("Der Satz nennt die Person", await a.locator("#evsatz").innerText(), "für Konto");
await a.click('[data-senden="event"]');
await a.waitForTimeout(1800);
await momenteWeg(a);
pruefe("Steht zur Abstimmung", await a.evaluate(async () =>
  (await (await fetch("/api/state")).json()).abstimmungen[0]?.art), "neues_event");
pruefe("Noch kein Event", await a.evaluate(async () =>
  (await (await fetch("/api/state")).json()).events.length), 0);

console.log("== Die Karte bei „Prüfen“ sagt, worum es geht");
await laden(b);
await b.click('.navbar [data-go="pruefen"]');
await b.waitForSelector(".card.vote", { timeout: 8000 });
const karte = await b.locator(".card.vote").first().innerText();
enthaelt("Der Name", karte, "1 Stunde Zockzeit");
enthaelt("Worum es geht", karte, "Cleanies eintauschen");
enthaelt("Für wen", karte, "nur Konto");
enthaelt("Wie oft", karte, "höchstens 2×");
enthaelt("Wie lange", karte, "2 Tage");
enthaelt("Das Kleingedruckte", karte, "Nicht nach 20 Uhr");
await b.screenshot({ path: `${AUS}/e3-pruefen.png`, fullPage: true });

await zustimmen(b);
await zustimmen(c);

console.log("== Jetzt läuft es");
await laden(c);
const start = await c.evaluate(() => document.body.innerText);
enthaelt("Die Karte steht auf der Startseite", start, "1 Stunde Zockzeit");
enthaelt("Mit Restzeit", start, "noch 2 Tage");
pruefe("Und einem Knopf", await c.locator("[data-eventtun]").count(), 1);
enthaelt("Der etwas tut", await c.locator("[data-eventtun]").innerText(), "Einlösen");
await c.screenshot({ path: `${AUS}/e4-laeuft.png`, fullPage: true });

console.log("== Wer nicht gemeint ist, sieht es ohne Knopf");
await laden(b);
enthaelt("B sieht das Event", await b.evaluate(() => document.body.innerText), "1 Stunde Zockzeit");
enthaelt("… aber nicht für sich", await b.evaluate(() => document.body.innerText), "für andere gedacht");
pruefe("Kein Knopf für B", await b.locator("[data-eventtun]").count(), 0);

console.log("== In der Belohnungsliste steht es über der festen");
await laden(c);
await c.click('.navbar [data-go="belohnungen"]');
await c.waitForSelector(".rewards", { timeout: 8000 });
const liste = await c.evaluate(() => document.body.innerText);
enthaelt("Abschnitt „Nur jetzt“", liste, "NUR JETZT");
enthaelt("Abschnitt „Immer“", liste, "IMMER");
pruefe("Das Event ist die einzige Zeitbelohnung", await c.evaluate(async () => {
  const s = await (await fetch("/api/state")).json();
  return s.belohnungen.filter((x) => x.event_id).length;
}), 1);

console.log("== Einlösen ist der Antrag, den es längst gibt");
await laden(c);
await c.click("[data-eventtun]");
await c.waitForSelector('[data-senden="antrag"]', { timeout: 8000 });
enthaelt("Das Blatt weist auf das Event hin", await c.locator(".sheet").innerText(), "Event — noch 2 Tage");
enthaelt("… mit dem Kleingedruckten", await c.locator(".sheet").innerText(), "Nicht nach 20 Uhr");
enthaelt("… und wie oft noch", await c.locator(".sheet").innerText(), "Für dich bleibt");
await c.screenshot({ path: `${AUS}/e5-einloesen.png`, fullPage: true });
const vorC = await c.evaluate(async () => (await (await fetch("/api/state")).json()).ich.punkte);
await c.click('[data-senden="antrag"]');
await c.waitForTimeout(1600);
await momenteWeg(c);

await laden(a);
await a.click('.navbar [data-go="pruefen"]');
await a.waitForSelector('[data-entscheiden="requests"][data-status="bestaetigt"]', { timeout: 8000 });
await a.click('[data-entscheiden="requests"][data-status="bestaetigt"]');
await a.waitForTimeout(1800);
await momenteWeg(a);

await laden(c);
pruefe("C hat bezahlt", await c.evaluate(async () =>
  (await (await fetch("/api/state")).json()).ich.punkte), vorC - 20);
enthaelt("Und hat noch einen frei", await c.evaluate(() => document.body.innerText), "noch 1× für dich");

console.log("== Beenden geht über die Abstimmung");
await laden(a);
await a.click('.navbar [data-go="wir"]');
await a.waitForSelector("[data-eventmenue]", { timeout: 8000 });
await a.locator("[data-eventmenue]").first().click();
await a.waitForSelector("[data-eventende]", { timeout: 8000 });
enthaelt("Das Menü nennt beide Wege", await a.locator(".sheet").innerText(), "Ändern");
await a.click("[data-eventende]");
await a.waitForSelector('[data-senden="eventaus"]', { timeout: 8000 });
await a.click('[data-senden="eventaus"]');
await a.waitForTimeout(1600);
await momenteWeg(a);
pruefe("Noch läuft es", await a.evaluate(async () =>
  (await (await fetch("/api/state")).json()).events.length), 1);

await zustimmen(b);
await zustimmen(c);
await laden(a);
pruefe("Jetzt ist es weg", await a.evaluate(async () =>
  (await (await fetch("/api/state")).json()).events.length), 0);
pruefe("Die Belohnung auch", await a.evaluate(async () =>
  (await (await fetch("/api/state")).json()).belohnungen.filter((x) => x.event_id).length), 0);

console.log("== Aufräumen");
sql("delete from requests; delete from claims; delete from ereignisse");
sql("delete from rewards where event_id is not null; delete from quests where event_id is not null");
sql("delete from events");
sql("delete from proposals where kind in ('neues_event','event_aendern','event_aus')");

console.log(fehler ? `\n${fehler} FEHLER` : "\nALLES GRÜN");
await browser.close();
process.exit(fehler ? 1 : 0);
