// Der Schirm darf nicht nach oben springen.
//
// Die Abfrage im Hintergrund läuft alle 25 Sekunden und baute bis eben den
// ganzen Schirm neu — mitten im Scrollen, mitten im Suchen. Hier wird geprüft,
// dass ein Neuzeichnen die Scrollhöhe und den Fokus behält, und dass es ganz
// ausbleibt, wenn sich nichts geändert hat.
import { chromium } from "playwright";
import { execSync } from "node:child_process";
const AUS = process.env.HQ_BILDER || "/tmp";
const URL = "http://127.0.0.1:8792/app/";
const sql = (s) => execSync(`cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --command "${s}" > /dev/null 2>&1`);

let fehler = 0;
const pruefe = (n, ist, soll) => {
  const ok = ist === soll;
  if (!ok) fehler++;
  console.log(`${ok ? "  ok  " : "  FEHL"} ${n}: ${JSON.stringify(ist)}${ok ? "" : " soll=" + JSON.stringify(soll)}`);
};

sql("delete from urlaube; delete from requests; delete from claims; delete from transfers; delete from ereignisse");

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 760 }, locale: "de-DE" });
await ctx.addCookies([{ name: "hq_sitzung", value: "tok-a", domain: "127.0.0.1", path: "/" }]);
const s = await ctx.newPage();
s.on("pageerror", (e) => { console.log("  FEHL pageerror: " + e.message); fehler++; });
s.on("console", (m) => {
  if (m.type() === "error" && !/ERR_NAME_NOT_RESOLVED|favicon|vibrate|status of 40/.test(m.text())) {
    console.log("  FEHL console: " + m.text()); fehler++;
  }
});

await s.goto(URL, { waitUntil: "networkidle" });
await s.waitForSelector(".navbar", { timeout: 12000 });
for (let i = 0; i < 8 && (await s.locator("#celebrate[data-open]").count()); i++) {
  await s.click("#celebrate [data-schliessen]"); await s.waitForTimeout(250);
}

// So stößt die App ihre Hintergrundabfrage an — derselbe Weg, den auch der
// 25-Sekunden-Takt nimmt.
const abfrageAnstossen = async () => {
  await s.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await s.waitForTimeout(900);
};

console.log("== Die Quest-Liste ist lang genug zum Scrollen");
await s.click('.navbar [data-go="quests"]');
await s.waitForSelector(".zeile .rowlink", { timeout: 8000 });
const scrollbar = await s.evaluate(() => {
  const b = document.querySelector(".body");
  return b.scrollHeight - b.clientHeight;
});
pruefe("Es gibt etwas zu scrollen", scrollbar > 150, true);

console.log("== Scrollhöhe bleibt, wenn im Hintergrund geladen wird");
await s.evaluate(() => { document.querySelector(".body").scrollTop = 220; });
await s.waitForTimeout(200);
pruefe("Erst einmal unten", await s.evaluate(() => document.querySelector(".body").scrollTop), 220);
await abfrageAnstossen();
pruefe("Und immer noch unten", await s.evaluate(() => document.querySelector(".body").scrollTop), 220);
await abfrageAnstossen();
pruefe("Auch beim zweiten Mal", await s.evaluate(() => document.querySelector(".body").scrollTop), 220);
await s.screenshot({ path: `${AUS}/s1-gescrollt.png` });

console.log("== Ohne Änderung wird gar nicht erst neu gebaut");
// Ein Merkzettel am alten Schirm: überlebt er, wurde nichts ersetzt.
await s.evaluate(() => { document.querySelector(".body").dataset.merker = "da"; });
await abfrageAnstossen();
pruefe("Der Merker ist noch da", await s.evaluate(() =>
  document.querySelector(".body").dataset.merker || ""), "da");

console.log("== Das Suchfeld behält Fokus und Text");
await s.click("#suchfeld");
await s.type("#suchfeld", "putz");
await s.waitForTimeout(300);
await abfrageAnstossen();
pruefe("Der Text steht noch", await s.inputValue("#suchfeld"), "putz");
pruefe("Und der Fokus auch", await s.evaluate(() => document.activeElement?.id || ""), "suchfeld");
pruefe("Der Cursor steht am Ende", await s.evaluate(() => document.activeElement?.selectionStart), 4);
await s.screenshot({ path: `${AUS}/s2-suche.png` });

console.log("== Ein Wechsel des Schirms fängt oben an");
await s.evaluate(() => { document.getElementById("suchfeld").value = ""; });
await s.click('[data-suche-leeren]').catch(() => {});
await s.evaluate(() => { document.querySelector(".body").scrollTop = 200; });
await s.click('.navbar [data-go="wir"]');
await s.waitForTimeout(500);
pruefe("Der neue Schirm steht oben", await s.evaluate(() =>
  document.querySelector(".body").scrollTop), 0);

console.log("== Und zurück auf Quests ebenso");
await s.click('.navbar [data-go="quests"]');
await s.waitForTimeout(500);
pruefe("Wieder oben", await s.evaluate(() => document.querySelector(".body").scrollTop), 0);

console.log(fehler ? `\n${fehler} FEHLER` : "\nALLES GRÜN");
await browser.close();
process.exit(fehler ? 1 : 0);
