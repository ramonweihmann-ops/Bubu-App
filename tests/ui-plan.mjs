import { chromium } from "playwright";
const AUS = process.env.HQ_BILDER || "/tmp";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
let fehler = 0;
const pruefe = (n, ist, soll) => {
  const ok = ist === soll;
  if (!ok) fehler++;
  console.log(`${ok ? "  ok  " : "  FEHL"} ${n}: ${JSON.stringify(ist)}${ok ? "" : " soll=" + JSON.stringify(soll)}`);
};
async function seiteFuer(token) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: "hq_sitzung", value: token, domain: "127.0.0.1", path: "/" }]);
  const s = await ctx.newPage();
  s.on("pageerror", (e) => { console.log("  FEHL pageerror: " + e.message); fehler++; });
  s.on("console", (m) => { if (m.type() === "error" && !/ERR_NAME_NOT_RESOLVED|favicon|vibrate|status of 400/.test(m.text())) { console.log("  FEHL console: " + m.text()); fehler++; } });
  return s;
}
const momenteWeg = async (s) => {
  for (let i = 0; i < 10 && (await s.locator("#celebrate[data-open]").count()); i++) {
    await s.click("#celebrate [data-schliessen]"); await s.waitForTimeout(300);
  }
};
const laden = async (s) => { await s.goto("http://127.0.0.1:8792/app/", { waitUntil: "networkidle" });
  await s.waitForSelector(".navbar", { timeout: 10000 }); await momenteWeg(s); };

const a = await seiteFuer("tok-a");
const b = await seiteFuer("tok-b");
const c = await seiteFuer("tok-c");
await laden(a);

console.log("== Startseite");
pruefe("Haushaltsplan verlinkt", await a.locator('[data-go="plan"]').count() > 0, true);
await a.screenshot({ path: `${AUS}/q1-start.png` });

console.log("== Aufgabe vorschlagen");
await a.click('.rowlink[data-go="plan"]');
await a.waitForSelector(".appbar .title");
pruefe("Plan geöffnet", await a.locator(".appbar .title").innerText(), "Haushaltsplan");
await a.click('[data-sheet="neue-aufgabe"]');
await a.waitForSelector("#aname");
await a.fill("#aname", "Wohnung saugen");
await a.click('[data-rhythmus="1× pro Woche"]');
await a.screenshot({ path: `${AUS}/q2-neue-aufgabe.png` });
await a.click('[data-senden="neue-aufgabe"]');
await a.waitForTimeout(1200);
pruefe("Landet bei den Abstimmungen", await a.locator(".appbar .title").innerText(), "Wir");

for (const [s, name] of [[b, "B"], [c, "C"]]) {
  await laden(s);
  await s.click('.navbar [data-go="wir"]');
  await s.waitForSelector("[data-stimme]");
  await s.click('[data-stimme][data-antwort="ja"]');
  await s.waitForTimeout(1000);
  await momenteWeg(s);
  console.log(`  ok   ${name} hat zugestimmt`);
}

await laden(a);
await a.click('.rowlink[data-go="plan"]');
await a.waitForSelector(".aufgabe");
pruefe("Aufgabe steht im Plan", await a.locator(".aufgabe").count(), 1);
pruefe("Fälligkeit angezeigt", (await a.locator(".frist .w").first().innerText()).includes("7"), true);
await a.screenshot({ path: `${AUS}/q3-plan.png` });

console.log("== Nach Raum umschalten");
await a.click('[data-plansicht="raum"]');
await a.waitForTimeout(250);
pruefe("Raumüberschrift", await a.locator(".section-label").first().innerText(), "KÜCHE");
await a.click('[data-plansicht="frist"]');
await a.waitForTimeout(200);

console.log("== Aufgabe öffnen");
await a.click(".aufgabe");
await a.waitForSelector("[data-bewerbung]", { timeout: 8000 });
pruefe("Zähler für drei Personen", await a.locator(".rang").count(), 3);
pruefe("Gesperrt-Hinweis", (await a.locator(".body").innerText()).includes("Gesperrt bis"), true);
await a.screenshot({ path: `${AUS}/q4-aufgabe.png`, fullPage: true });

console.log("== Trotzdem erledigen braucht eine Begründung");
await a.click('[data-sheet="erledigt"]');
await a.waitForSelector('[data-senden="erledigt"]');
pruefe("Blatt heißt Trotzdem erledigen", await a.locator(".sheet h3").innerText(), "Trotzdem erledigen");
await a.click('[data-senden="erledigt"]');
await a.waitForTimeout(800);
pruefe("Fehler ohne Begründung", (await a.locator("#toast").innerText()).includes("Begründung"), true);
await a.fill(".sheet textarea", "Besuch kommt kurzfristig");
await a.click('[data-senden="erledigt"]');
await a.waitForTimeout(1200);
pruefe("Meldung gesendet", await a.locator(".sheet").count(), 0);
await a.screenshot({ path: `${AUS}/q5-gemeldet.png` });

console.log("== B prüft und bestätigt");
await laden(b);
await b.click('.navbar [data-go="pruefen"]');
await b.waitForSelector('[data-entscheiden="claims"]');
pruefe("Vorzeitig-Hinweis sichtbar", (await b.locator(".body").innerText()).includes("Besuch kommt"), true);
await b.screenshot({ path: `${AUS}/q6-pruefen.png` });
await b.click('[data-entscheiden="claims"][data-status="bestaetigt"]');
await b.waitForTimeout(1500);
pruefe("Vollbild-Moment", await b.locator("#celebrate[data-open]").count(), 1);
await b.screenshot({ path: `${AUS}/q7-bestaetigt.png` });
await momenteWeg(b);

console.log("== Bewerben und Rangliste");
// Fälligkeit vorziehen, damit die Vergabe greift
const { execSync } = await import("node:child_process");
const setzeFrist = (wann) => execSync(
  `cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --command ` +
  `"update quests set faellig_am = date('now','${wann}'), vergabe_runde = null, dran = null, zugewiesen = null" > /dev/null 2>&1`);
setzeFrist("+3 days");

for (const s of [a, b]) {
  await laden(s);
  await s.click('.rowlink[data-go="plan"]');
  await s.waitForSelector(".aufgabe");
  await s.click(".aufgabe");
  await s.waitForSelector('[data-bewerbung="ja"]', { timeout: 8000 });
  await s.click('[data-bewerbung="ja"]');
  await s.waitForTimeout(1200);
}
// Jetzt einen Tag vor Fälligkeit: die Reihenfolge friert beim nächsten Laden ein.
execSync(
  `cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --command ` +
  `"update quests set faellig_am = date('now','+1 day')" > /dev/null 2>&1`);
execSync(
  `cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --command ` +
  `"update bewerbungen set runde = date('now','+1 day')" > /dev/null 2>&1`);

await laden(a);
await a.click('.rowlink[data-go="plan"]');
await a.waitForSelector(".aufgabe");
await a.click(".aufgabe");
await a.waitForSelector(".rang[data-erster]", { timeout: 8000 });
const rangNamen = await a.locator(".rang .t").allInnerTexts();
console.log("  Rangliste: " + rangNamen.join(" | "));
pruefe("Zwei Bewerber in der Rangliste", await a.locator(".rang[data-erster]").count(), 1);
await a.screenshot({ path: `${AUS}/q8-rangliste.png`, fullPage: true });

console.log("== B steht oben und reicht weiter");
await laden(b);
await b.click('.rowlink[data-go="plan"]');
await b.waitForSelector(".aufgabe");
await b.click(".aufgabe");
await b.waitForSelector("[data-vergabe]", { timeout: 8000 });
await b.screenshot({ path: `${AUS}/q9-b-dran.png`, fullPage: true });
await b.click('[data-vergabe][data-annehmen="nein"]');
await b.waitForTimeout(1500);

await laden(a);
await a.click('.rowlink[data-go="plan"]');
await a.waitForSelector(".aufgabe");
await a.click(".aufgabe");
await a.waitForSelector("[data-vergabe]", { timeout: 8000 });
pruefe("A ist jetzt dran", await a.locator('[data-vergabe][data-annehmen="ja"]').count(), 1);
await a.click('[data-vergabe][data-annehmen="ja"]');
await a.waitForTimeout(1500);
const zustand = await a.evaluate(async () => (await (await fetch("/api/state")).json()).plan[0]);
pruefe("A ist zugewiesen", zustand.zugewiesen, "u-a");
pruefe("Keine Rangliste mehr", (await a.locator(".rang[data-erster]").count()), 0);
pruefe("Bewerbungsknopf verschwunden", await a.locator("[data-bewerbung]").count(), 0);
await a.screenshot({ path: `${AUS}/q10-angenommen.png`, fullPage: true });

console.log("== Gruppenstrafe in den Einstellungen");
await laden(a);
await a.click('[data-go="einstellungen"]');
await a.waitForSelector('[data-go="haushalt"]');
await a.click('[data-go="haushalt"]');
await a.waitForSelector("[data-strafe]");
pruefe("Strafe steht auf An", await a.locator('[data-strafe="an"][aria-pressed="true"]').count(), 1);
await a.screenshot({ path: `${AUS}/q11-haushalt.png`, fullPage: true });

console.log(fehler ? `\n${fehler} FEHLER` : "\nALLES GRÜN");
await browser.close();
process.exit(fehler ? 1 : 0);
