// Das Mockup „Homi Point als Android-App“: zwei Wege aufs Handy (Play Store oder aus
// dem Browser), was in der App gleich bleibt, zwei Symbole zur Wahl, der Zeitplan mit
// dem Play Store und die Entscheidungen. Nichts läuft über, auch nicht auf dem Handy
// und im Dunkeln.
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
// Eine fehlende Datei meldet die Antwort selbst (unten, mit Adresse) — die Konsole sagt dazu nur „404“.
seite.on("console", (m) => { if (m.type() === "error" && !/favicon|status of 404/.test(m.text())) { console.log("  FEHL console: " + m.text()); fehler++; } });
seite.on("response", (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) { console.log("  FEHL " + r.status() + " " + r.url()); fehler++; } });
const text = async (sel) => (await seite.locator(sel).innerText()).replace(/\s+/g, " ").trim();
const ueberlauf = (s) => s.evaluate(() =>
  [...document.querySelectorAll(".phone, .phone .inhalt, .symbolkarte, .frage, .plan li")].filter((p) => p.scrollWidth > p.clientWidth + 1).length);
const bilderDa = (s) => s.evaluate(() => [...document.images].filter((i) => !i.complete || !i.naturalWidth).length);

const antwort = await seite.goto(`${ZIEL}/mockup-android/`, { waitUntil: "networkidle" });
pruefe("Die Seite kommt", antwort.status(), 200);
pruefe("Kein „Punkte“", /\bPunkte\b/.test(await seite.locator("body").innerText()), false);
pruefe("Sechs Telefone", await seite.locator(".phone").count(), 6);
pruefe("Alle Bilder geladen", await bilderDa(seite), 0);
pruefe("Nichts läuft über", await ueberlauf(seite), 0);
pruefe("Store-Kurztext höchstens 80 Zeichen", (await text("#kurz")).length <= 80, true);
pruefe("Vier Fragen", await seite.locator(".frage").count(), 4);
pruefe("Updates erklärt", (await text("#updates")).includes("ohne Store"), true);

console.log("== A · Play Store");
pruefe("Einladung mit Testgruppe", (await text("#p1")).includes("Testgruppe beitreten"), true);
pruefe("Store-Eintrag nur für Tester", (await text("#p2")).includes("Du nimmst am Test von Homi Point teil"), true);
pruefe("Zeitplan sichtbar", await seite.locator("#zeitplan").isVisible(), true);
pruefe("12 Tester, 14 Tage", (await text("#zeitplan")).includes("14 Tage am Stück mit mindestens 12 Testern"), true);
pruefe("Haus ist vorgewählt", await seite.locator('[data-symbol][aria-pressed="true"]').getAttribute("data-symbol"), "haus");
pruefe("Startbildschirm zeigt das Haus", await seite.locator("#p3 .unseres img").getAttribute("src"), "haus.webp");
await seite.screenshot({ path: `${AUS}/ma-a.png`, fullPage: true });

console.log("== Symbol wechseln");
await seite.click('[data-symbol="logo"]');
pruefe("Logo gewählt", await seite.locator('[data-symbol][aria-pressed="true"]').getAttribute("data-symbol"), "logo");
pruefe("Startbildschirm zeigt das Logo", await seite.locator("#p3 .unseres img").getAttribute("src"), "logo-symbol.webp");
pruefe("Store zeigt das Logo", await seite.locator("#p2 .store-kopf img").getAttribute("src"), "logo-symbol.webp");
await seite.click('[data-symbol="haus"]');

console.log("== B · Aus dem Browser");
await seite.click('[data-weg="b"]');
pruefe("Band zum Installieren", (await text("#p1")).includes("Homi Point als App"), true);
pruefe("Chrome fragt nach", (await text("#p2")).includes("App installieren?"), true);
pruefe("Kein Zeitplan", await seite.locator("#zeitplan").isVisible(), false);
pruefe("In der App bleibt alles", (await text("#p5")).includes("Tom hat etwas erledigt"), true);
pruefe("Nichts läuft über (B)", await ueberlauf(seite), 0);
await seite.screenshot({ path: `${AUS}/ma-b.png`, fullPage: true });

console.log("== Handy, hell und dunkel");
for (const thema of ["light", "dark"]) {
  const handy = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, colorScheme: thema });
  handy.on("pageerror", (e) => { console.log("  FEHL pageerror: " + e.message); fehler++; });
  await handy.goto(`${ZIEL}/mockup-android/`, { waitUntil: "networkidle" });
  pruefe(`375 px ${thema}: kein seitliches Scrollen`, await handy.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
  pruefe(`375 px ${thema}: nichts läuft über`, await ueberlauf(handy), 0);
  for (const p of ["p1", "p2", "p3", "p4", "p5", "p6"]) await handy.locator(`#${p}`).screenshot({ path: `${AUS}/ma-${p}-${thema}.png` });
  await handy.locator(".symbole").screenshot({ path: `${AUS}/ma-symbole-${thema}.png` });
  await handy.click('[data-weg="b"]');
  await handy.locator("#p1").screenshot({ path: `${AUS}/ma-b1-${thema}.png` });
  await handy.locator("#p2").screenshot({ path: `${AUS}/ma-b2-${thema}.png` });
  await handy.close();
}

await browser.close();
console.log(fehler ? `${fehler} Fehler` : "ALLES GRÜN");
process.exit(fehler ? 1 : 0);
