// Das Mockup „Pilot-Codes und Betriebs-Dashboard“: zwei Orte für die Einladung,
// vier Arten zu kommen, das Dashboard auf dem Handy und am Rechner. Nichts läuft
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
seite.on("console", (m) => { if (m.type() === "error" && !/favicon|404/.test(m.text())) { console.log("  FEHL console: " + m.text()); fehler++; } });
const text = async (sel) => (await seite.locator(sel).innerText()).replace(/\s+/g, " ").trim();
const ueberlauf = () => seite.evaluate(() =>
  [...document.querySelectorAll(".phone, .phone .screen, .db, .karte, .blatt")].filter((p) => p.scrollWidth > p.clientWidth + 1).length);

const antwort = await seite.goto(`${ZIEL}/mockup-pilot/`, { waitUntil: "networkidle" });
pruefe("Die Seite kommt", antwort.status(), 200);
pruefe("Kein „Punkte“", /\bPunkte\b/.test(await seite.locator("body").innerText()), false);
pruefe("Zwei Telefone", await seite.locator(".phone").count(), 2);
pruefe("Nichts läuft über", await ueberlauf(), 0);

console.log("== Mit Einladungslink");
pruefe("A: Einladung erkannt", (await text("#pa")).includes("Familie Weber"), true);
await seite.click("#pa [data-weiter]");
pruefe("A: nach der Anmeldung angenommen", (await text("#pa")).includes("Pilot-Einladung angenommen"), true);
await seite.click("#pa [data-weiter]");
pruefe("A: weiter wie heute", (await text("#pa")).includes("Euer Haushalt"), true);
await seite.click("#pb [data-weiter]");
pruefe("B: angenommen ohne Extraschritt", (await text("#pb")).includes("Pilot-Einladung angenommen"), true);
await seite.click("#pb [data-weiter]");
pruefe("B: gleich der Haushalt", (await text("#pb")).includes("Euer Haushalt"), true);
await seite.screenshot({ path: `${AUS}/mp-link.png`, clip: { x: 0, y: 700, width: 1180, height: 900 } }).catch(() => {});

console.log("== Code schon benutzt");
await seite.click('[data-wer="benutzt"]');
pruefe("A: Anmelden gesperrt", await seite.locator("#pa .btn.rand").isDisabled(), true);
pruefe("A: sagt warum", (await text("#pa")).includes("schon eingelöst"), true);
await seite.click("#pb [data-weiter]");
await seite.click("#pb [data-weiter]");
pruefe("B: neuer Schritt „Deine Einladung“", (await text("#pb")).includes("Deine Einladung"), true);
pruefe("B: Weiter gesperrt", await seite.locator("#pb .btn.rot").isDisabled(), true);

console.log("== Ohne Einladung");
await seite.click('[data-wer="ohne"]');
pruefe("A: erklärt den Pilot", (await text("#pa")).includes("gerade im Pilot"), true);
pruefe("A: wer dabei ist, kommt trotzdem rein", (await text("#pa")).includes("Ich bin schon dabei"), true);

console.log("== Dashboard");
pruefe("Vier Tore", await seite.locator("#db .tor").count(), 4);
pruefe("Tor Woche 4 erreicht", (await text("#db .tor >> nth=0")).includes("erreicht"), true);
pruefe("Testkauf kommt noch", (await text("#db .tor >> nth=2")).includes("kommt mit dem Testkauf"), true);
pruefe("Kritische Fehler: 2", (await text("#db .tor >> nth=3")).includes("2"), true);
await seite.click("#db [data-erledigt] >> nth=0");
await seite.click("#db [data-erledigt] >> nth=0");
pruefe("Nach „Erledigt“: Tor erreicht", (await text("#db .tor >> nth=3")).replace(/\s/g, "").startsWith("KritischeFehleroffen0"), true);
await seite.click("#db [data-tabelle]");
pruefe("Diagramm auch als Tabelle", await seite.locator("#db table").count(), 1);
await seite.click("#db [data-tabelle]");
pruefe("… und zurück", await seite.locator("#db svg.diagramm").count(), 1);
await seite.click("#db [data-neu]");
await seite.fill("#ein-name", "Familie Schmidt");
await seite.click("[data-anlegen]");
pruefe("Neue Einladung mit Code und Link", (await text("#blatt-inhalt")).includes("haus-quest.com/app/?pilot=HOMI-"), true);
await seite.screenshot({ path: `${AUS}/mp-einladung.png` });
await seite.keyboard.press("Escape");
pruefe("Steht in der Liste", (await text("#db")).includes("Familie Schmidt"), true);
await seite.click("#db [data-zurueckziehen] >> nth=0");
pruefe("Zurückziehen", (await text("#db")).includes("zurückgezogen gerade"), true);
await seite.click("#db [data-pflicht]");
pruefe("Pilot-Schalter aus", await seite.locator("#db [data-pflicht]").getAttribute("aria-checked"), "false");
await seite.click('[data-breite="rechner"]');
pruefe("Am Rechner: Tore nebeneinander", await seite.evaluate(() => {
  const t = [...document.querySelectorAll("#db .tor")].map((e) => e.getBoundingClientRect().top);
  return new Set(t.map(Math.round)).size;
}), 1);
pruefe("Nichts läuft über (Rechner)", await ueberlauf(), 0);
await seite.locator(".browser").screenshot({ path: `${AUS}/mp-dashboard-rechner.png` });

console.log("== Handy, hell und dunkel");
for (const thema of ["light", "dark"]) {
  const handy = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, colorScheme: thema });
  handy.on("pageerror", (e) => { console.log("  FEHL pageerror: " + e.message); fehler++; });
  await handy.goto(`${ZIEL}/mockup-pilot/`, { waitUntil: "networkidle" });
  pruefe(`375 px ${thema}: kein seitliches Scrollen`, await handy.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
  pruefe(`375 px ${thema}: nichts läuft über`, await handy.evaluate(() =>
    [...document.querySelectorAll(".phone, .phone .screen, .db, .karte")].filter((p) => p.scrollWidth > p.clientWidth + 1).length), 0);
  await handy.locator("#pa").screenshot({ path: `${AUS}/mp-a-${thema}.png` });
  await handy.locator(".browser").screenshot({ path: `${AUS}/mp-dashboard-${thema}.png` });
  await handy.close();
}

await browser.close();
console.log(fehler ? `${fehler} Fehler` : "ALLES GRÜN");
process.exit(fehler ? 1 : 0);
