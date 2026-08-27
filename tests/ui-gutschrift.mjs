// „Cleanies an Empfänger senden“ über die Oberfläche.
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
  console.log(`${ok ? "  ok  " : "  FEHL"} ${n}${ok ? "" : `: „${teil}“ fehlt in „${String(text).slice(0, 320)}“`}`);
};

sql("delete from urlaube; delete from requests; delete from claims; delete from transfers; delete from ereignisse; delete from ledger");
sql("insert into ledger (id, couple_id, member_id, delta, reason, source_type) select lower(hex(randomblob(8))), couple_id, user_id, 100, 'Testguthaben', 'start' from members where user_id in ('u-a','u-b','u-c')");

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
const antragOeffnen = async (s) => {
  await s.click('.navbar [data-go="belohnungen"]');
  await s.waitForSelector('.reward[data-sheet="antrag"]');
  await s.locator('.reward[data-sheet="antrag"]:not([data-locked])').first().click();
  await s.waitForSelector('[data-senden="antrag"]');
};

const a = await seiteFuer("tok-a");
const b = await seiteFuer("tok-b");

console.log("== Der Haken ist da und standardmäßig aus");
await laden(a);
await antragOeffnen(a);
pruefe("Haken vorhanden", await a.locator("[data-gutschrift]").count(), 1);
pruefe("Steht auf aus", await a.locator("[data-gutschrift]").getAttribute("aria-pressed"), "false");
enthaelt("Heißt richtig", await a.locator("[data-gutschrift]").innerText(), "Cleanies an Empfänger senden");
pruefe("Zweite Kontozeile versteckt", await a.locator("#gutschriftstand").isVisible(), false);
pruefe("Empfängerwahl versteckt", await a.locator("#gutschriftwahl").isVisible(), false);
await a.screenshot({ path: `${AUS}/g1-ohne-haken.png`, fullPage: true });

console.log("== Mit Haken kommen Wahl und zweiter Kontostand");
await a.click("[data-gutschrift]");
await a.waitForTimeout(300);
pruefe("Steht auf an", await a.locator("[data-gutschrift]").getAttribute("aria-pressed"), "true");
pruefe("Empfängerwahl sichtbar", await a.locator("#gutschriftwahl").isVisible(), true);
pruefe("Drei im Haushalt, zwei zur Wahl", await a.locator("[data-gutempfaenger]").count(), 2);
pruefe("Zweite Kontozeile sichtbar", await a.locator("#gutschriftstand").isVisible(), true);
// Der Preis steht am Absendeknopf — die Belohnung darf beliebig teuer sein.
const preis = Number(await a.locator('[data-senden="antrag"]').getAttribute("data-kosten"));
const zeile = await a.locator("#gutschriftstand").innerText();
enthaelt("Nennt das Konto", zeile, "Konto ");
enthaelt("Alter Stand", zeile, "100");
enthaelt("Neuer Stand", zeile, String(100 + preis));
enthaelt("Eigenes Konto steht weiter da", await a.locator(".sheet").innerText(), "Konto nach Einlösung");
await a.screenshot({ path: `${AUS}/g2-mit-haken.png`, fullPage: true });

console.log("== Ein anderer Empfänger ändert die Zahlen");
// Die Testkonten heißen alle gleich; die Kennung ist das Unterscheidbare.
const ersterWer = await a.locator('[data-gutempfaenger][aria-pressed="true"]').getAttribute("data-gutempfaenger");
await a.locator("[data-gutempfaenger]").nth(1).click();
await a.waitForTimeout(300);
const zweiterWer = await a.locator('[data-gutempfaenger][aria-pressed="true"]').getAttribute("data-gutempfaenger");
pruefe("Empfänger gewechselt", zweiterWer !== ersterWer, true);
enthaelt("Und wieder ein Stand", await a.locator("#gutschriftstand").innerText(), String(100 + preis));

console.log("== Wieder ausschalten blendet beides aus");
await a.click("[data-gutschrift]");
await a.waitForTimeout(300);
pruefe("Kontozeile weg", await a.locator("#gutschriftstand").isVisible(), false);
pruefe("Wahl weg", await a.locator("#gutschriftwahl").isVisible(), false);

console.log("== Absenden mit Haken");
await a.click("[data-gutschrift]");
await a.waitForTimeout(250);
const anWen = await a.locator('[data-gutempfaenger][aria-pressed="true"]').getAttribute("data-gutempfaenger");
await a.fill("#termin", "heute Abend");
await a.click('[data-senden="antrag"]');
await a.waitForTimeout(1600);
await momenteWeg(a);
pruefe("Gutschrift steht im Antrag", await a.evaluate(async () =>
  (await (await fetch("/api/state")).json()).antraege[0]?.gutschrift_an), anWen);
enthaelt("Absender sieht es auf der Startseite", await a.evaluate(() => document.body.innerText), "an ");

console.log("== Der Empfänger sieht es beim Prüfen");
await laden(b);
await b.click('.navbar [data-go="pruefen"]');
await b.waitForSelector(".gutschein", { timeout: 8000 });
enthaelt("Hinweis auf der Karte", await b.locator(".gutschein").innerText(), "gehen an");
await b.screenshot({ path: `${AUS}/g3-pruefen.png`, fullPage: true });

const vorB = await b.evaluate(async () => (await (await fetch("/api/state")).json()).ich.punkte);
const vorA = await a.evaluate(async () => (await (await fetch("/api/state")).json()).ich.punkte);
const kosten = await b.evaluate(async () => (await (await fetch("/api/state")).json()).antraege[0].cost);
await b.click('[data-entscheiden="requests"][data-status="bestaetigt"]');
await b.waitForTimeout(1800);
await momenteWeg(b);

const nachB = await b.evaluate(async () => (await (await fetch("/api/state")).json()).ich.punkte);
await laden(a);
const nachA = await a.evaluate(async () => (await (await fetch("/api/state")).json()).ich.punkte);
pruefe("A hat bezahlt", nachA, vorA - kosten);
pruefe("Der Empfänger hat bekommen", nachB, anWen === "u-b" ? vorB + kosten : vorB);

console.log("== Der nächste Antrag fängt wieder ohne Haken an");
await antragOeffnen(a);
pruefe("Haken wieder aus", await a.locator("[data-gutschrift]").getAttribute("aria-pressed"), "false");
pruefe("Kontozeile wieder weg", await a.locator("#gutschriftstand").isVisible(), false);

console.log(fehler ? `\n${fehler} FEHLER` : "\nALLES GRÜN");
await browser.close();
process.exit(fehler ? 1 : 0);
