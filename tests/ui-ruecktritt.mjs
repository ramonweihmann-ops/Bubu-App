// Von einer Aufgabe zurücktreten — über die Oberfläche, zu dritt.
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
  console.log(`${ok ? "  ok  " : "  FEHL"} ${n}${ok ? "" : `: „${teil}“ fehlt in „${String(text).slice(0, 340)}“`}`);
};

const aufraeumen = () => {
  sql("delete from urlaube; delete from proposal_votes; delete from proposals; delete from bewerbungen; delete from claims; delete from requests; delete from ereignisse");
  sql("update quests set wiederkehrend = 0, faellig_am = null, tage = null, rhythmus = null, vergabe_runde = null, dran = null, zugewiesen = null, strafe_runde = null, mahnung_runde = null");
};
aufraeumen();
sql("delete from ledger");
sql("insert into ledger (id, couple_id, member_id, delta, reason, source_type) select lower(hex(randomblob(8))), couple_id, user_id, 100, 'Testguthaben', 'start' from members where user_id in ('u-a','u-b','u-c')");
// Eine Aufgabe aus der Test-WG, A gehört sie, fällig in drei Tagen.
sql("update quests set wiederkehrend = 1, tage = 7, rhythmus = '1× pro Woche', faellig_am = date('now','+3 days'), vergabe_runde = date('now','+3 days'), zugewiesen = 'u-a' where id = (select id from quests where active = 1 and couple_id = (select couple_id from members where user_id = 'u-a') limit 1)");

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
const zurAufgabe = async (s) => {
  await laden(s);
  await s.click('.rowlink[data-go="plan"]');
  await s.waitForSelector("[data-plan]", { timeout: 8000 });
  await s.click("[data-plan]");
  await s.waitForSelector('[data-sheet="erledigt"], .card.urlaub, .card.alert', { timeout: 8000 });
  await s.waitForTimeout(400);
};

const a = await seiteFuer("tok-a");
const b = await seiteFuer("tok-b");
const c = await seiteFuer("tok-c");

console.log("== Nur wem die Aufgabe gehört, sieht den Knopf");
await zurAufgabe(a);
pruefe("A sieht ihn", await a.locator('[data-sheet="ruecktritt"]').count(), 1);
enthaelt("Er heißt richtig", await a.locator('[data-sheet="ruecktritt"]').innerText(), "Zurücktreten von der Aufgabe");
await a.screenshot({ path: `${AUS}/rt1-aufgabe.png`, fullPage: true });
await zurAufgabe(b);
pruefe("B sieht ihn nicht", await b.locator('[data-sheet="ruecktritt"]').count(), 0);

console.log("== Ohne Grund geht es nicht");
await zurAufgabe(a);
await a.click('[data-sheet="ruecktritt"]');
await a.waitForSelector("#rtgrund");
const blatt = await a.locator(".sheet").innerText();
enthaelt("Grund ist als nötig markiert", blatt, "NÖTIG");   // Feldbeschriftungen stehen in Versalien
enthaelt("Sagt, wie viele Stimmen fehlen", blatt, "eine weitere Stimme");
enthaelt("Sagt, dass die Frist bleibt", blatt, "Frist bleibt stehen");
await a.screenshot({ path: `${AUS}/rt2-blatt.png`, fullPage: true });
await a.click('[data-senden="ruecktritt"]');
await a.waitForTimeout(1200);
enthaelt("Wird abgewiesen", await a.evaluate(() => document.body.innerText), "Schreib kurz dazu");

console.log("== Mit Grund geht er raus");
await a.fill("#rtgrund", "Liege flach mit Grippe, komme diese Woche nicht dazu.");
await a.click('[data-senden="ruecktritt"]');
await a.waitForTimeout(1600);
await momenteWeg(a);
pruefe("Aufgabe gehört weiter A", await a.evaluate(async () =>
  (await (await fetch("/api/state")).json()).plan[0]?.zugewiesen), "u-a");
await zurAufgabe(a);
enthaelt("Karte zeigt den laufenden Antrag", await a.locator(".card.urlaub").innerText(), "Dein Rücktritt steht zur Abstimmung");
enthaelt("Mit Zählerstand", await a.locator(".card.urlaub").innerText(), "1 von 3");
pruefe("Kein zweiter Anlauf, solange er läuft", await a.locator('[data-sheet="ruecktritt"]').count(), 0);

console.log("== Bei B steht er unter Prüfen");
await laden(b);
await b.click('.navbar [data-go="pruefen"]');
await b.waitForSelector(".card.vote", { timeout: 8000 });
const karte = await b.locator(".card.vote").first().innerText();
enthaelt("Sagt, wer zurücktritt", karte, "Anna tritt zurück");
enthaelt("Und wer es vorgeschlagen hat", karte, "Vorgeschlagen von Anna");
enthaelt("Sagt, was passiert", karte, "die Runde wird wieder frei");
enthaelt("Frist bleibt steht dabei", karte, "Frist bleibt");
enthaelt("Grund steht drauf", karte, "Liege flach mit Grippe");
enthaelt("Zähler statt Einstimmigkeit", karte, "1 von 3");
enthaelt("Sagt, was noch fehlt", karte, "eine Stimme fehlt noch");
pruefe("Der Zählbalken ist da", await b.locator(".card.vote .zaehlbalken i").count(), 3);
await b.screenshot({ path: `${AUS}/rt3-pruefen.png`, fullPage: true });

console.log("== Ablehnen fragt nach einem Grund");
await b.click('.card.vote [data-sheet="ablehnen"]');
await b.waitForSelector("#abgrund");
enthaelt("Erklärt, dass ein Nein nichts beendet", await b.locator(".sheet").innerText(), "beendet den Antrag nicht sofort");
await b.fill("#abgrund", "Wir sind auch alle im Stress.");
await b.click('[data-senden="ablehnen"]');
await b.waitForTimeout(1600);
await momenteWeg(b);
pruefe("Antrag lebt weiter", await b.evaluate(async () =>
  (await (await fetch("/api/state")).json()).abstimmungen.filter((v) => v.art === "ruecktritt" && v.status === "offen").length), 1);
pruefe("Aufgabe gehört weiter A", await b.evaluate(async () =>
  (await (await fetch("/api/state")).json()).plan[0]?.zugewiesen), "u-a");

console.log("== C gibt die entscheidende Stimme");
await laden(c);
await c.click('.navbar [data-go="pruefen"]');
await c.waitForSelector(".card.vote [data-stimme]", { timeout: 8000 });
await c.click('.card.vote [data-stimme][data-antwort="ja"]');
await c.waitForTimeout(1800);
await momenteWeg(c);
const nachher = await c.evaluate(async () => {
  const j = await (await fetch("/api/state")).json();
  return { zugewiesen: j.plan[0]?.zugewiesen ?? null, faellig: j.plan[0]?.faellig_am };
});
pruefe("Zuteilung ist weg", nachher.zugewiesen, null);
pruefe("Frist steht noch", nachher.faellig, (() => {
  const d = new Date(); d.setUTCDate(d.getUTCDate() + 3); return d.toISOString().slice(0, 10);
})());

await zurAufgabe(c);
enthaelt("Aufgabe sagt: wieder für alle offen", await c.locator(".card.urlaub").innerText(), "Wieder für alle offen");
pruefe("C darf jetzt melden", await c.locator('[data-sheet="erledigt"]:not([disabled])').count(), 1);
await c.screenshot({ path: `${AUS}/rt4-frei.png`, fullPage: true });

console.log("== Abgelehnt: die Aufgabe bleibt, mit Begründung dran");
sql("delete from proposal_votes; delete from proposals; delete from ereignisse");
sql("update quests set zugewiesen = 'u-a', dran = null where wiederkehrend = 1");
await zurAufgabe(a);
await a.click('[data-sheet="ruecktritt"]');
await a.waitForSelector("#rtgrund");
await a.fill("#rtgrund", "Muss unerwartet arbeiten.");
await a.click('[data-senden="ruecktritt"]');
await a.waitForTimeout(1600);
await momenteWeg(a);

for (const s of [b, c]) {
  await laden(s);
  await s.click('.navbar [data-go="pruefen"]');
  await s.waitForSelector('.card.vote [data-sheet="ablehnen"]', { timeout: 8000 });
  await s.click('.card.vote [data-sheet="ablehnen"]');
  await s.waitForSelector("#abgrund");
  await s.fill("#abgrund", s === b ? "Geht bei uns auch nicht." : "Bitte am Wochenende.");
  await s.click('[data-senden="ablehnen"]');
  await s.waitForTimeout(1600);
  await momenteWeg(s);
}

await zurAufgabe(a);
const abgelehnt = await a.locator(".card.alert").innerText();
enthaelt("Sagt, dass er abgelehnt wurde", abgelehnt, "Rücktritt abgelehnt");
enthaelt("Und dass sie weiter dir gehört", abgelehnt, "gehört weiter dir");
enthaelt("Die Begründungen stehen dran", abgelehnt, "Geht bei uns auch nicht");
pruefe("Aufgabe gehört weiter A", await a.evaluate(async () =>
  (await (await fetch("/api/state")).json()).plan[0]?.zugewiesen), "u-a");
pruefe("Neuer Anlauf ist möglich", await a.locator('[data-sheet="ruecktritt"]').count(), 1);
await a.screenshot({ path: `${AUS}/rt5-abgelehnt.png`, fullPage: true });

console.log("== Alles andere braucht weiter alle Stimmen");
sql("delete from proposal_votes; delete from proposals; delete from ereignisse");
await laden(a);
const bel = await a.evaluate(async () => (await (await fetch("/api/state")).json()).belohnungen[0]);
await a.evaluate(async (b) => fetch("/api/proposals", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ art: "reward_cost", zielId: b.id, wert: b.cost + 1 })
}), bel);
await laden(b);
await b.click('.navbar [data-go="pruefen"]');
await b.waitForSelector(".card.vote", { timeout: 8000 });
const normale = await b.locator(".card.vote").first().innerText();
enthaelt("Weiter Einstimmigkeit", normale, "wenn alle 3 zugestimmt haben");
pruefe("Kein Zählbalken", await b.locator(".card.vote .zaehlbalken").count(), 0);
pruefe("Ablehnen ohne Blatt", await b.locator('.card.vote [data-stimme][data-antwort="nein"]').count(), 1);

aufraeumen();
console.log(fehler ? `\n${fehler} FEHLER` : "\nALLES GRÜN");
await browser.close();
process.exit(fehler ? 1 : 0);
