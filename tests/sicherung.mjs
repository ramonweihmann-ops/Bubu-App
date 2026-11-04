// Die wöchentliche Sicherung: Export über eine nachgebaute Cloudflare-Schnittstelle
// (hier auf Port 8799), Ablage im lokalen R2-Speicher, Aufräumen nach 28 Tagen, der
// Wecker (sichert nur, wenn die letzte älter als 6½ Tage ist), Fehler und abgelehntes
// Token, die Karte im Dashboard. Braucht den Testserver mit --test-scheduled,
// SICHERUNG_API=http://127.0.0.1:8799/client/v4 und D1_SICHERUNG_TOKEN=probe-token.
import { chromium } from "playwright";
import http from "node:http";
import { execFileSync } from "node:child_process";
const ZIEL = process.env.HQ_ZIEL || "http://127.0.0.1:8792";
const AUS = process.env.HQ_BILDER || "/tmp";
const KONTO = "c96097fc58419e9dc3df6cc67d7aaa9c";
const DB = "6d3cf5e4-f2c8-4d32-a008-e93a3a1b283f";

let fehler = 0;
const pruefe = (n, ist, soll) => {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) fehler++;
  console.log(`${ok ? "  ok  " : "  FEHL"} ${n}: ${JSON.stringify(ist)}${ok ? "" : " soll=" + JSON.stringify(soll)}`);
};
const api = async (pfad, daten, token = "tok-ramon") => {
  const r = await fetch(`${ZIEL}/api/${pfad}`, {
    method: daten ? "POST" : "GET",
    headers: { Cookie: `hq_sitzung=${token}`, ...(daten ? { "Content-Type": "application/json" } : {}) },
    body: daten ? JSON.stringify(daten) : undefined
  });
  return { status: r.status, ...(await r.json()) };
};
const sql = (befehl) => JSON.parse(execFileSync("npx",
  ["wrangler", "d1", "execute", "haus-quest", "--local", "--json", "--command", befehl.replace(/\s+/g, " ")],
  { cwd: "/workspace/bubu-app", stdio: ["ignore", "pipe", "ignore"] }).toString())[0].results;
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Die nachgebaute Schnittstelle von Cloudflare
const DUMP = "PRAGMA defer_foreign_keys=TRUE;\nCREATE TABLE probe (id TEXT PRIMARY KEY);\nINSERT INTO probe VALUES('sicherung');\n";
const P = { modus: "gut", anfragen: [], downloads: 0 };
const schnittstelle = http.createServer((req, res) => {
  let roh = "";
  req.on("data", (s) => (roh += s));
  req.on("end", () => {
    const antworte = (status, daten) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(daten)); };
    if (req.method === "GET" && req.url === "/datei/homi-point.sql") {
      P.downloads++;
      if (P.modus === "ohneLaenge") { res.writeHead(200, { "Content-Type": "application/sql" }); res.write(DUMP.slice(0, 20)); res.end(DUMP.slice(20)); return; }
      res.writeHead(200, { "Content-Type": "application/sql", "Content-Length": Buffer.byteLength(DUMP) });
      return res.end(DUMP);
    }
    const inhalt = roh ? JSON.parse(roh) : {};
    P.anfragen.push({ url: req.url, auth: req.headers.authorization, inhalt });
    if (req.url !== `/client/v4/accounts/${KONTO}/d1/database/${DB}/export`) return antworte(404, { success: false, errors: [{ message: "Gibt es nicht" }] });
    if (req.headers.authorization !== "Bearer probe-token" || P.modus === "token") {
      return antworte(403, { success: false, errors: [{ code: 10000, message: "Authentication error" }] });
    }
    if (!inhalt.current_bookmark) { P.nachfragen = 0; return antworte(200, { success: true, result: { at_bookmark: "lz-1", messages: ["Export gestartet"] } }); }
    P.nachfragen++;
    if (P.modus === "fehler") return antworte(200, { success: true, result: { at_bookmark: "lz-1", status: "error", error: "Probe: Speicher voll" } });
    if (P.nachfragen < 2) return antworte(200, { success: true, result: { at_bookmark: "lz-1", messages: ["läuft"] } });
    const datei = { filename: "homi-point-probe.sql", signed_url: "http://127.0.0.1:8799/datei/homi-point.sql" };
    // Cloudflares Beispiel liest signed_url eine Ebene höher als die Beschreibung — beides muss gehen.
    if (P.modus === "alt") return antworte(200, { success: true, result: { at_bookmark: "lz-1", status: "complete", ...datei } });
    return antworte(200, { success: true, result: { at_bookmark: "lz-1", status: "complete", success: true, type: "export", result: datei } });
  });
});
await new Promise((r) => schnittstelle.listen(8799, "127.0.0.1", r));

sql("delete from einstellungen where schluessel = 'sicherung'; delete from fehler where ort = 'sicherung';");

console.log("== Nur für das Team");
pruefe("Ohne Betriebs-Konto kein Sichern", (await api("betrieb/sicherung", {}, "tok-a")).status, 403);
pruefe("Noch kein Stand", (await api("betrieb")).sicherung, null);

console.log("== Jetzt sichern");
let s = await api("betrieb/sicherung", {});
pruefe("Gesichert", s.ok, true);
pruefe("Als Datei mit Datum im Ordner sicherung/", /^sicherung\/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.sql$/.test(s.datei), true);
pruefe("Die ganze Datei liegt im Speicher", s.groesse, Buffer.byteLength(DUMP));
pruefe("Mindestens eine Kopie", s.kopien >= 1, true);
const start = P.anfragen.filter((a) => !a.inhalt.current_bookmark);
pruefe("Export mit Token", start.at(-1)?.auth, "Bearer probe-token");
pruefe("… als Abfrage-Export", start.at(-1)?.inhalt.output_format, "polling");
pruefe("Nachgefragt mit dem Lesezeichen", P.anfragen.at(-1)?.inhalt.current_bookmark, "lz-1");
pruefe("Steht im Dashboard", (await api("betrieb")).sicherung.datei, s.datei);
const kopien = s.kopien;

console.log("== Was Cloudflare liefert, in beiden Schreibweisen und ohne Länge");
P.modus = "alt";
pruefe("signed_url eine Ebene höher geht auch", (await api("betrieb/sicherung", {})).ok, true);
P.modus = "ohneLaenge";
s = await api("betrieb/sicherung", {});
pruefe("Ohne Content-Length geht auch", [s.ok, s.groesse], [true, Buffer.byteLength(DUMP)]);
P.modus = "gut";

console.log("== Nach 28 Tagen wird gelöscht");
const heute = (await api("betrieb")).sicherung.kopien;
pruefe("Drei Sicherungen von heute", heute, kopien + 2);
s = await api("betrieb/sicherung", { probeZeit: new Date(Date.now() - 20 * 864e5).toISOString() });
pruefe("Eine von vor 20 Tagen bleibt", s.kopien, heute + 1);
s = await api("betrieb/sicherung", { probeZeit: new Date(Date.now() - 40 * 864e5).toISOString() });
pruefe("Eine von vor 40 Tagen ist gleich wieder weg", s.kopien, heute + 1);

console.log("== Der Wecker sichert einmal pro Woche");
const vorSieben = new Date(Date.now() - 7 * 864e5).toISOString();
sql(`update einstellungen set wert = json_set(wert, '$.am', '${vorSieben}') where schluessel = 'sicherung'`);
let exporte = P.anfragen.filter((a) => !a.inhalt.current_bookmark).length;
await fetch(`${ZIEL}/__scheduled?cron=0+6+*+*+*`);
let neu = null;
for (let i = 0; i < 60 && !neu; i++) {
  await warte(500);
  const am = (await api("betrieb")).sicherung.am;
  if (am !== vorSieben) neu = am;
}
pruefe("Letzte vor 7 Tagen: der Wecker sichert", Boolean(neu) && Date.now() - Date.parse(neu) < 120e3, true);
pruefe("… mit einem Export", P.anfragen.filter((a) => !a.inhalt.current_bookmark).length, exporte + 1);
exporte = P.anfragen.filter((a) => !a.inhalt.current_bookmark).length;
await fetch(`${ZIEL}/__scheduled?cron=0+6+*+*+*`);
await warte(8000);
pruefe("Am nächsten Morgen nicht noch einmal", P.anfragen.filter((a) => !a.inhalt.current_bookmark).length, exporte);

console.log("== Wenn es scheitert");
const gut = (await api("betrieb")).sicherung;
P.modus = "fehler";
s = await api("betrieb/sicherung", {});
pruefe("Export scheitert: gemeldet", [s.ok, s.fehler], [false, "Der Export ist fehlgeschlagen: Probe: Speicher voll"]);
pruefe("Die letzte gute Sicherung bleibt stehen", s.am, gut.am);
let lage = await api("betrieb");
pruefe("In der Fehlerliste", lage.fehler.some((f) => f.ort === "sicherung" && f.nachricht.includes("Speicher voll")), true);
pruefe("… und als kritisch gezählt", lage.tore.fehler.offen >= 1, true);
P.modus = "token";
s = await api("betrieb/sicherung", {});
pruefe("Token abgelehnt: sagt, was fehlt", s.fehler, "Cloudflare lehnt das Token ab (403) — braucht das Recht „D1 bearbeiten“");
P.modus = "gut";

console.log("== Die Karte im Dashboard");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const [breite, thema] of [[1180, "light"], [375, "light"], [375, "dark"]]) {
  const ctx = await browser.newContext({ viewport: { width: breite, height: 900 }, deviceScaleFactor: 2, colorScheme: thema, locale: "de-DE" });
  await ctx.addCookies([{ name: "hq_sitzung", value: "tok-ramon", domain: "127.0.0.1", path: "/" }]);
  const seite = await ctx.newPage();
  seite.on("pageerror", (e) => { console.log("  FEHL pageerror: " + e.message); fehler++; });
  await seite.goto(`${ZIEL}/betrieb/`, { waitUntil: "networkidle" });
  await seite.waitForSelector("[data-sicherung]");
  const text = async (sel) => (await seite.locator(sel).innerText()).replace(/\s+/g, " ").trim();
  if (breite === 1180 && thema === "light") {
    pruefe("Nach dem Fehler: rot mit Grund", (await text("[data-sicherung-lage]")).includes("fehlgeschlagen"), true);
    pruefe("… und dem Grund", (await text("[data-sicherung-fehler]")).includes("lehnt das Token ab"), true);
    await seite.locator("[data-sicherung]").screenshot({ path: `${AUS}/si1-fehler.png` });
    await seite.click("[data-sichern]");
    await seite.waitForSelector("#toast[data-offen]");
    pruefe("Jetzt sichern", await text("#toast"), "Gesichert.");
    await seite.waitForSelector("[data-sicherung-info]");
    pruefe("Wieder grün", (await text("[data-sicherung-lage]")).endsWith("Gesichert"), true);
    pruefe("Kein Fehler mehr", await seite.locator("[data-sicherung-fehler]").count(), 0);
    pruefe("Wann, wie groß, wie viele", /^Zuletzt .+ · 1 KB · \d+ Kopien$/.test(await text("[data-sicherung-info]")), true);
    pruefe("Neben „Pilot“", await seite.evaluate(() => document.querySelector("[data-sicherung]").parentElement.classList.contains("stapel")), true);
    await seite.screenshot({ path: `${AUS}/si2-dashboard.png`, fullPage: true });
    await seite.locator("[data-sicherung]").screenshot({ path: `${AUS}/si3-karte.png` });
  } else {
    pruefe(`${breite} px ${thema}: nichts läuft über`, await seite.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    pruefe(`${breite} px ${thema}: grün`, (await text("[data-sicherung-lage]")).endsWith("Gesichert"), true);
    await seite.locator("[data-sicherung]").screenshot({ path: `${AUS}/si4-karte-${thema}.png` });
  }
  await ctx.close();
}
await browser.close();

sql("delete from fehler where ort = 'sicherung';");
schnittstelle.close();
console.log(fehler ? `${fehler} Fehler` : "ALLES GRÜN");
process.exit(fehler ? 1 : 0);
