// Das Mockup „Konto löschen und Haushalt verlassen“: drei Arten zu bestätigen,
// vier Personen mit verschiedenen Folgen, die Sicht der anderen und die Löschseite
// im Web. Nichts läuft über, auch nicht auf dem Handy und im Dunkeln.
import { chromium } from "playwright";
const ZIEL = process.env.HQ_ZIEL || "http://127.0.0.1:8792";
const AUS = process.env.HQ_BILDER || "/tmp";

let fehler = 0;
const pruefe = (n, ist, soll) => {
  const ok = ist === soll;
  if (!ok) fehler++;
  console.log(`${ok ? "  ok  " : "  FEHL"} ${n}: ${JSON.stringify(ist)}${ok ? "" : " soll=" + JSON.stringify(soll)}`);
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const seite = await browser.newPage({ viewport: { width: 1180, height: 1000 } });
seite.on("pageerror", (e) => { console.log("  FEHL pageerror: " + e.message); fehler++; });
seite.on("console", (m) => { if (m.type() === "error" && !/favicon|404/.test(m.text())) { console.log("  FEHL console: " + m.text()); fehler++; } });

const antwort = await seite.goto(`${ZIEL}/mockup-konto/`, { waitUntil: "networkidle" });
pruefe("Die Seite kommt", antwort.status(), 200);
pruefe("Kein „Punkte“", /\bPunkte\b/.test(await seite.locator("body").innerText()), false);
pruefe("Vier Telefone", await seite.locator(".phone").count(), 4);
pruefe("Nichts läuft seitlich über", await seite.evaluate(() =>
  [...document.querySelectorAll(".phone, .phone .inhalt, .blatt")].filter((p) => p.scrollWidth > p.clientWidth + 1).length), 0);
const text = async (sel) => (await seite.locator(sel).innerText()).replace(/\s+/g, " ").trim();

console.log("== Anna löscht, Ben bleibt");
await seite.click("#pa [data-loeschen]");
const was = await text("#pa [data-blatt]");
pruefe("Ihre Cleanies verfallen", was.includes("Deine 128 Cleanies verfallen"), true);
pruefe("Der Haushalt bleibt für Ben", was.includes("Der Haushalt bleibt für Ben"), true);
pruefe("Tipp: vorher verschenken", was.includes("vorher Ben schenken"), true);
pruefe("Auch nur verlassen geht", await seite.locator("#pa [data-blatt] [data-verlassen]").count(), 1);
await seite.click("#pa [data-blatt] [data-export]");
pruefe("Export vorher", await text("#pa [data-toast]"), "Datei gespeichert.");
await seite.click("#pa [data-weiter]");
pruefe("A: erst gesperrt", await seite.locator("#pa [data-endgueltig]").isDisabled(), true);
await seite.fill("#pa [data-wort]", "lösch");
pruefe("A: halbes Wort reicht nicht", await seite.locator("#pa [data-endgueltig]").isDisabled(), true);
await seite.fill("#pa [data-wort]", "Löschen ");
pruefe("A: das Wort macht ihn scharf", await seite.locator("#pa [data-endgueltig]").isDisabled(), false);
await seite.locator("#pa").screenshot({ path: `${AUS}/mko1-eintippen.png` });
await seite.click("#pa [data-endgueltig]");
pruefe("A: gelöscht", (await text("#pa [data-fertig]")).includes("Dein Konto ist gelöscht"), true);
await seite.click("#pa [data-neu]");
pruefe("A: danach die Anmeldung", (await text("#pa [data-fertig]")).includes("Mit Google anmelden"), true);

console.log("== B: gedrückt halten");
await seite.click("#pb [data-loeschen]");
await seite.click("#pb [data-weiter]");
const knopf = seite.locator("#pb [data-halten]");
await knopf.hover();
await seite.mouse.down();
await seite.waitForTimeout(700);
await seite.mouse.up();
pruefe("B: zu kurz gehalten — nichts passiert", await seite.locator("#pb [data-fertig]").count(), 0);
await knopf.hover();
await seite.mouse.down();
await seite.waitForTimeout(2300);
await seite.mouse.up();
pruefe("B: zwei Sekunden — gelöscht", (await text("#pb [data-fertig]")).includes("Dein Konto ist gelöscht"), true);

console.log("== C: 14 Tage Bedenkzeit");
await seite.click("#pc [data-loeschen]");
await seite.click("#pc [data-weiter]");
pruefe("C: das Datum steht da", (await text("#pc [data-blatt]")).includes("3. November"), true);
await seite.click("#pc [data-stilllegen]");
pruefe("C: stillgelegt", (await text("#pc [data-fertig]")).includes("stillgelegt"), true);
await seite.click("#pc [data-zurueckholen]");
pruefe("C: zurückgeholt", await seite.locator("#pc [data-loeschen]").count(), 1);

console.log("== Haushalt verlassen");
await seite.click("#pc [data-verlassen]");
pruefe("Das Konto bleibt", (await text("#pc [data-blatt]")).includes("Dein Konto bleibt"), true);
await seite.click("#pc [data-verlassen-ok]");
pruefe("Ohne Haushalt: neu gründen oder beitreten", (await text("#pc [data-fertig]")).includes("Mit Code beitreten"), true);

console.log("== Ben danach");
pruefe("Ben bekommt Bescheid", (await text("#pd")).includes("Anna ist nicht mehr dabei"), true);
pruefe("Im Verlauf ohne Namen", await seite.locator("#pd .ehemalig").count(), 3);

console.log("== Mama, die letzte Erwachsene mit Kindern");
await seite.click('[data-wer="familie"]');
await seite.click("#pa [data-loeschen]");
const fam = await text("#pa [data-blatt]");
pruefe("Die Kinder werden genannt", fam.includes("Lena") && fam.includes("Tom"), true);
pruefe("Der ganze Haushalt geht", fam.includes("Der ganze Haushalt"), true);
pruefe("Kein Fair-Bericht-Hinweis", fam.includes("Fair-Bericht"), false);
await seite.click("#pb [data-verlassen]");
pruefe("Verlassen geht nicht", (await text("#pb [data-blatt]")).includes("kannst du nicht gehen"), true);
pruefe("Bei Ben: niemand bleibt", (await text("#pd")).includes("Niemand bleibt"), true);
await seite.locator(".reihe").first().screenshot({ path: `${AUS}/mko2-familie.png` });

console.log("== Sina allein");
await seite.click('[data-wer="allein"]');
await seite.click("#pa [data-verlassen]");
pruefe("Allein: der Haushalt wird gelöscht", (await text("#pa [data-blatt]")).includes("Der Haushalt wird gelöscht"), true);

console.log("== Die Löschseite im Web");
pruefe("Mit Google anmelden", await seite.locator("[data-web-anmelden]").count(), 1);
pruefe("Sicherungen nach 30 Tagen", (await text(".seite")).includes("spätestens 30 Tagen"), true);

console.log("== Handy und dunkel");
const handy = await browser.newPage({ viewport: { width: 375, height: 812 }, colorScheme: "dark" });
await handy.goto(`${ZIEL}/mockup-konto/`, { waitUntil: "networkidle" });
pruefe("375 px: kein seitliches Scrollen", await handy.evaluate(() => document.documentElement.scrollWidth <= 375), true);
const hell = await handy.evaluate(() => {
  const [r, g, b] = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number);
  return (r * 299 + g * 587 + b * 114) / 1000;
});
pruefe("Der Hintergrund ist dunkel", hell < 60, true);
await handy.close();

await browser.close();
console.log(fehler ? `${fehler} Fehler` : "ALLES GRÜN");
process.exit(fehler ? 1 : 0);
