// Prüft das Event-Mockup: lädt es, sammelt Konsolenfehler und legt Bilder ab.
import { chromium } from "playwright";

const ZIEL = process.env.HQ_ZIEL || "http://127.0.0.1:8792";
const BILDER = process.env.HQ_BILDER || "/tmp";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const seite = await browser.newPage({ viewport: { width: 1120, height: 1000 } });

const fehler = [];
seite.on("console", (m) => { if (m.type() === "error") fehler.push(m.text()); });
seite.on("pageerror", (e) => fehler.push(String(e)));

const antwort = await seite.goto(`${ZIEL}/mockup-events/`, { waitUntil: "networkidle" });
if (antwort.status() !== 200) { console.log("FEHLER: Status", antwort.status()); process.exit(1); }

const phones = await seite.locator(".phone").count();
const tabellen = await seite.locator("table").count();
const fragen = await seite.locator(".frage").count();
console.log(`${phones} Telefone, ${tabellen} Tabellen, ${fragen} Entscheidungen`);
if (phones < 9) { console.log("FEHLER: zu wenige Telefone"); process.exit(1); }

// Läuft irgendwo noch das Wort „Punkte“ statt „Cleanies“?
const text = await seite.locator("body").innerText();
if (/\bPunkte\b/.test(text)) { console.log("FEHLER: „Punkte“ statt „Cleanies“"); process.exit(1); }

// Die Waage muss wirklich zeichnen — ein leeres <symbol> fiele sonst nicht auf.
const waage = await seite.locator("#i-waage path").count();
if (waage < 3) { console.log("FEHLER: i-waage ist leer"); process.exit(1); }

// Kein Telefon darf überlaufen: alles muss innerhalb des Rahmens bleiben.
const ueber = await seite.evaluate(() => [...document.querySelectorAll(".phone")]
  .filter((p) => p.scrollWidth > p.clientWidth + 1).length);
if (ueber) { console.log(`FEHLER: ${ueber} Telefone laufen seitlich über`); process.exit(1); }

await seite.screenshot({ path: `${BILDER}/ev-ganz.png`, fullPage: true });
for (const [i, name] of ["ev1-knopf", "ev2-blatt", "ev3-dauer"].entries()) {
  await seite.locator(".reihe").nth(i).screenshot({ path: `${BILDER}/${name}.png` });
}
await seite.locator(".icontausch").screenshot({ path: `${BILDER}/ev4-waage.png` });

await browser.close();
console.log(fehler.length ? `FEHLER im Browser:\n${fehler.join("\n")}` : "Keine Fehler im Browser.");
process.exit(fehler.length ? 1 : 0);
