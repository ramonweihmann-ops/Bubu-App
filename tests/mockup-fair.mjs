// Das Fair-Bericht-Mockup: drei Varianten hängen an denselben Schaltern.
// Zeitraum, Soll, Plus und Kind wirken überall, Tooltips und Tabellen sind da,
// und nichts läuft über — auch nicht auf dem Handy und im Dunkeln.
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
const wache = (s) => {
  s.on("pageerror", (e) => { console.log("  FEHL pageerror: " + e.message); fehler++; });
  s.on("console", (m) => { if (m.type() === "error" && !/favicon|404/.test(m.text())) { console.log("  FEHL console: " + m.text()); fehler++; } });
};
wache(seite);

const antwort = await seite.goto(`${ZIEL}/mockup-fair/`, { waitUntil: "networkidle" });
pruefe("Die Seite kommt", antwort.status(), 200);
pruefe("Kein „Punkte“", /Punkte/.test(await seite.locator("body").innerText()), false);
pruefe("Drei Telefone", await seite.locator(".phone").count(), 3);
const ueberlauf = () => seite.evaluate(() =>
  [...document.querySelectorAll(".phone, .phone .inhalt")].filter((p) => p.scrollWidth > p.clientWidth + 1).length);
pruefe("Nichts läuft seitlich über", await ueberlauf(), 0);
pruefe("Keine Knöpfe in Knöpfen", await seite.locator("button button").count(), 0);

const text = async (l) => (await l.innerText()).replace(/\s+/g, " ").trim();
const sub = (id) => text(seite.locator(`#${id} .kopf .sub`));
const regler = (k, v) => seite.click(`#regler [data-${k}="${v}"]`);
const urteilA = () => seite.locator("#pa [data-urteil]").getAttribute("data-u");
const saeulen = () => seite.locator('#pa [data-diagramm="verlauf"] rect.s1').count();
const leer = () => seite.locator('#pa [data-diagramm="verlauf"] rect.leer').count();
const punkteAn = () => seite.locator("#pb .story .punkte i.an").count();
const punkteAlle = () => seite.locator("#pb .story .punkte i").count();

console.log("== Alle drei zeigen dasselbe");
const waageA = (await text(seite.locator("#pa .held .zahl"))).replace(/\s/g, "");
const waageC = (await text(seite.locator("#pc .kachel .v").first())).replace(/\s/g, "");
pruefe("A und C haben dieselbe Waage", waageA, waageC);
pruefe("Monat ist eingestellt", await sub("pa"), "Oktober · Anna und Ben");
pruefe("Oktober: vier Wochen mit Daten", await saeulen(), 4);
pruefe("… und die offene Woche", await leer(), 1);
pruefe("Der Satz nennt den Vormonat", (await text(seite.locator("#pa .satz").first())).includes("im September"), true);
await seite.locator("#pa").screenshot({ path: `${AUS}/fb1-bericht.png` });

console.log("== Zeitraum wirkt überall");
await seite.click('#pa [data-zeitraum="woche"]');
for (const id of ["pa", "pc"]) pruefe(`${id}: Diese Woche`, (await sub(id)).startsWith("Diese Woche"), true);
pruefe("B heißt jetzt Wochenrückblick", await text(seite.locator("#pb .kopf .titel")), "Euer Wochenrückblick");
pruefe("Der Regler zieht mit", await seite.locator('#regler [data-zeitraum="woche"]').getAttribute("aria-pressed"), "true");
pruefe("Sieben Tage, Do ist heute", (await saeulen()) + (await leer()), 7);
await regler("zeitraum", "jahr");
pruefe("Jahr: zwölf Monate", await saeulen(), 12);
pruefe("A: Letzte 12 Monate", (await sub("pa")).startsWith("Letzte 12 Monate"), true);
await regler("zeitraum", "quartal");
pruefe("13 Wochen: dreizehn Säulen", await saeulen(), 13);
await seite.locator("#pa details.tabelle summary").click();
pruefe("Die Tabelle hat eine Zeile je Säule", await seite.locator("#pa details.tabelle tr").count(), 14);
await regler("zeitraum", "monat");

console.log("== Was fair heißt, ändert das Urteil");
pruefe("50 : 50 → ausgeglichen", await urteilA(), "gut");
await regler("soll", "60");
pruefe("60 : 40 → leicht schief", await urteilA(), "leicht");
pruefe("Die Linie sagt es", await text(seite.locator("#pa .waage .soll")), "fair: 60 : 40");
await regler("soll", "40");
pruefe("40 : 60 → schief", await urteilA(), "schief");
pruefe("C urteilt genauso", await seite.locator("#pc .urteil").first().getAttribute("data-u"), "schief");
await seite.locator("#pc").screenshot({ path: `${AUS}/fb2-blick-schief.png` });
await regler("soll", "50");

console.log("== Tooltip mit Tastatur");
await seite.locator("#pa .raum .bar").first().focus();
const tip = seite.locator("#pa .tip[data-an]");
pruefe("Er erscheint", await tip.count(), 1);
const tipText = await text(tip);
pruefe("… mit Raum und beiden", /Küche.*Anna.*Ben/.test(tipText), true);
await seite.locator("#pa .raum .bar").first().blur();
pruefe("Und geht wieder", await seite.locator("#pa .tip[data-an]").count(), 0);

console.log("== Monatsgeschichte blättert");
pruefe("Sieben Karten mit Lena", await punkteAlle(), 7);
pruefe("Die erste ist an", await punkteAn(), 1);
await seite.click("#pb [data-story]");
pruefe("Tippen blättert", await punkteAn(), 2);
pruefe("Karte 2 ist die Waage", await seite.locator("#pb .storykarte .waage").count(), 1);
await seite.locator("#pb [data-story]").focus();
await seite.keyboard.press("Enter");
pruefe("Enter blättert auch", await punkteAn(), 3);
for (let i = 0; i < 4; i++) await seite.click("#pb [data-story]");
pruefe("Letzte Karte", (await text(seite.locator("#pb .storykarte"))).includes("Das war's."), true);
pruefe("… zum Teilen", await seite.locator('#pb [data-export="bild"]').count(), 1);
await seite.locator("#pb").screenshot({ path: `${AUS}/fb3-geschichte-ende.png` });
await seite.click("#pb [data-story]");
pruefe("Und wieder von vorn", await punkteAn(), 1);

console.log("== Lena");
await regler("kind", "aus");
pruefe("Sechs Karten ohne Lena", await punkteAlle(), 6);
for (const id of ["pa", "pc"]) pruefe(`${id}: keine Lena`, (await text(seite.locator(`#${id}`))).includes("Lena"), false);
const waageOhne = (await text(seite.locator("#pa .held .zahl"))).replace(/\s/g, "");
pruefe("Die Waage bleibt gleich", waageOhne, waageA);
await regler("kind", "an");
pruefe("Lena ist zurück", (await text(seite.locator("#pa"))).includes("Lena"), true);

console.log("== Ohne Plus");
await regler("plus", "aus");
pruefe("Nur diese Woche", (await sub("pa")).startsWith("Diese Woche"), true);
pruefe("Monat ist zu", await seite.locator('#pa [data-zeitraum="monat"]').getAttribute("data-zu"), "");
await seite.click('#pa [data-zeitraum="monat"]');
pruefe("… und bleibt zu", (await sub("pa")).startsWith("Diese Woche"), true);
await regler("zeitraum", "jahr");
pruefe("Auch oben", (await sub("pc")).startsWith("Diese Woche"), true);
pruefe("Die Waage ist frei", await seite.locator("#pa .gesperrt [data-urteil]").count(), 0);
pruefe("Der Rest liegt hinter dem Schloss", await seite.locator("#pa .gesperrt .schloss").count(), 1);
pruefe("C hat auch ein Schloss", await seite.locator("#pc .gesperrt .schloss").count(), 1);
pruefe("Der Verlauf ist nicht bedienbar", await seite.locator("#pa .verdeckt[inert][aria-hidden=true]").count(), 1);
pruefe("Drei Karten in der Geschichte", await punkteAlle(), 3);
await seite.click("#pb [data-story]");
await seite.click("#pb [data-story]");
pruefe("Die dritte ist zu", await seite.locator("#pb .storykarte .schloss").count(), 1);
await seite.click("#pb .storykarte .schloss .box");
pruefe("Tippen aufs Schloss blättert nicht", await punkteAn(), 3);
await seite.locator("#pa").screenshot({ path: `${AUS}/fb4-ohne-plus.png` });
await seite.click("#pa [data-test]");
pruefe("Testen schaltet Plus an", await seite.locator('#regler [data-plus="an"]').getAttribute("aria-pressed"), "true");
pruefe("Das Schloss ist weg", await seite.locator("#pa .schloss").count(), 0);
pruefe("Nichts läuft über", await ueberlauf(), 0);

console.log("== Handy und dunkel");
const handy = await browser.newPage({ viewport: { width: 375, height: 812 }, colorScheme: "dark" });
wache(handy);
await handy.goto(`${ZIEL}/mockup-fair/`, { waitUntil: "networkidle" });
pruefe("375 px: kein seitliches Scrollen", await handy.evaluate(() => document.documentElement.scrollWidth <= 375), true);
pruefe("Telefone passen", await handy.evaluate(() =>
  [...document.querySelectorAll(".phone")].every((p) => p.getBoundingClientRect().right <= 375)), true);
pruefe("Die Leiste klebt nicht", await handy.locator("#regler").evaluate((e) => getComputedStyle(e).position), "static");
const hell = await handy.evaluate(() => {
  const [r, g, b] = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number);
  return (r * 299 + g * 587 + b * 114) / 1000;
});
pruefe("Der Hintergrund ist dunkel", hell < 60, true);
await handy.locator("#pa").screenshot({ path: `${AUS}/fb5-handy-dunkel.png` });
await handy.close();

await browser.close();
console.log(fehler ? `${fehler} Fehler` : "ALLES GRÜN");
process.exit(fehler ? 1 : 0);
