// Das Bilder-Mockup: Stift oben, Symbole für Quests, Hintergründe für
// Belohnungen. Lässt sich alles anfassen, und läuft nichts über?
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
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

const antwort = await seite.goto(`${ZIEL}/mockup-icons/`, { waitUntil: "networkidle" });
pruefe("Die Seite kommt", antwort.status(), 200);
pruefe("Kein „Punkte“", /\bPunkte\b/.test(await seite.locator("body").innerText()), false);
pruefe("Sechs Telefone", await seite.locator(".phone").count(), 6);
pruefe("Nichts läuft seitlich über", await seite.evaluate(() =>
  [...document.querySelectorAll(".phone, .phone .inhalt")].filter((p) => p.scrollWidth > p.clientWidth + 1).length), 0);
pruefe("Der Stern ist geladen", await seite.evaluate(() => fetch("/cleanie.webp").then((r) => r.ok)), true);

console.log("== Der Stift steht oben neben dem Plus");
for (const id of ["qa", "qb", "qc", "ra", "rb", "rc"]) {
  const knoepfe = await seite.locator(`#${id} .kopf .knopf`).count();
  pruefe(`${id}: Stift und Plus oben`, knoepfe, 2);
}
pruefe("Kein Stift mehr in den Zeilen", await seite.locator("#qa .inhalt svg").count(), 0);
pruefe("Jede Quest hat ein Symbol", await seite.locator("#qa .qa-zeile .ico").count(), await seite.locator("#qa .qa-zeile").count());
pruefe("Und rechts die Cleanies", await seite.locator("#qa .qa-zeile .wert").count(), await seite.locator("#qa .qa-zeile").count());

console.log("== Ohne Stift: antippen meldet");
await seite.locator("#qa [data-q]").first().click();
pruefe("Das Melde-Blatt", (await seite.locator("#qa .blatt h5").innerText()).trim(), "Erledigt melden");
pruefe("Ohne Bearbeiten darin", await seite.locator('#qa .blatt [data-tun="bild"]').count(), 0);
await seite.click("#qa [data-gemeldet]");

console.log("== Mit Stift: Quest wählen, Bild ändern");
await seite.click("#qa [data-stift]");
pruefe("Bearbeiten an", await seite.locator("#qa[data-bearbeiten]").count(), 1);
pruefe("Aus dem Stift wird Fertig", (await seite.locator("#qa [data-stift]").innerText()).trim(), "Fertig");
pruefe("Die Frage steht oben", await seite.locator("#qa .bearbeiten-hinweis").isVisible(), true);
const erste = seite.locator("#qa [data-q]").first();
const qid = await erste.getAttribute("data-q");
await erste.click();
const menue = await seite.locator("#qa .blatt").innerText();
pruefe("Das Menü bietet „Bild ändern“", menue.includes("Bild ändern"), true);
pruefe("… und das Bisherige", ["Cleanies-Wert ändern", "Raum ändern", "Quest löschen"].every((w) => menue.includes(w)), true);
await seite.click('#qa [data-tun="bild"]');
await seite.click('#qa [data-kat="Küche"]');
await seite.click('#qa [data-emoji="🧊"]');
await seite.click('#qa [data-farbe="lila"]');
pruefe("Die Vorschau zieht mit", (await seite.locator("#qa .blatt .vorschau .ico").innerText()).trim(), "🧊");
await seite.locator("#qa").screenshot({ path: `${AUS}/mi1-waehler.png` });
await seite.click("#qa [data-uebernehmen]");
for (const id of ["qa", "qb", "qc"]) {
  pruefe(`${id}: das neue Symbol`, (await seite.locator(`#${id} [data-q="${qid}"] .ico`).innerText()).trim(), "🧊");
}
pruefe("Mit neuer Farbe", await seite.locator(`#qb [data-q="${qid}"] .ico`).getAttribute("style"), "--t:#f1ebfb");

console.log("== Ein eigenes Bild hochladen");
await seite.locator(`#qa [data-q="${qid}"]`).click();
await seite.click('#qa [data-tun="bild"]');
await seite.setInputFiles('#qa [data-hochladen="symbol"]',
  { name: "fuchs.webp", mimeType: "image/webp", buffer: readFileSync(new URL("../web/fox.webp", import.meta.url)) });
await seite.waitForSelector("#qa .blatt .vorschau .ico img");
pruefe("Die Vorschau zeigt das Bild", await seite.locator("#qa .blatt .vorschau .ico img").count(), 1);
await seite.click("#qa [data-uebernehmen]");
pruefe("In der Liste steht das Bild", await seite.locator(`#qc [data-q="${qid}"] .ico img`).count(), 1);
await seite.click("#qa [data-stift]");
pruefe("Fertig schaltet zurück", await seite.locator("#qa[data-bearbeiten]").count(), 0);
await seite.locator(".reihe").nth(0).screenshot({ path: `${AUS}/mi2-quests.png` });

console.log("== Suchen und Filtern");
await seite.fill("#qb [data-suche]", "fenster");
pruefe("Die Suche findet die Fenster", await seite.locator("#qb [data-q]").count(), 1);
await seite.fill("#qb [data-suche]", "");
await seite.click('#qc [data-filter="Bad"]');
pruefe("Der Filter zeigt nur das Bad", await seite.locator("#qc [data-q]").count(), 2);

console.log("== Der Stern hinter den Cleanies");
const stern = () => seite.locator("#qa .wert").first().evaluate((w) => getComputedStyle(w, "::before").display);
pruefe("Schwach dahinter", await stern(), "block");
await seite.click('#stern [data-stern="weg"]');
pruefe("Weg", await stern(), "none");
await seite.click('#stern [data-stern="dahinter"]');

console.log("== Belohnungen: Hintergrund und Symbol");
await seite.click("#rb [data-stift]");
const box = seite.locator('#rb [data-b="4"]');
pruefe("Ohne Bild vorher", await box.locator(".motiv").count(), 0);
await box.click();
const rmenue = await seite.locator("#rb .blatt").innerText();
pruefe("Hintergrundbild ändern", rmenue.includes("Hintergrundbild ändern"), true);
pruefe("Symbol ändern", rmenue.includes("Symbol ändern"), true);
await seite.click('#rb [data-tun="bild"]');
await seite.click('#rb [data-motiv="suess"]');
pruefe("Die Probe zeigt das Motiv", await seite.locator("#rb .blatt [data-probe] .motiv").count(), 1);
await seite.locator("#rb").screenshot({ path: `${AUS}/mi3-hintergrund.png` });
await seite.click("#rb [data-uebernehmen]");
for (const id of ["ra", "rb", "rc"]) {
  pruefe(`${id}: die Box hat das Bild`, await seite.locator(`#${id} [data-b="4"] .motiv span`).count(), 3);
}

await seite.locator('#rb [data-b="4"]').click();
await seite.click('#rb [data-tun="symbol"]');
await seite.click('#rb [data-emoji="💅"]');
await seite.click("#rb [data-uebernehmen]");
pruefe("Das Herz ist ersetzbar", (await seite.locator('#ra [data-b="4"] .rico').innerText()).trim(), "💅");

await seite.locator('#rb [data-b="1"]').click();
await seite.click('#rb [data-tun="bild"]');
await seite.setInputFiles('#rb [data-hochladen="bild"]',
  { name: "wolf.webp", mimeType: "image/webp", buffer: readFileSync(new URL("../web/wolf.webp", import.meta.url)) });
await seite.waitForSelector("#rb .blatt [data-probe] .motiv img");
await seite.click("#rb [data-uebernehmen]");
pruefe("Ein eigenes Foto als Hintergrund", await seite.locator('#rc [data-b="1"] .motiv img').count(), 1);

console.log("== Die Schrift bleibt vorn");
// Liegt die Schrift über dem Bild, muss etwas dazwischen sein: ein Schleier
// (A und C) — oder sie liegt gar nicht darauf (B).
const lage = await seite.evaluate(() => {
  const ueber = (a, b) => !(a.bottom <= b.top || a.top >= b.bottom || a.right <= b.left || a.left >= b.right);
  const r = {};
  for (const id of ["ra", "rb", "rc"]) {
    const box = document.querySelector(`#${id} [data-b="1"]`);
    const bild = box.querySelector(".motiv").getBoundingClientRect();
    const name = box.querySelector(".n").getBoundingClientRect();
    r[id] = { ueber: ueber(name, bild), schleier: !!box.querySelector(".schleier") };
  }
  return r;
});
pruefe("A: Schleier unter der Schrift", lage.ra.ueber && lage.ra.schleier, true);
pruefe("B: die Schrift liegt nicht auf dem Bild", lage.rb.ueber, false);
pruefe("C: Verlauf unter der Schrift", lage.rc.ueber && lage.rc.schleier, true);
await seite.locator(".reihe").nth(1).screenshot({ path: `${AUS}/mi4-belohnungen.png` });

console.log(fehler ? `\n${fehler} FEHLER` : "\nALLES GRÜN");
await browser.close();
process.exit(fehler ? 1 : 0);
