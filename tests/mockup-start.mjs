// Der Startseiten-Mockup: passt jede Variante auf einen Bildschirm, und lässt
// sich alles anfassen, was sich anfassen lassen soll?
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
seite.on("console", (m) => { if (m.type() === "error" && !/favicon/.test(m.text())) { console.log("  FEHL console: " + m.text()); fehler++; } });

const antwort = await seite.goto(`${ZIEL}/mockup-start/`, { waitUntil: "networkidle" });
pruefe("Die Seite kommt", antwort.status(), 200);
pruefe("Das Vorher-Bild ist geladen", await seite.evaluate(() => {
  const i = document.querySelector(".vorher img"); return i.complete && i.naturalHeight > 2000;
}), true);
const text = await seite.locator("body").innerText();
pruefe("Kein „Punkte“", /\bPunkte\b/.test(text), false);

console.log("== Passt jede Variante auf einen Bildschirm?");
const ueber = await seite.evaluate(() => [...document.querySelectorAll(".schirm .inhalt")].map((e) => e.scrollHeight - e.clientHeight));
console.log("       Überstand in px (A, B, C):", JSON.stringify(ueber));
pruefe("A ohne Scrollen", ueber[0] <= 2, true);
pruefe("B ohne Scrollen", ueber[1] <= 2, true);
pruefe("C ohne Scrollen", ueber[2] <= 2, true);
pruefe("Nichts läuft seitlich über", await seite.evaluate(() =>
  [...document.querySelectorAll(".phone")].filter((p) => p.scrollWidth > p.clientWidth + 1).length), 0);

await seite.screenshot({ path: `${AUS}/m-ganz.png`, fullPage: true });
await seite.locator(".reihe").nth(1).screenshot({ path: `${AUS}/m-varianten.png` });

console.log("== A: abhaken zählt herunter");
await seite.locator('#a-liste [data-weg]').first().click();
await seite.waitForTimeout(600);
pruefe("Zähler geht auf 8", await seite.locator("#a-zahl").innerText(), "8");
await seite.click("#a-liste [data-mehr]");
pruefe("Weitere klappen auf", await seite.locator("#a-liste .zusatz").isVisible(), true);
await seite.click("[data-klapp]");
pruefe("Wartet klappt auf", await seite.locator(".zuklapp[data-offen]").count(), 1);

console.log("== B: der Stapel lässt sich durcharbeiten");
pruefe("Neun Fortschrittsstriche", await seite.locator("#b-fort i").count(), 9);
for (let n = 0; n < 9; n++) {
  await seite.locator('#b-stapel .karte[data-platz="0"] [data-b="ja"]').click();
  await seite.waitForTimeout(330);
}
pruefe("Am Ende: Alles erledigt", await seite.locator("#b-fertig[data-an]").count(), 1);
pruefe("Alle Striche grün", await seite.locator("#b-fort i[data-ok]").count(), 9);
await seite.locator(".reihe").nth(1).screenshot({ path: `${AUS}/m-erledigt.png` });
await seite.click("[data-neu]");
await seite.waitForTimeout(200);
pruefe("Und wieder von vorn", await seite.locator('#b-stapel .karte[data-platz="0"] .zaehler').innerText(), "1 von 9");

console.log("== B: wischen geht auch");
const karte = seite.locator('#b-stapel .karte[data-platz="0"]');
// Die Maus fährt in Fensterkoordinaten — liegt die Karte darunter, kommt sie nie an.
await karte.scrollIntoViewIfNeeded();
await seite.waitForTimeout(150);
const box = await karte.boundingBox();
await seite.mouse.move(box.x + box.width / 2, box.y + 60);
await seite.mouse.down();
await seite.mouse.move(box.x + box.width / 2 + 160, box.y + 70, { steps: 8 });
await seite.mouse.up();
await seite.waitForTimeout(450);
pruefe("Nach dem Wischen die zweite Karte", await seite.locator('#b-stapel .karte[data-platz="0"] .zaehler').innerText(), "2 von 9");

console.log("== C: eine Kachel öffnet ihr Blatt");
await seite.click('[data-blatt="fuerdich"]');
pruefe("Das Blatt ist offen", await seite.locator("#c-schleier[data-auf]").count(), 1);
pruefe("Mit allen neun", await seite.locator("#c-blatt .zeile").count(), 9);
await seite.locator(".reihe").nth(1).screenshot({ path: `${AUS}/m-blatt.png` });

console.log(fehler ? `\n${fehler} FEHLER` : "\nALLES GRÜN");
await browser.close();
process.exit(fehler ? 1 : 0);
