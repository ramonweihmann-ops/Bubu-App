// Das Mockup „Buchung anzweifeln“: vier Telefone (Verlauf antippen, Anzweifeln,
// Abstimmung, Zurückgesetzt), die festen Regeln und fünf Entscheidungen. Nichts läuft
// über, auch nicht auf dem Handy und im Dunkeln.
import { chromium } from "playwright";
const ZIEL = process.env.HQ_ZIEL || "http://127.0.0.1:8792";
const AUS = process.env.HQ_BILDER || "/tmp";

let fehler = 0;
const pruefe = (n, ist, soll) => {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) fehler++;
  console.log(`${ok ? "  ok  " : "  FEHL"} ${n}: ${JSON.stringify(ist)}${ok ? "" : " soll=" + JSON.stringify(soll)}`);
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const seite = await browser.newPage({ viewport: { width: 1180, height: 1000 } });
seite.on("pageerror", (e) => { console.log("  FEHL pageerror: " + e.message); fehler++; });
seite.on("response", (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) { console.log("  FEHL " + r.status() + " " + r.url()); fehler++; } });
const text = async (sel) => (await seite.locator(sel).innerText()).replace(/\s+/g, " ").trim();
const ueberlauf = (s) => s.evaluate(() =>
  [...document.querySelectorAll(".phone, .phone .inhalt, .blatt, .karte, .frage, .regel")].filter((p) => p.scrollWidth > p.clientWidth + 1).length);
const bilderFehlen = (s) => s.evaluate(() => [...document.images].filter((i) => !i.complete || !i.naturalWidth).length);

const antwort = await seite.goto(`${ZIEL}/mockup-zweifel/`, { waitUntil: "networkidle" });
pruefe("Die Seite kommt", antwort.status(), 200);
pruefe("Kein „Punkte“", /\bPunkte\b/.test(await seite.locator("body").innerText()), false);
pruefe("Vier Telefone", await seite.locator(".phone").count(), 4);
pruefe("Alle Bilder geladen", await bilderFehlen(seite), 0);
pruefe("Nichts läuft über", await ueberlauf(seite), 0);
pruefe("Fünf Entscheidungen", await seite.locator(".frage").count(), 5);
pruefe("Jede mit Empfehlung", await seite.locator(".frage .empf").count(), 5);

console.log("== Der Ablauf");
pruefe("1: Bad reinigen zweimal im Verlauf", (await text("#p1")).match(/Bad reinigen/g)?.length, 2);
pruefe("1: Antippbar mit ›", await seite.locator("#p1 li.waehlbar").count(), 4);
pruefe("2: Gründe zur Wahl", await seite.locator("#p2 .wahl span").count(), 4);
pruefe("2: Zur Abstimmung", (await text("#p2")).includes("Zur Abstimmung geben"), true);
pruefe("3: Abstimmungskarte mit −5", (await text("#p3 .karte")).includes("−5"), true);
pruefe("3: Zurücksetzen oder Bleibt", (await text("#p3 .knoepfe")), "Bleibt Zurücksetzen");
pruefe("4: Gegenbuchung oben", (await text("#p4 .liste li:first-child")).includes("Zurückgesetzt: Bad reinigen"), true);
pruefe("4: Alte Zeile durchgestrichen", await seite.locator("#p4 li.weg").count(), 1);
await seite.screenshot({ path: `${AUS}/mz-ganz.png`, fullPage: true });

console.log("== Handy, hell und dunkel");
for (const thema of ["light", "dark"]) {
  const handy = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, colorScheme: thema });
  handy.on("pageerror", (e) => { console.log("  FEHL pageerror: " + e.message); fehler++; });
  await handy.goto(`${ZIEL}/mockup-zweifel/`, { waitUntil: "networkidle" });
  pruefe(`375 px ${thema}: kein seitliches Scrollen`, await handy.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
  pruefe(`375 px ${thema}: nichts läuft über`, await ueberlauf(handy), 0);
  for (const p of ["p1", "p2", "p3", "p4"]) await handy.locator(`#${p}`).screenshot({ path: `${AUS}/mz-${p}-${thema}.png` });
  await handy.close();
}

await browser.close();
console.log(fehler ? `${fehler} Fehler` : "ALLES GRÜN");
process.exit(fehler ? 1 : 0);
