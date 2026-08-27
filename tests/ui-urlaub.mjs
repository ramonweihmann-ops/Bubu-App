// Urlaubsmodus über die Oberfläche: anmelden, abstimmen, sehen, beenden.
import { chromium } from "playwright";
import { execSync } from "node:child_process";
const AUS = process.env.HQ_BILDER || "/tmp";
const URL = "http://127.0.0.1:8792/app/";
const sql = (s) => execSync(`cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --command "${s}" > /dev/null 2>&1`);
const tag = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

let fehler = 0;
const pruefe = (n, ist, soll) => {
  const ok = ist === soll;
  if (!ok) fehler++;
  console.log(`${ok ? "  ok  " : "  FEHL"} ${n}: ${JSON.stringify(ist)}${ok ? "" : " soll=" + JSON.stringify(soll)}`);
};
const enthaelt = (n, text, teil) => {
  const ok = String(text).includes(teil);
  if (!ok) fehler++;
  console.log(`${ok ? "  ok  " : "  FEHL"} ${n}${ok ? "" : `: „${teil}“ fehlt in „${String(text).slice(0, 320)}“`}`);
};

sql("delete from urlaube; delete from proposal_votes; delete from proposals; delete from bewerbungen; delete from claims; delete from requests; delete from transfers; delete from ereignisse; delete from ledger");
sql("update quests set wiederkehrend = 0, faellig_am = null, tage = null, rhythmus = null, vergabe_runde = null, dran = null, zugewiesen = null, strafe_runde = null, mahnung_runde = null");
sql("insert into ledger (id, couple_id, member_id, delta, reason, source_type) select lower(hex(randomblob(8))), couple_id, user_id, 100, 'Testguthaben', 'start' from members where user_id in ('u-a','u-b','u-c')");
// Nur eine Quest aus der Test-WG — in der Datenbank steht noch ein zweiter Haushalt.
sql("update quests set wiederkehrend = 1, tage = 7, rhythmus = '1× pro Woche', faellig_am = date('now','+4 days') where id = (select id from quests where active = 1 and couple_id = (select couple_id from members where user_id = 'u-a') limit 1)");

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
const zustimmen = async (s) => {
  await laden(s);
  await s.click('.navbar [data-go="pruefen"]');
  await s.waitForSelector(".card.vote [data-stimme]", { timeout: 8000 });
  await s.click('.card.vote [data-stimme][data-antwort="ja"]');
  await s.waitForTimeout(1500);
  await momenteWeg(s);
};

const a = await seiteFuer("tok-a");
const b = await seiteFuer("tok-b");
const c = await seiteFuer("tok-c");

console.log("== Der Punkt sitzt in den Einstellungen");
await laden(a);
await a.click('.appbar [data-go="einstellungen"]');
await a.waitForSelector('[data-go="urlaub"]');
enthaelt("Zeile da", await a.locator('[data-go="urlaub"]').innerText(), "Urlaubsmodus");
await a.click('[data-go="urlaub"]');
await a.waitForSelector('[data-senden="urlaub"]');
pruefe("Zwei Arten zur Wahl", await a.locator(".urlaubsart").count(), 2);
pruefe("„Nur mich“ ist vorgewählt",
  await a.locator('[data-urlaubsart="urlaub_person"]').getAttribute("aria-pressed"), "true");
await a.screenshot({ path: `${AUS}/ur1-schirm.png`, fullPage: true });

console.log("== Die Tageszahl rechnet mit");
await a.fill("#uvon", tag(0));
await a.fill("#ubis", tag(13));
await a.waitForTimeout(300);
enthaelt("14 Tage", await a.locator("#udauer").innerText(), "14 Tage");
await a.fill("#ubis", tag(-3));
await a.waitForTimeout(300);
enthaelt("Merkt verdrehte Daten", await a.locator("#udauer").innerText(), "Das Ende liegt vor dem Anfang");
await a.fill("#ubis", tag(13));
await a.waitForTimeout(300);

console.log("== A meldet Urlaub für sich an");
await a.fill("#ugrund", "Zwei Wochen bei meinen Eltern");
await a.click('[data-senden="urlaub"]');
await a.waitForTimeout(1600);
await momenteWeg(a);
pruefe("Noch kein Urlaub aktiv", await a.evaluate(async () =>
  (await (await fetch("/api/state")).json()).urlaube.length), 0);

await laden(b);
await b.click('.navbar [data-go="pruefen"]');
await b.waitForSelector(".card.vote", { timeout: 8000 });
const karte = await b.locator(".card.vote").first().innerText();
enthaelt("Sagt, wessen Urlaub", karte, "macht Urlaub");
enthaelt("Wer es vorgeschlagen hat", karte, "Vorgeschlagen von Anna");
enthaelt("Sagt, was es bedeutet", karte, "der Plan bleibt, wie er ist");
enthaelt("Zeitraum steht drauf", karte, "14 Tage");
enthaelt("Begründung steht drauf", karte, "Zwei Wochen bei meinen Eltern");
await b.screenshot({ path: `${AUS}/ur2-abstimmung.png`, fullPage: true });

await zustimmen(b);
await zustimmen(c);

console.log("== Danach ist der Urlaub sichtbar");
await laden(a);
pruefe("Genau ein Urlaub", await a.evaluate(async () =>
  (await (await fetch("/api/state")).json()).urlaube.length), 1);
enthaelt("Banner auf der Startseite", await a.evaluate(() => document.body.innerText), "Du bist im Urlaub");
await a.screenshot({ path: `${AUS}/ur3-start.png` });
await laden(b);
enthaelt("Auch B sieht es", await b.evaluate(() => document.body.innerText), "ist im Urlaub");

console.log("== Der Plan bleibt stehen");
const vorher = await a.evaluate(async () => (await (await fetch("/api/state")).json()).plan[0]?.faellig_am);
await laden(a);
const nachher = await a.evaluate(async () => (await (await fetch("/api/state")).json()).plan[0]?.faellig_am);
pruefe("Fälligkeit unverändert", nachher, vorher);

console.log("== A kommt früher zurück");
await a.click('.appbar [data-go="einstellungen"]');
await a.waitForSelector('[data-go="urlaub"]');
await a.click('[data-go="urlaub"]');
await a.waitForSelector("[data-urlaub-beenden]");
enthaelt("Karte erklärt die Wirkung", await a.locator(".card.urlaub").first().innerText(), "keine Gruppenstrafe");
await a.click("[data-urlaub-beenden]");
await a.waitForTimeout(1500);
await momenteWeg(a);
pruefe("Kein Urlaub mehr", await a.evaluate(async () =>
  (await (await fetch("/api/state")).json()).urlaube.length), 0);

console.log("== Urlaub für den ganzen Haushalt");
await laden(b);
await b.click('.appbar [data-go="einstellungen"]');
await b.waitForSelector('[data-go="urlaub"]');
await b.click('[data-go="urlaub"]');
await b.waitForSelector('[data-urlaubsart="urlaub_haushalt"]');
await b.click('[data-urlaubsart="urlaub_haushalt"]');
pruefe("Umgeschaltet", await b.locator('[data-urlaubsart="urlaub_haushalt"]').getAttribute("aria-pressed"), "true");
pruefe("Und die andere ist aus", await b.locator('[data-urlaubsart="urlaub_person"]').getAttribute("aria-pressed"), "false");
await b.fill("#uvon", tag(0));
await b.fill("#ubis", tag(9));
await b.waitForTimeout(250);
const planVor = await b.evaluate(async () => (await (await fetch("/api/state")).json()).plan[0]?.faellig_am);
await b.click('[data-senden="urlaub"]');
await b.waitForTimeout(1600);
await momenteWeg(b);
await zustimmen(a);
await zustimmen(c);

await laden(b);
const planNach = await b.evaluate(async () => (await (await fetch("/api/state")).json()).plan[0]?.faellig_am);
const soll = (() => { const d = new Date(planVor + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 10); return d.toISOString().slice(0, 10); })();
pruefe("Fälligkeit um 10 Tage gerückt", planNach, soll);
enthaelt("Banner sagt es", await b.evaluate(() => document.body.innerText), "nach hinten gerückt");
await b.click('.navbar [data-go="start"]');
await b.waitForTimeout(400);
await b.screenshot({ path: `${AUS}/ur4-haushalt.png` });

console.log("== Beenden darf, wer ihn vorgeschlagen hat");
await laden(c);
await c.click('.appbar [data-go="einstellungen"]');
await c.waitForSelector('[data-go="urlaub"]');
await c.click('[data-go="urlaub"]');
await c.waitForSelector(".card.urlaub");
pruefe("C sieht keinen Beenden-Knopf", await c.locator("[data-urlaub-beenden]").count(), 0);
await laden(b);
await b.click('.appbar [data-go="einstellungen"]');
await b.waitForSelector('[data-go="urlaub"]');
await b.click('[data-go="urlaub"]');
await b.waitForSelector("[data-urlaub-beenden]");
await b.click("[data-urlaub-beenden]");
await b.waitForTimeout(1500);
await momenteWeg(b);
pruefe("Vorbei", await b.evaluate(async () =>
  (await (await fetch("/api/state")).json()).urlaube.length), 0);
pruefe("Verschobene Daten bleiben", await b.evaluate(async () =>
  (await (await fetch("/api/state")).json()).plan[0]?.faellig_am), soll);

// Aufräumen, damit die nächste Suite einen unbelasteten Plan vorfindet.
sql("update quests set wiederkehrend = 0, faellig_am = null, tage = null, rhythmus = null, vergabe_runde = null, dran = null, zugewiesen = null, strafe_runde = null, mahnung_runde = null");

console.log(fehler ? `\n${fehler} FEHLER` : "\nALLES GRÜN");
await browser.close();
process.exit(fehler ? 1 : 0);
