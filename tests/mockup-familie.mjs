// Das Familienmodus-Mockup: drei Kinderansichten und Mamas Handy hängen
// zusammen. Melden, bestätigen, eintragen, einlösen, anlegen, auszahlen —
// und läuft nichts über, auch nicht auf dem Handy und im Dunkeln?
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

const antwort = await seite.goto(`${ZIEL}/mockup-familie/`, { waitUntil: "networkidle" });
pruefe("Die Seite kommt", antwort.status(), 200);
pruefe("Kein „Punkte“", /\bPunkte\b/.test(await seite.locator("body").innerText()), false);
pruefe("Vier Telefone", await seite.locator(".phone").count(), 4);
pruefe("Nichts läuft seitlich über", await seite.evaluate(() =>
  [...document.querySelectorAll(".phone, .phone .inhalt")].filter((p) => p.scrollWidth > p.clientWidth + 1).length), 0);
pruefe("Der Stern ist geladen", await seite.evaluate(() => fetch("/cleanie.webp").then((r) => r.ok)), true);

const konto = (id) => seite.locator(`#${id} [data-konto]`).innerText();
const stand = (kind) => seite.locator(`#eltern [data-stand="${kind}"]`).innerText();
const text = async (l) => (await l.innerText()).replace(/\s+/g, " ").trim();
const zustand = (id, quest) => seite.locator(`#${id} [data-kachel="${quest}"]`).getAttribute("data-zustand");

console.log("== Lena ist in allen drei Ansichten");
for (const id of ["ka", "kb", "kc"]) pruefe(`${id}: 12 Cleanies`, await konto(id), "12");
pruefe("Das Glas ist zu 60 % voll", await seite.locator("#ka .fuellung").evaluate((e) => e.style.getPropertyValue("--h")), "60%");
pruefe("Acht Aufgaben für Kinder", await seite.locator("#ka [data-kachel]").count(), 8);
pruefe("Keine Erwachsenen-Quest dabei", await seite.locator('#ka [data-kachel="sauger"]').count(), 0);
await seite.locator("#ka").screenshot({ path: `${AUS}/mf1-sparglas.png` });

console.log("== Lena meldet, Mama bestätigt");
await seite.click('#ka [data-kachel="zimmer"]');
pruefe("Die Frage ans Kind", (await seite.locator("#ka .blatt").innerText()).includes("Hast du das geschafft?"), true);
await seite.click('#ka [data-fertig="zimmer"]');
for (const id of ["ka", "kb", "kc"]) pruefe(`${id}: wartet`, await zustand(id, "zimmer"), "wartet");
const karte = seite.locator("#eltern .karte", { hasText: "Zimmer aufräumen" });
pruefe("Bei Mama liegt die Karte", await karte.count(), 1);
pruefe("… als Karte vom Kind", (await karte.innerText()).includes("Lena"), true);
await seite.locator("#eltern").screenshot({ path: `${AUS}/mf2-eltern-start.png` });
await karte.locator("[data-bestaetigen]").click();
for (const id of ["ka", "kb", "kc"]) pruefe(`${id}: 15 Cleanies`, await konto(id), "15");
pruefe("Geschafft", await zustand("ka", "zimmer"), "bestaetigt");
pruefe("Mamas Karte für Lena zählt mit", await stand("lena"), "15");
pruefe("Die Karte ist weg", await seite.locator("#eltern .karte", { hasText: "Zimmer aufräumen" }).count(), 0);
await seite.waitForTimeout(800);
pruefe("Das Glas zieht nach", await seite.locator("#ka .fuellung").evaluate((e) => e.style.getPropertyValue("--h")), "75%");

console.log("== Rückfrage");
await seite.click('#kb [data-kachel="tisch"]');
await seite.click('#kb [data-fertig="tisch"]');
await seite.locator("#eltern .karte", { hasText: "Tisch decken" }).locator("[data-rueckfrage]").click();
pruefe("Das Kind soll noch mal schauen", await zustand("kc", "tisch"), "rueckfrage");
pruefe("Lena bekommt nichts", await konto("kc"), "15");
await seite.click('#kc [data-kachel="tisch"]');
await seite.click('#kc [data-fertig="tisch"]');
pruefe("Neu gemeldet", await zustand("ka", "tisch"), "wartet");
pruefe("Nur eine Karte dafür", await seite.locator("#eltern .karte", { hasText: "Tisch decken" }).count(), 1);

console.log("== Mama trägt für Lena ein");
await seite.click("#eltern [data-plus]");
pruefe("Erst wählen", await seite.locator("#eltern [data-eintragen-ok]").isDisabled(), true);
await seite.click('#eltern [data-wer="lena"]');
pruefe("Für Lena nur Kinderaufgaben", await seite.locator('#eltern [data-eq="sauger"]').count(), 0);
await seite.click('#eltern [data-eq="katze"]');
pruefe("Der Knopf sagt, was passiert", (await seite.locator("#eltern [data-eintragen-ok]").innerText()).trim(), "Für Lena eintragen · +1");
await seite.locator("#eltern").screenshot({ path: `${AUS}/mf3-eintragen.png` });
await seite.click("#eltern [data-eintragen-ok]");
pruefe("Zählt sofort", await konto("ka"), "16");
pruefe("Geschafft, ohne Karte", await zustand("ka", "katze"), "bestaetigt");

console.log("== Für sich selbst eintragen braucht wie immer jemand anderen");
await seite.click("#eltern [data-plus]");
await seite.click('#eltern [data-eq="bad"]');
pruefe("Zur Bestätigung", (await seite.locator("#eltern [data-eintragen-ok]").innerText()).trim(), "Zur Bestätigung senden");
await seite.click("#eltern [data-eintragen-ok]");
pruefe("Lena bleibt bei 16", await konto("ka"), "16");

console.log("== Tom: Wunsch einlösen");
await seite.click('#ka [data-kindwahl="tom"]');
for (const id of ["ka", "kb", "kc"]) pruefe(`${id}: Tom mit 31`, await konto(id), "31");
pruefe("Toms Müll wartet noch", await zustand("ka", "muell"), "wartet");
await seite.click("#kc [data-wunschblatt]");
await seite.click('#kc .blatt [data-wunsch="freund"]');
pruefe("Neues Ziel überall", (await seite.locator("#ka .sparkarte").innerText()).includes("Freund übernachtet"), true);
await seite.click("#kc [data-einloesen]");
const wunschkarte = seite.locator("#eltern .karte", { hasText: "möchte einlösen" });
pruefe("Mama wird gefragt", await wunschkarte.count(), 1);
await wunschkarte.locator("[data-einloesung-ja]").click();
pruefe("Abgebucht", await konto("kb"), "1");

console.log("== Für wen eine Quest gilt");
await seite.click('#eltern [data-tab="quests"]');
await seite.click('#eltern [data-fuer="muell"]');
pruefe("Müll nur noch für Kinder", await seite.locator('#eltern [data-fuer="muell"]').getAttribute("data-wert"), "kinder");
await seite.click('#eltern [data-fuer="muell"]');
pruefe("Müll nur noch für Erwachsene", await seite.locator('#eltern [data-fuer="muell"]').getAttribute("data-wert"), "erwachsene");
pruefe("Die Kinder sehen ihn nicht mehr", await seite.locator('#ka [data-kachel="muell"]').count(), 0);
await seite.click('#eltern [data-fuer="muell"]');
pruefe("Wieder für alle", await seite.locator('#ka [data-kachel="muell"]').count(), 1);

console.log("== Kind anlegen");
await seite.click('#eltern [data-tab="wir"]');
await seite.click("#eltern [data-kind-neu]");
const anlegen = seite.locator("#eltern [data-anlegen]");
pruefe("Ohne Namen geht nichts", await anlegen.isDisabled(), true);
await seite.fill("#eltern #kindname", "Max");
pruefe("Ohne Einwilligung geht nichts", (await anlegen.innerText()).trim(), "Erst die Einwilligung bestätigen");
await seite.click('#eltern [data-tier="🐯"]');
await seite.click('#eltern [data-stufe="geraet"]');
pruefe("Der Name bleibt beim Wählen", await seite.inputValue("#eltern #kindname"), "Max");
await seite.check("#eltern #einwilligung");
pruefe("Jetzt geht es", (await anlegen.innerText()).trim(), "Max anlegen");
await seite.locator("#eltern").screenshot({ path: `${AUS}/mf4-anlegen.png` });
await anlegen.click();
pruefe("Mit eigenem Gerät gibt es den QR-Code", await seite.locator("#eltern .qr svg rect").count() > 100, true);
pruefe("Mit Apostroph nach x", (await seite.locator("#eltern .blatt h5").innerText()).trim(), "Max’ Gerät anmelden");
await seite.locator("#eltern").screenshot({ path: `${AUS}/mf5-qr.png` });
await seite.click("#eltern [data-zu]");
pruefe("Max steht in der Familie", (await seite.locator("#eltern .inhalt").innerText()).includes("Max"), true);
pruefe("Und oben zum Wechseln", await seite.locator('#ka [data-kindwahl][aria-label="Max"]').count(), 1);

console.log("== Taschengeld auszahlen");
await seite.click("#eltern [data-kind-neu]");
await seite.fill("#eltern #kindname", "Jule");
await seite.click('#eltern [data-stufe="gross"]');
await seite.check("#eltern #einwilligung");
await seite.click("#eltern [data-anlegen]");
pruefe("Jugendliche bekommen eine Einladung", await seite.locator("#eltern .blatt .code").count(), 1);
await seite.click("#eltern [data-zu]");
pruefe("Jule nicht in der Kinderansicht", await seite.locator("#ka [data-kindwahl]").count(), 3);
await seite.click('#ka [data-kindwahl="lena"]');
await seite.click('#eltern [data-auszahlen="lena"]');
await seite.click('#eltern [data-betrag="10"]');
pruefe("Der Betrag in Euro", await text(seite.locator("#eltern [data-auszahlen-ok]")), "1,00 € ausgezahlt");
await seite.click("#eltern [data-auszahlen-ok]");
pruefe("Lena hat noch 6", await konto("ka"), "6");
pruefe("Im Verlauf", (await text(seite.locator("#eltern .inhalt"))).includes("Lena · 1,00 € Taschengeld ausgezahlt"), true);

console.log("== Zurück zu den Eltern nur mit PIN");
await seite.click("#kb [data-schloss]");
for (const z of ["1", "2", "3"]) await seite.click(`#kb [data-ziffer="${z}"]`);
pruefe("Drei Punkte", await seite.locator("#kb .pinpunkte i.an").count(), 3);
await seite.click('#kb [data-ziffer="⌫"]');
pruefe("Löschen nimmt einen weg", await seite.locator("#kb .pinpunkte i.an").count(), 2);
await seite.click('#kb [data-ziffer="7"]');
await seite.click('#kb [data-ziffer="8"]');
pruefe("Mit vier Ziffern zu", await seite.locator("#kb .blatt-schleier[data-auf]").count(), 0);
await seite.locator(".reihe").first().screenshot({ path: `${AUS}/mf6-kinder.png` });

console.log("== Auf dem Handy");
const handy = await browser.newPage({ viewport: { width: 375, height: 800 } });
await handy.goto(`${ZIEL}/mockup-familie/`, { waitUntil: "networkidle" });
pruefe("Die Seite bleibt schmal", await handy.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
pruefe("Die Telefone passen hinein", await handy.evaluate(() =>
  [...document.querySelectorAll(".phone")].every((p) => p.getBoundingClientRect().right <= window.innerWidth)), true);
await handy.close();

console.log("== Im Dunkeln");
const dunkel = await browser.newPage({ viewport: { width: 1180, height: 1000 }, colorScheme: "dark" });
await dunkel.goto(`${ZIEL}/mockup-familie/`, { waitUntil: "networkidle" });
pruefe("Dunkler Grund", await dunkel.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(23, 38, 62)");
pruefe("Helle Schrift", await dunkel.evaluate(() => getComputedStyle(document.body).color), "rgb(232, 238, 248)");
await dunkel.locator(".reihe").first().screenshot({ path: `${AUS}/mf7-dunkel.png` });
await dunkel.close();

await browser.close();
console.log(fehler ? `\n${fehler} FEHLER` : "\nALLES GRÜN");
process.exit(fehler ? 1 : 0);
