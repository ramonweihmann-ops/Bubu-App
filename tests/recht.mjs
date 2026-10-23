// Die Rechtstexte: Impressum, Datenschutz, Teilnahmebedingungen. Erreichbar, mit
// den Pflichtangaben, untereinander und aus App und Startseite verlinkt, auf dem
// Handy und im Dunkeln lesbar. Braucht die Sitzung von Anna aus fair-api.sh.
import { chromium } from "playwright";
const AUS = process.env.HQ_BILDER || "/tmp";
const ZIEL = "http://127.0.0.1:8792";

let fehler = 0;
const pruefe = (n, ist, soll) => {
  const ok = ist === soll;
  if (!ok) fehler++;
  console.log(`${ok ? "  ok  " : "  FEHL"} ${n}: ${JSON.stringify(ist)}${ok ? "" : " soll=" + JSON.stringify(soll)}`);
};
const enthaelt = (n, text, teil) => {
  const ok = String(text).includes(teil);
  if (!ok) fehler++;
  console.log(`${ok ? "  ok  " : "  FEHL"} ${n}${ok ? "" : `: „${teil}“ fehlt`}`);
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const seite = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
seite.on("pageerror", (e) => { console.log("  FEHL pageerror: " + e.message); fehler++; });
seite.on("console", (m) => { if (m.type() === "error" && !/favicon|vibrate|status of 40/.test(m.text())) { console.log("  FEHL console: " + m.text()); fehler++; } });
const text = async () => (await seite.locator("body").innerText()).replace(/\s+/g, " ");
const ueberlauf = () => seite.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

const SEITEN = {
  impressum: ["Impressum", ["Ramon Weihmann", "Friesische Straße 41", "24937 Flensburg", "info@rwtesting-environment.de", "§ 5 Digitale-Dienste-Gesetz"]],
  datenschutz: ["Datenschutzerklärung", ["Stand: 23. Oktober 2026", "Android-App", "Ramon Weihmann", "Cloudflare", "auf Rechenzentren in der EU festgelegt", "Google Ireland Limited",
    "hq_sitzung", "hq_einladung", "Fehlerberichte", "Testkauf für Plus", "Keine Zahlungsdaten", "Art. 8 DSGVO", "Unabhängige Landeszentrum für Datenschutz Schleswig-Holstein", "spätestens 30 Tagen"]],
  teilnahme: ["Teilnahmebedingungen für den Pilot", ["Am Pilot nimmt teil, wer eingeladen ist", "mindestens 16 Jahre", "keinen Geldwert", "testet ihr 14 Tage; danach schaltet ein Testkauf es frei", "Abgebucht wird im Pilot nichts", "Es gilt deutsches Recht", "/konto-loeschen"]]
};

for (const [pfad, [titel, pflicht]] of Object.entries(SEITEN)) {
  console.log(`== /${pfad}/`);
  const antwort = await seite.goto(`${ZIEL}/${pfad}/`, { waitUntil: "networkidle" });
  pruefe("Die Seite kommt", antwort.status(), 200);
  pruefe("Die Überschrift", (await seite.locator("h1").innerText()).trim(), titel);
  const t = await text() + (await seite.content());
  for (const p of pflicht) enthaelt(`Enthält „${p}“`, t, p);
  pruefe("Kein „Punkte“", /\bPunkte\b/.test(await text()), false);
  pruefe("375 px: kein seitliches Scrollen", await ueberlauf(), false);
  const links = await seite.locator("footer a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  pruefe("Unten die anderen Seiten", links.length >= 3, true);
  for (const href of links) {
    const r = await (await fetch(`${ZIEL}${href}`)).status;
    pruefe(`… ${href} erreichbar`, r, 200);
  }
  await seite.screenshot({ path: `${AUS}/re-${pfad}.png`, fullPage: true });
}

console.log("== Kinder: der Anker für „Mehr dazu“");
await seite.goto(`${ZIEL}/datenschutz/#kinder`, { waitUntil: "networkidle" });
pruefe("Abschnitt 7 ist da", await seite.locator("#kinder").count(), 1);

console.log("== Dunkel");
const dunkel = await browser.newPage({ viewport: { width: 375, height: 812 }, colorScheme: "dark" });
await dunkel.goto(`${ZIEL}/datenschutz/`, { waitUntil: "networkidle" });
const hell = await dunkel.evaluate(() => {
  const [r, g, b] = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number);
  return (r * 299 + g * 587 + b * 114) / 1000;
});
pruefe("Dunkler Hintergrund", hell < 60, true);
await dunkel.close();

console.log("== Verlinkt von Startseite, Anmeldung und Einstellungen");
await seite.goto(`${ZIEL}/`, { waitUntil: "networkidle" });
for (const href of ["/impressum/", "/datenschutz/", "/teilnahme/", "/konto-loeschen/"]) {
  pruefe(`Startseite → ${href}`, await seite.locator(`footer a[href="${href}"]`).count(), 1);
}
await seite.goto(`${ZIEL}/app/`, { waitUntil: "networkidle" });
for (const href of ["/teilnahme/", "/datenschutz/", "/impressum/"]) {
  pruefe(`Anmeldung → ${href}`, await seite.locator(`.mitte a[href="${href}"]`).count(), 1);
}
enthaelt("Anmeldung nennt die Teilnahmebedingungen", await text(), "Mit der Anmeldung nimmst du zu den Teilnahmebedingungen am Pilot teil");
await seite.screenshot({ path: `${AUS}/re-anmeldung.png` });
await seite.context().addCookies([{ name: "hq_sitzung", value: "tok-wa", domain: "127.0.0.1", path: "/" }]);
await seite.goto(`${ZIEL}/app/`, { waitUntil: "networkidle" });
if (await seite.locator("#celebrate[data-open]").count()) await seite.click("#celebrate [data-schliessen]");
await seite.click('.appbar [data-go="einstellungen"]');
await seite.waitForSelector(".rechtslinks");
for (const href of ["/datenschutz/", "/teilnahme/", "/impressum/"]) {
  pruefe(`Einstellungen → ${href}`, await seite.locator(`.rechtslinks a[href="${href}"]`).count(), 1);
}
pruefe("Sie öffnen sich neben der App", await seite.locator('.rechtslinks a[target="_blank"]').count(), 3);
await seite.goto(`${ZIEL}/konto-loeschen/`, { waitUntil: "networkidle" });
pruefe("Löschseite → Datenschutz", await seite.locator('a[href="/datenschutz/"]').count(), 1);

await browser.close();
console.log(fehler ? `${fehler} Fehler` : "ALLES GRÜN");
process.exit(fehler ? 1 : 0);
