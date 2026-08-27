// Der Jubel in der echten App: Stufe nach Cleanies, Einstellungen, eigene GIFs.
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
const enthaelt = (n, text, teil) => {
  const ok = String(text).includes(teil);
  if (!ok) fehler++;
  console.log(`${ok ? "  ok  " : "  FEHL"} ${n}${ok ? "" : `: „${teil}“ fehlt in „${String(text).slice(0, 300)}“`}`);
};

sql("delete from jubel_gifs; delete from urlaube; delete from proposal_votes; delete from proposals; delete from bewerbungen; delete from claims; delete from requests; delete from transfers; delete from ereignisse");
sql("update couples set phase_leise = 3, phase_mittel = 6");
sql("update quests set wiederkehrend = 0, faellig_am = null");

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
async function seiteFuer(token) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 880 }, deviceScaleFactor: 2, locale: "de-DE" });
  await ctx.addCookies([{ name: "hq_sitzung", value: token, domain: "127.0.0.1", path: "/" }]);
  const s = await ctx.newPage();
  s.on("pageerror", (e) => { console.log("  FEHL pageerror: " + e.message); fehler++; });
  s.on("console", (m) => {
    if (m.type() === "error" && !/ERR_NAME_NOT_RESOLVED|favicon|vibrate|status of 40/.test(m.text())) {
      console.log("  FEHL console: " + m.text()); fehler++;
    }
  });
  return s;
}
const momenteWeg = async (s) => {
  for (let i = 0; i < 10 && (await s.locator("#celebrate[data-open]").count()); i++) {
    await s.click("#celebrate [data-schliessen]"); await s.waitForTimeout(300);
  }
};
const laden = async (s) => {
  await s.goto(URL, { waitUntil: "networkidle" });
  await s.waitForSelector(".navbar", { timeout: 12000 });
  await momenteWeg(s);
};

const a = await seiteFuer("tok-a");
const b = await seiteFuer("tok-b");
const c = await seiteFuer("tok-c");

console.log("== Nach einer bestätigten Meldung wird gejubelt");
await laden(a);
// Eine Quest mit hohem Wert, damit die große Stufe greift.
const quest = await a.evaluate(async () => {
  const j = await (await fetch("/api/state")).json();
  return j.quests.find((q) => !q.wiederkehrend && q.points >= 7) || j.quests[0];
});
await a.evaluate(async (q) => fetch("/api/claims", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ questId: q.id, anzahl: 1 })
}), quest);

await laden(b);
await b.click('.navbar [data-go="pruefen"]');
await b.waitForSelector('[data-entscheiden="claims"][data-status="bestaetigt"]', { timeout: 8000 });
await b.click('[data-entscheiden="claims"][data-status="bestaetigt"]');
await b.waitForSelector("#celebrate[data-open]", { timeout: 8000 });
pruefe("Jubelfenster offen", await b.locator("#celebrate[data-open]").count(), 1);
pruefe("Leinwand ist da", await b.locator("#jubel").count(), 1);
await b.waitForTimeout(600);
const gemalt = await b.evaluate(() => {
  const cv = document.getElementById("jubel");
  if (!cv || !cv.width) return false;
  const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
  for (let i = 3; i < d.length; i += 40) if (d[i] > 8) return true;
  return false;
});
pruefe("Es wird wirklich gemalt", gemalt, true);
await b.screenshot({ path: `${AUS}/j1-jubel.png` });
await momenteWeg(b);
pruefe("Nach dem Schließen ist die Leinwand weg", await b.locator("#jubel").count(), 0);

console.log("== Die Stufe hängt an den Cleanies");
const stufen = await b.evaluate(async () => {
  const { phaseFuer } = await import("/app/feier.js");
  const j = await (await fetch("/api/state")).json();
  const g = j.haushalt.phasen;
  return [1, 3, 4, 6, 7, 40].map((p) => `${p}:${phaseFuer(p, g)}`).join(" ");
});
pruefe("Grenzen des Haushalts greifen", stufen, "1:leise 3:leise 4:mittel 6:mittel 7:gross 40:gross");

console.log("== Die Einstellungen sieht nur die Verwaltung");
await laden(c);
await c.click('.appbar [data-go="einstellungen"]');
await c.waitForSelector('[data-go="urlaub"]');
pruefe("C sieht keine Grenzen", await c.locator('[data-senden="phasen"]').count(), 0);
pruefe("C sieht keinen GIF-Knopf", await c.locator("[data-gif]").count(), 0);

await laden(a);
await a.click('.appbar [data-go="einstellungen"]');
await a.waitForSelector('[data-senden="phasen"]');
enthaelt("Erklärt, worum es geht", await a.evaluate(() => document.body.innerText), "Wie laut gefeiert wird");
pruefe("Drei Stufen stehen da", await a.locator(".phasenfeld").count(), 2);
enthaelt("Oberste ist nach oben offen", await a.evaluate(() => document.body.innerText), "nach oben offen");
await a.screenshot({ path: `${AUS}/j2-einstellungen.png`, fullPage: true });

console.log("== Grenzen verschieben");
await a.fill("#phase-leise", "2");
await a.fill("#phase-mittel", "4");
await a.click('[data-senden="phasen"]');
await a.waitForTimeout(1500);
await momenteWeg(a);
pruefe("Neue Grenzen im Zustand", await a.evaluate(async () => {
  const j = await (await fetch("/api/state")).json();
  return `${j.haushalt.phasen.leise}/${j.haushalt.phasen.mittel}`;
}), "2/4");
await a.click('.appbar [data-go="einstellungen"]').catch(() => {});
await a.waitForSelector('[data-senden="phasen"]', { timeout: 8000 });
enthaelt("Die dritte Stufe rutscht mit", await a.evaluate(() => document.body.innerText), "ab 5");

console.log("== Verdrehte Grenzen werden abgewiesen");
await a.fill("#phase-leise", "9");
await a.fill("#phase-mittel", "4");
await a.click('[data-senden="phasen"]');
await a.waitForTimeout(1200);
enthaelt("Sagt, was falsch ist", await a.evaluate(() => document.body.innerText), "muss über der ersten liegen");

console.log("== Ein eigenes GIF");
await a.evaluate(async () => fetch("/api/phasen", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ leise: 3, mittel: 6 })
}));
await laden(a);
await a.click('.appbar [data-go="einstellungen"]');
await a.waitForSelector("#giffeld", { state: "attached" });   // absichtlich unsichtbar
enthaelt("Nennt die Grenze", await a.evaluate(() => document.body.innerText), "Bis 400 KB");
await a.setInputFiles("#giffeld", {
  name: "party.gif", mimeType: "image/gif",
  buffer: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64")
});
await a.waitForTimeout(1800);
await momenteWeg(a);
pruefe("Liegt im Zustand", await a.evaluate(async () =>
  (await (await fetch("/api/state")).json()).gifs.length), 1);
await a.click('.appbar [data-go="einstellungen"]').catch(() => {});
await a.waitForSelector("[data-gif-weg]", { timeout: 8000 });
enthaelt("Steht in der Liste", await a.evaluate(() => document.body.innerText), "party.gif");
await a.screenshot({ path: `${AUS}/j3-gif.png`, fullPage: true });

console.log("== Und wieder weg");
await a.click("[data-gif-weg]");
await a.waitForTimeout(1500);
await momenteWeg(a);
pruefe("Gelöscht", await a.evaluate(async () =>
  (await (await fetch("/api/state")).json()).gifs.length), 0);

sql("delete from jubel_gifs");
sql("update couples set phase_leise = 3, phase_mittel = 6");
console.log(fehler ? `\n${fehler} FEHLER` : "\nALLES GRÜN");
await browser.close();
process.exit(fehler ? 1 : 0);
