// Die Startseite: Stapel, Kacheln, das Plus in der Leiste — zu dritt.
//
// Was auf einen wartet, liegt als Stapel da. Rechts erledigt die Sache,
// links ist das Sichere; wischen geht auch. Darunter zwei Kacheln, zwei dünne
// Zeilen, und alles passt auf einen Bildschirm. „Prüfen“ hat keinen Reiter
// mehr — in der Mitte der Leiste sitzt das Plus.
import { chromium } from "playwright";
import { execSync } from "node:child_process";
const AUS = process.env.HQ_BILDER || "/tmp";
const URL = "http://127.0.0.1:8792/app/";
const sql = (s) => execSync(`cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --command "${s}" > /dev/null 2>&1`);
const frage = (s) => JSON.parse(execSync(
  `cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --json --command "${s}" 2>/dev/null`
).toString())[0].results;

let fehler = 0;
const pruefe = (n, ist, soll) => {
  const ok = ist === soll;
  if (!ok) fehler++;
  console.log(`${ok ? "  ok  " : "  FEHL"} ${n}: ${JSON.stringify(ist)}${ok ? "" : " soll=" + JSON.stringify(soll)}`);
};
const enthaelt = (n, text, teil) => {
  const ok = String(text).includes(teil);
  if (!ok) fehler++;
  console.log(`${ok ? "  ok  " : "  FEHL"} ${n}${ok ? "" : `: „${teil}“ fehlt in „${String(text).slice(0, 400)}“`}`);
};

// Ein ruhiger Ausgangspunkt: nichts Offenes, kein Plan, kein Urlaub. Das
// Konto bleibt — die Zahlen oben sollen echt sein.
const HAUS = "(select couple_id from members where user_id = 'u-a')";
sql("delete from urlaube; delete from requests; delete from claims; delete from transfers; delete from ereignisse; delete from bewerbungen; delete from aktionen");
sql("update proposals set status = 'abgelehnt' where status = 'offen'");
sql("update quests set wiederkehrend = 0, faellig_am = null, zugewiesen = null, dran = null, vergabe_runde = null, mahnung_runde = null, strafe_runde = null");
sql(`update couples set wochenziel = null where id = ${HAUS}`);
sql(`insert or ignore into ledger (id, couple_id, member_id, delta, reason, source_type) values ('test-start-b', ${HAUS}, 'u-b', 5, 'Startgeld für den Test', 'korrektur')`);
const quests = frage(`select id, name, points from quests where active = 1 and event_id is null and couple_id = ${HAUS} order by name limit 4`);
const [Q1, Q2, Q3, Q4] = quests;

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
async function seiteFuer(token) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "de-DE" });
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
const post = (s, pfad, daten) => s.evaluate(async ([p, d]) => {
  const r = await fetch(`/api/${p}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
  return { ok: r.ok, j: await r.json() };
}, [pfad, daten]);
const zustand = (s) => s.evaluate(async () => (await fetch("/api/state")).json());
// Der Server bekommt die Entscheidung erst nach dem Wegfliegen — kurz warten.
const bis = async (fn, ms = 4000) => {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 150)); }
  return false;
};
const oben = (s) => s.locator('.stapel .karte[data-platz="0"]');
const anzahl = async (s) => (await s.locator(".abschnitt .anzahl").innerText()).trim();
const wischen = async (s, weite) => {
  const k = oben(s);
  await k.scrollIntoViewIfNeeded();
  const box = await k.boundingBox();
  await s.mouse.move(box.x + box.width / 2, box.y + 70);
  await s.mouse.down();
  await s.mouse.move(box.x + box.width / 2 + weite, box.y + 78, { steps: 8 });
  await s.mouse.up();
  await s.waitForTimeout(450);
};
const farbigeBildpunkte = (s) => s.evaluate(() => {
  const c = document.getElementById("stapeljubel");
  if (!c.width) return 0;
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let n = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 0) n++;
  return n;
});

const a = await seiteFuer("tok-a");
const b = await seiteFuer("tok-b");
const c = await seiteFuer("tok-c");
await laden(a); await laden(b); await laden(c);

const namen = Object.fromEntries((await zustand(a)).mitglieder.map((m) => [m.id, m.name.split(" ")[0]]));

console.log("== Die Leiste: kein Prüfen mehr, dafür das Plus");
pruefe("Fünf Plätze", await a.locator(".navbar > button").count(), 5);
pruefe("Kein Reiter „Prüfen“", await a.locator('.navbar [data-go="pruefen"]').count(), 0);
pruefe("Das Plus sitzt in der Mitte", await a.locator(".navbar > button").nth(2).getAttribute("data-plus"), "");
enthaelt("Und heißt „Erledigt“", await a.locator(".navbar [data-plus]").innerText(), "Erledigt");

console.log("== Leer: Alles erledigt, ganz ruhig");
pruefe("Keine Karte", await a.locator(".stapel .karte").count(), 0);
enthaelt("Alles erledigt", await a.locator(".stapel .fertig").innerText(), "Gerade wartet nichts auf dich");
pruefe("Kein Jubel ohne Arbeit", await farbigeBildpunkte(a), 0);
pruefe("Kein Zähler an Start", await a.locator('.navbar [data-go="start"] .badge-n').count(), 0);

console.log("== Hinweise lassen sich wegtippen und bleiben weg");
for (let i = 0; i < 3 && (await a.locator(".body.start .zuletzt.hinweis [data-hinweis-weg]").count()); i++) {
  await a.locator(".body.start .zuletzt.hinweis [data-hinweis-weg]").first().click();
}
pruefe("Kein Hinweis mehr", await a.locator(".body.start .zuletzt.hinweis").count(), 0);
await laden(a);
pruefe("Auch nach dem Neuladen nicht", await a.locator(".body.start .zuletzt.hinweis").count(), 0);

console.log("== Drei Sachen kommen herein");
pruefe("C meldet die erste", (await post(c, "claims", { questId: Q1.id, anzahl: 1, notiz: "Auch die Fensterbänke" })).ok, true);
pruefe("C meldet die zweite", (await post(c, "claims", { questId: Q2.id, anzahl: 1 })).ok, true);
pruefe("B schickt ein Geschenk", (await post(b, "transfers", { betrag: 2, an: "u-a", nachricht: "Danke fürs Kochen" })).ok, true);
const wocheVorher = (await zustand(a)).woche;
await laden(a);

pruefe("Drei Karten im Stapel", await anzahl(a), "3");
pruefe("Dieselbe Zahl an Start", await a.locator('.navbar [data-go="start"] .badge-n').innerText(), "3");
pruefe("Drei Striche im Fortschritt", await a.locator(".abschnitt .fortschritt i").count(), 3);
pruefe("Oben liegt eine Meldung", await oben(a).locator(".art").innerText(), "MELDUNG");
enthaelt("Mit Zähler", await oben(a).locator(".zaehler").innerText(), "1 von 3");
enthaelt("Wer gemeldet hat", await oben(a).locator(".wer").innerText(), `${namen["u-c"]} hat gemeldet`);
enthaelt("Mit Notiz", await oben(a).innerText(), "Auch die Fensterbänke");
pruefe("Die Karten dahinter sind nicht anfassbar",
  await a.locator('.stapel .karte[data-platz="1"]').getAttribute("inert"), "");

console.log("== Passt auf einen Bildschirm");
const ueber = await a.evaluate(() => { const b = document.querySelector(".body"); return b.scrollHeight - b.clientHeight; });
console.log("       Überstand in px:", ueber);
pruefe("Ohne Scrollen", ueber <= 2, true);
pruefe("Nichts läuft seitlich über", await a.evaluate(() => document.querySelector(".body").scrollWidth <= innerWidth), true);
await a.screenshot({ path: `${AUS}/st1-start.png` });
pruefe("Kein „Punkte“", /\bPunkte\b/.test(await a.locator("body").innerText()), false);

console.log("== Zustimmen per Knopf");
const erste = (await zustand(a)).meldungen.find((m) => m.quest_id === Q1.id);
await oben(a).locator('[data-kartentun="ja"]').click();
await a.waitForTimeout(120);
pruefe("Die Cleanies steigen auf", await a.locator("#flieg[data-an]").count(), 1);
enthaelt("Mit Betrag und Name", await a.locator("#flieg").innerText(), `+${Q1.points} für ${namen["u-c"]}`);
await a.waitForTimeout(700);
pruefe("Zwei bleiben", await anzahl(a), "2");
pruefe("Ein Strich ist grün", await a.locator(".abschnitt .fortschritt i[data-ok]").count(), 1);
pruefe("Beim Server angekommen", await bis(async () => !(await zustand(a)).meldungen.some((m) => m.id === erste.id)), true);

console.log("== Nach links wischen fragt nach — die Karte bleibt");
await wischen(a, -170);
enthaelt("Das Blatt zum Nachfragen", await a.locator(".sheet h3").innerText(), "Nachfragen");
await a.click("#scrim", { position: { x: 10, y: 10 } });
await a.waitForTimeout(300);
enthaelt("Die Karte liegt noch da", await oben(a).locator(".zaehler").innerText(), "2 von 3");

console.log("== Nach rechts wischen stimmt zu");
await wischen(a, 170);
await a.waitForTimeout(400);
pruefe("Eine bleibt", await anzahl(a), "1");
pruefe("Oben liegt das Geschenk", await oben(a).locator(".art").innerText(), "GESCHENK");
await bis(async () => !(await zustand(a)).meldungen.length);
const wocheNachher = (await zustand(a)).woche;
pruefe("Diese Woche zählt beide mit", wocheNachher.zusammen - wocheVorher.zusammen, Q1.points + Q2.points);

console.log("== Später — und am Ende noch einmal zeigen");
await oben(a).locator('[data-kartentun="nein"]').click();
await a.waitForTimeout(500);
pruefe("Der Stapel ist leer", await a.locator(".stapel .karte").count(), 0);
pruefe("Kein Jubel fürs Überspringen", await farbigeBildpunkte(a), 0);
pruefe("Das Geschenk wartet weiter", (await zustand(a)).uebertragungen.length, 1);
await a.click("[data-nochmal]");
await a.waitForTimeout(200);
pruefe("Wieder da", await oben(a).locator(".art").innerText(), "GESCHENK");
enthaelt("Neue Runde", await oben(a).locator(".zaehler").innerText(), "1 von 1");

console.log("== Die letzte Karte bringt den Jubel");
await oben(a).locator('[data-kartentun="ja"]').click();
await a.waitForTimeout(120);
enthaelt("Für dich", await a.locator("#flieg").innerText(), "+2 für dich");
await a.waitForTimeout(700);
enthaelt("Alles erledigt", await a.locator(".stapel .fertig").innerText(), "Nichts wartet mehr auf dich");
const farbig = await farbigeBildpunkte(a);
console.log("       farbige Bildpunkte (Stichprobe):", farbig);
pruefe("Der Jubel malt", farbig > 50, true);
pruefe("Die Zahl wird zum Haken", await anzahl(a), "✓");
await a.screenshot({ path: `${AUS}/st2-erledigt.png` });

console.log("== Diese Woche: das Ziel muss erst eingetragen werden");
await laden(a);
enthaelt("Die Kachel sagt es", await a.locator("[data-woche]").innerText(), "Ziel muss noch eingetragen werden");
await a.click("[data-woche]");
enthaelt("Das Blatt auch", await a.locator(".sheet").innerText(), "Wochenziel muss noch eingetragen werden");
const vorschlag = Number(await a.locator("#zielwahl").innerText());
await a.click('[data-zielschritt="10"]');
pruefe("Ziel lässt sich verstellen", await a.locator("#zielwahl").innerText(), String(vorschlag + 10));
await a.click("[data-ziel-setzen]");
await a.waitForTimeout(400);
pruefe("Gespeichert", (await zustand(a)).woche.ziel, vorschlag + 10);
await a.click("#scrim", { position: { x: 10, y: 10 } });
const kachel = await a.locator("[data-woche]").innerText();
enthaelt("Die Kachel zeigt das Ziel", kachel, `Ziel ${vorschlag + 10}`);
pruefe("Der Hinweis ist weg", kachel.includes("muss noch"), false);
pruefe("Mit Balken", await a.locator("[data-woche] .zielbalken").count(), 1);

await laden(b);
enthaelt("B sieht dasselbe Ziel", await b.locator("[data-woche]").innerText(), `Ziel ${vorschlag + 10}`);
await b.click("[data-woche]");
pruefe("B kann es nicht ändern", await b.locator("[data-ziel-setzen]").count(), 0);
enthaelt("Und erfährt, wer es kann", await b.locator(".sheet").innerText(), "kann, wer den Haushalt verwaltet");
pruefe("Auch nicht am Server vorbei", (await post(b, "wochenziel", { ziel: 10 })).ok, false);
await b.click("#scrim", { position: { x: 10, y: 10 } });

await a.click("[data-woche]");
await a.click("[data-ziel-weg]");
await a.waitForTimeout(400);
pruefe("Entfernt", (await zustand(a)).woche.ziel, null);
await a.click("#scrim", { position: { x: 10, y: 10 } });
enthaelt("Der Hinweis ist zurück", await a.locator("[data-woche]").innerText(), "Ziel muss noch eingetragen werden");

console.log("== Das Plus: die meistgenutzten zuerst, mit Suche");
await a.click(".navbar [data-plus]");
enthaelt("Das Blatt fragt", await a.locator(".sheet h3").innerText(), "Was hast du erledigt?");
const zeilen = await a.locator("#plusliste [data-melden-aus]").count();
pruefe("Höchstens acht ohne Suche", zeilen >= 1 && zeilen <= 8, true);
await a.fill("#plussuche", Q3.name);
await a.waitForTimeout(150);
enthaelt("Die Suche findet sie", await a.locator("#plusliste [data-melden-aus]").first().innerText(), Q3.name);
pruefe("Und sagt Treffer", await a.locator("#pluslabel").innerText(), "TREFFER");
await a.locator("#plusliste [data-melden-aus]").first().click();
enthaelt("Weiter geht es wie immer", await a.locator(".sheet h3").innerText(), "Erledigt melden");
await a.click('[data-senden="melden"]');
await a.waitForTimeout(500);
enthaelt("Gemeldet", await a.locator("#toast").innerText(), "Gemeldet");

console.log("== Die dünnen Zeilen");
enthaelt("Wartet auf die anderen", await a.locator("[data-wartet]").innerText(), "· 1");
await a.click("[data-wartet]");
pruefe("Das Blatt zeigt die Meldung", await a.locator('.sheet .offene-zeile[data-sheet="meins"]').count(), 1);
await a.click("#scrim", { position: { x: 10, y: 10 } });
enthaelt("Zuletzt steht da", await a.locator('.zuletzt[data-go="verlauf"]').innerText(), "Zuletzt:");
await a.click('.zuletzt[data-go="verlauf"]');
pruefe("Führt in den Verlauf", await a.locator(".appbar .title").innerText(), "Verlauf");
enthaelt("Start leuchtet weiter", await a.locator('.navbar [aria-current="true"]').innerText(), "Start");
await a.click('.appbar [data-go="start"]');

console.log("== Eine Rückfrage öffnet ihr Blatt, die Karte bleibt bis zur Antwort");
const meine = (await zustand(a)).meldungen.find((m) => m.quest_id === Q3.id && m.claimed_by === "u-a");
pruefe("C fragt nach", (await post(c, `claims/${meine.id}/rueckfrage`, { text: "Auch unter dem Sofa?" })).ok, true);
await laden(a);
pruefe("Oben liegt die Rückfrage", await oben(a).locator(".art").innerText(), "RÜCKFRAGE");
enthaelt("Mit der Frage", await oben(a).locator(".was").innerText(), "Auch unter dem Sofa?");
await oben(a).locator('[data-kartentun="ja"]').click();
enthaelt("Das Blatt zum Antworten", await a.locator(".sheet h3").innerText(), "Antworten");
await a.fill("#atext", "Ja, auch da.");
await a.click('[data-senden="antwort"]');
await a.waitForTimeout(600);
pruefe("Beantwortet — die Karte ist weg", await a.locator(".stapel .karte").count(), 0);

console.log("== Eine Aufgabe aus dem Plan: Erledigt meldet sie gleich");
sql(`update quests set wiederkehrend = 1, rhythmus = '1× pro Woche', tage = 7, faellig_am = date('now'), zugewiesen = 'u-a' where id = '${Q4.id}'`);
await laden(a);
pruefe("Die Kachel weiß davon", (await a.locator('.startkachel[data-go="plan"]').innerText()).includes("gehört dir"), true);
pruefe("Oben liegt die Aufgabe", await oben(a).locator(".art").innerText(), "GEHÖRT DIR");
enthaelt("Mit Namen", await oben(a).locator(".was").innerText(), Q4.name);
await oben(a).locator('[data-kartentun="ja"]').click();
await a.waitForTimeout(120);
enthaelt("Gemeldet steigt auf", await a.locator("#flieg").innerText(), "Gemeldet");
await a.waitForTimeout(800);
pruefe("Die Meldung ist da", await bis(async () => (await zustand(a)).meldungen.some((m) => m.quest_id === Q4.id && m.claimed_by === "u-a")), true);

console.log("== Alle › zeigt alles, mit allen Knöpfen");
await post(c, "claims", { questId: Q1.id, anzahl: 1 });
await laden(a);
await a.click('.abschnitt [data-go="pruefen"]');
pruefe("Die Seite heißt Für dich", await a.locator(".appbar .title").innerText(), "Für dich");
pruefe("Mit Zurück", await a.locator('.appbar [data-go="start"]').count(), 1);
enthaelt("Start leuchtet", await a.locator('.navbar [aria-current="true"]').innerText(), "Start");
pruefe("Ablehnen gibt es hier", await a.locator('[data-entscheiden="claims"][data-status="abgelehnt"]').count(), 1);
await a.click('.appbar [data-go="start"]');

console.log("== Die Startseite von B, dunkel");
await b.emulateMedia({ colorScheme: "dark" });
await laden(b);
await b.screenshot({ path: `${AUS}/st3-dunkel.png` });
pruefe("Dunkel ist dunkel", await b.evaluate(() => document.documentElement.dataset.theme), "dunkel");

// Aufräumen: nichts Offenes zurücklassen, kein Ziel, kein Plan.
sql("delete from claims where status = 'offen'; delete from transfers where status = 'offen'");
sql(`update quests set wiederkehrend = 0, faellig_am = null, zugewiesen = null where id = '${Q4.id}'`);

console.log(fehler ? `\n${fehler} FEHLER` : "\nALLES GRÜN");
await browser.close();
process.exit(fehler ? 1 : 0);
