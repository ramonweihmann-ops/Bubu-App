// Das Mockup „Testkauf für Plus“: zwei Varianten für den Anlass, die Plus-Seite mit
// den echten Preisen, der Testkauf mit der ehrlichen Frage, „Jetzt nicht“ mit Gründen,
// die Folgen ohne Kauf und die Dashboard-Kacheln. Nichts läuft über, auch nicht auf
// dem Handy und im Dunkeln.
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
const ueberlauf = (s) => s.evaluate(() =>
  [...document.querySelectorAll(".phone, .phone .screen, .karte, .plan")].filter((p) => p.scrollWidth > p.clientWidth + 1).length);

const antwort = await seite.goto(`${ZIEL}/mockup-testkauf/`, { waitUntil: "networkidle" });
pruefe("Die Seite kommt", antwort.status(), 200);
pruefe("Kein „Punkte“", /\bPunkte\b/.test(await seite.locator("body").innerText()), false);
pruefe("Fünf Telefone", await seite.locator(".phone").count(), 5);
pruefe("Nichts läuft über", await ueberlauf(seite), 0);

console.log("== Variante A");
pruefe("Anlass: Test endet", (await text("#p1")).includes("Plus-Test endet übermorgen"), true);
pruefe("Drei Pläne mit echten Preisen", await seite.locator("#p2 .plan").count(), 3);
pruefe("Jahr ist vorgewählt", await seite.locator('#p2 .plan[aria-checked="true"]').getAttribute("data-plan"), "jahr");
pruefe("Knopf nennt den Preis", (await text("#p2 [data-kaufen]")), "Kaufen · 11,99 €");
pruefe("Kein Geld wird abgebucht — steht schon vorher da", (await text("#p2")).includes("Es wird nichts abgebucht"), true);
await seite.click('#p2 [data-plan="monat"]');
pruefe("Plan wechseln ändert den Knopf", (await text("#p2 [data-kaufen]")), "Kaufen · 1,99 €");
pruefe("Vor dem Kauf: noch nichts", (await text("#p3")).includes("Erst links auf Kaufen tippen"), true);
await seite.click("#p2 [data-kaufen]");
pruefe("Danke mit Testkauf", (await text("#p3")).includes("Das war ein Testkauf über Plus pro Monat (1,99 €)"), true);
pruefe("Die ehrliche Frage", await seite.locator("#p3 [data-ehrlich]").count(), 3);
await seite.click('#p3 [data-ehrlich="vielleicht"]');
pruefe("Antwort bedankt", (await text("#p3")).includes("Danke für die Antwort"), true);
pruefe("Folgen: Fair-Bericht pausiert", (await text("#p4")).includes("Euer Test ist vorbei"), true);
await seite.click('#p5 [data-grund="Zu teuer"]');
await seite.click('#p5 [data-grund="Erst später"]');
pruefe("Zwei Gründe gewählt", await seite.locator('#p5 [data-grund][aria-pressed="true"]').count(), 2);
await seite.screenshot({ path: `${AUS}/mt-a.png`, fullPage: true });

console.log("== Variante B");
await seite.click('[data-variante="b"]');
pruefe("Anlass: Gefällt euch Plus?", (await text("#p1")).includes("Gefällt euch Plus?"), true);
pruefe("Kauf zurückgesetzt", (await text("#p3")).includes("Erst links auf Kaufen tippen"), true);
pruefe("Nichts fällt weg", (await text("#p4")).includes("Nichts fällt weg"), true);
pruefe("Nenner im Dashboard passt sich an", (await text("#nenner")).startsWith("3 von 32 Haushalten ab Tag 14"), true);
pruefe("Nichts läuft über (B)", await ueberlauf(seite), 0);

console.log("== Handy, hell und dunkel");
for (const thema of ["light", "dark"]) {
  const handy = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, colorScheme: thema });
  handy.on("pageerror", (e) => { console.log("  FEHL pageerror: " + e.message); fehler++; });
  await handy.goto(`${ZIEL}/mockup-testkauf/`, { waitUntil: "networkidle" });
  pruefe(`375 px ${thema}: kein seitliches Scrollen`, await handy.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
  pruefe(`375 px ${thema}: nichts läuft über`, await ueberlauf(handy), 0);
  await handy.click("#p2 [data-kaufen]");
  await handy.locator("#p2").screenshot({ path: `${AUS}/mt-waehlen-${thema}.png` });
  await handy.locator("#p3").screenshot({ path: `${AUS}/mt-danke-${thema}.png` });
  await handy.locator("#p1").screenshot({ path: `${AUS}/mt-anlass-${thema}.png` });
  await handy.locator("#p4").screenshot({ path: `${AUS}/mt-folgen-${thema}.png` });
  await handy.close();
}

await browser.close();
console.log(fehler ? `${fehler} Fehler` : "ALLES GRÜN");
process.exit(fehler ? 1 : 0);
