// Die App fragt alle 25 Sekunden nur nach dem Änderungszähler (/api/stand) und
// lädt den ganzen Zustand nur, wenn er weitergesprungen ist oder fünf Minuten um
// sind. Mit Playwrights Uhr laufen die Minuten in Sekunden durch.
import { chromium } from "playwright";
const ZIEL = "http://127.0.0.1:8792";

let fehler = 0;
const pruefe = (n, ist, soll) => {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) fehler++;
  console.log(`${ok ? "  ok  " : "  FEHL"} ${n}: ${JSON.stringify(ist)}${ok ? "" : " soll=" + JSON.stringify(soll)}`);
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const kontext = await browser.newContext({ viewport: { width: 375, height: 812 } });
await kontext.addCookies([{ name: "hq_sitzung", value: "tok-wa", domain: "127.0.0.1", path: "/" }]);
const seite = await kontext.newPage();
seite.on("pageerror", (e) => { console.log("  FEHL pageerror: " + e.message); fehler++; });

const abrufe = { state: 0, stand: 0 };
seite.on("request", (r) => {
  const pfad = new URL(r.url()).pathname;
  if (pfad === "/api/state") abrufe.state++;
  if (pfad === "/api/stand") abrufe.stand++;
});
const zaehlen = () => ({ ...abrufe });
const seit = (vorher) => ({ state: abrufe.state - vorher.state, stand: abrufe.stand - vorher.stand });
const warten = () => seite.waitForTimeout(700);
const weiter = async (ms) => { await seite.clock.runFor(ms); await warten(); };

await seite.clock.install();
await seite.goto(`${ZIEL}/app/`, { waitUntil: "networkidle" });
if (await seite.locator("#celebrate[data-open]").count()) await seite.click("#celebrate [data-schliessen]");
pruefe("Beim Öffnen einmal der ganze Zustand", abrufe.state >= 1, true);

console.log("== Nichts passiert: nur die kleine Frage");
let vorher = zaehlen();
await weiter(25_000);
pruefe("Nach 25 Sekunden: eine kleine Frage, kein voller Abruf", seit(vorher), { state: 0, stand: 1 });
vorher = zaehlen();
await weiter(50_000);
pruefe("Nach weiteren 50 Sekunden: zwei kleine Fragen", seit(vorher), { state: 0, stand: 2 });

console.log("== Jemand meldet etwas: dann lädt die App nach");
const S = await (await fetch(`${ZIEL}/api/state`, { headers: { Cookie: "hq_sitzung=tok-wa" } })).json();
const antwort = await fetch(`${ZIEL}/api/claims`, {
  method: "POST",
  headers: { Cookie: "hq_sitzung=tok-wa", "Content-Type": "application/json" },
  body: JSON.stringify({ questId: S.quests[0].id })
});
pruefe("Meldung angekommen", antwort.status, 200);
vorher = zaehlen();
await weiter(25_000);
pruefe("Die kleine Frage merkt es und holt den Zustand", seit(vorher), { state: 1, stand: 1 });
vorher = zaehlen();
await weiter(25_000);
pruefe("Danach wieder nur die kleine Frage", seit(vorher), { state: 0, stand: 1 });

console.log("== Spätestens nach fünf Minuten der ganze Zustand");
vorher = zaehlen();
await weiter(5 * 60_000);
pruefe("In fünf Minuten mindestens ein voller Abruf", seit(vorher).state >= 1, true);
pruefe("… und sonst nur kleine Fragen (höchstens 2 volle)", seit(vorher).state <= 2, true);

console.log("== Mit offenem Blatt wird nicht nachgesehen");
await seite.click('.appbar [data-go="einstellungen"]').catch(() => {});
await seite.evaluate(() => document.getElementById("scrim")?.setAttribute("data-open", ""));
vorher = zaehlen();
await weiter(50_000);
pruefe("Blatt offen: keine Abrufe", seit(vorher), { state: 0, stand: 0 });

await browser.close();
console.log(fehler ? `${fehler} Fehler` : "ALLES GRÜN");
process.exit(fehler ? 1 : 0);
