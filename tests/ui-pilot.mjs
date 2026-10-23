// Pilot im Browser: die Anmeldung mit Einladung (Link, von Hand, Haushaltscode,
// ohne), das Gründen danach, die Einladung in der App annehmen, das Betriebs-
// Dashboard und das Melden von Abstürzen. Braucht den Testserver mit HQ_TEST=1
// und BETRIEB_EMAILS=ramon@example.com. Schaltet den Pilot ein und am Ende aus.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
const ZIEL = "http://127.0.0.1:8792";
const AUS = process.env.HQ_BILDER || "/tmp";

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
  return r.json();
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const neu = async (opt = {}) => {
  const k = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, ...opt });
  const s = await k.newPage();
  s.on("pageerror", (e) => { if (!/probe absturz/.test(e.message)) { console.log("  FEHL pageerror: " + e.message); fehler++; } });
  s.on("console", (m) => { if (m.type() === "error" && !/ERR_NAME_NOT_RESOLVED|favicon|vibrate|status of 40/.test(m.text())) { console.log("  FEHL console: " + m.text()); fehler++; } });
  return s;
};
const text = async (s, sel = "body") => (await s.locator(sel).innerText()).replace(/\s+/g, " ").trim();
const ueberlauf = (s) => s.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const sql = (befehl) => JSON.parse(execFileSync("npx",
  ["wrangler", "d1", "execute", "haus-quest", "--local", "--json", "--command", befehl.replace(/\s+/g, " ")],
  { cwd: "/workspace/bubu-app", stdio: ["ignore", "pipe", "ignore"] }).toString())[0].results;
const aufraeumen = () => sql(`delete from couples where id in (select couple_id from members where user_id like 'probe-ui-%');
  delete from users where id like 'probe-ui-%'; delete from einladungen where name in ('Familie UI', 'Später in der App', 'Familie Neu');
  delete from fehler; delete from einstellungen where schluessel = 'fehler_tag';`);
aufraeumen();

await api("betrieb/pilot", { pflicht: true });
const E1 = (await api("betrieb/einladung", { name: "Familie UI" })).code;
const E2 = (await api("betrieb/einladung", { name: "Später in der App" })).code;

console.log("== Anmeldeseite im Pilot");
let s = await neu();
await s.goto(`${ZIEL}/app/`, { waitUntil: "networkidle" });
await s.waitForSelector("#pilot-code");
pruefe("Feld für die Einladung", await s.locator("#pilot-code").count(), 1);
pruefe("Google erst nach der Einladung", await s.locator("button[data-google]").isDisabled(), true);
pruefe("Wer dabei ist, kommt trotzdem rein", await s.locator("[data-schon-dabei]").getAttribute("href"), "/api/auth/start");
pruefe("375 px: nichts läuft über", await ueberlauf(s), false);
await s.fill("#pilot-code", "quatsch");
await s.keyboard.press("Enter");
await s.waitForSelector(".pilotfehler");
pruefe("Sagt, was nicht stimmt", (await text(s, ".pilotfehler")).startsWith("So sieht kein Code aus"), true);
pruefe("Feld als fehlerhaft markiert", await s.locator("#pilot-code").getAttribute("aria-invalid"), "true");
await s.screenshot({ path: `${AUS}/up-anmeldung-fehler.png` });
await s.fill("#pilot-code", E1.toLowerCase().replace(/-/g, " "));
await s.click("[data-pilot-pruefen]");
await s.waitForSelector("[data-einladung-ok]");
pruefe("Einladung erkannt, auch klein und mit Leerzeichen", (await text(s, "[data-einladung-ok]")).includes(E1), true);
pruefe("Google jetzt frei", await s.locator("a[data-google]").getAttribute("href"), "/api/auth/start");
await s.click("[data-pilot-anders]");
pruefe("„anderer Code“ führt zurück zum Feld", await s.locator("#pilot-code").count(), 1);
await s.context().close();

console.log("== Mit dem Link: anmelden und gründen");
s = await neu();
await s.goto(`${ZIEL}/app/?pilot=${E1}`, { waitUntil: "networkidle" });
await s.waitForSelector("[data-einladung-ok]");
pruefe("Kam mit dem Link", (await text(s, "[data-einladung-ok]")).includes("kam mit dem Link"), true);
pruefe("Name der Einladung bleibt verborgen", (await text(s)).includes("Familie UI"), false);
await s.screenshot({ path: `${AUS}/up-anmeldung-link.png` });
pruefe("Einladungs-Keks liegt bereit", (await s.context().cookies()).some((k) => k.name === "hq_einladung" && k.value === E1), true);
await s.goto(`${ZIEL}/api/auth/probe?sub=probe-ui-1&email=ui1@test&name=Uli`, { waitUntil: "networkidle" });
pruefe("In der App gelandet", new URL(s.url()).pathname, "/app/");
await s.waitForSelector("[data-eweiter]");
await s.click("[data-eweiter]");
await s.waitForSelector("text=Schön, dass du da bist");
pruefe("Darf gründen: „Los geht's“", await s.locator("button[data-eweiter]").innerText(), "Los geht's");
await s.context().close();

console.log("== Ohne Einladung angemeldet: nichts gespeichert, freundlich erklärt");
s = await neu();
await s.goto(`${ZIEL}/api/auth/probe?sub=probe-ui-ohne&email=ohne@test&name=Otto`, { waitUntil: "networkidle" });
pruefe("Zurück auf der Anmeldung", new URL(s.url()).search, "?ohne-einladung");
await s.waitForSelector("[data-ohne-einladung]");
pruefe("Erklärt den Pilot", (await text(s, "[data-ohne-einladung]")).includes("Dich kennen wir noch nicht"), true);
pruefe("Kein Konto angelegt", sql("select count(*) as n from users where id = 'probe-ui-ohne'")[0].n, 0);
await s.screenshot({ path: `${AUS}/up-ohne-einladung.png` });
await s.context().close();

console.log("== Mit dem Code eines Haushalts: gleich beitreten");
// Ein frischer Haushalt mit Platz: Uli gründet ihn über die Schnittstelle.
const uli = await browser.newContext();
const uliSeite = await uli.newPage();
await uliSeite.goto(`${ZIEL}/api/auth/probe?sub=probe-ui-1&email=ui1@test&name=Uli`);
const uliToken = (await uli.cookies()).find((k) => k.name === "hq_sitzung").value;
await api("haushalt/einrichten", { art: "wg", personen: 3, raeume: ["Küche"] }, uliToken);
const HC = (await api("state", undefined, uliToken)).code;
pruefe("Uli hat einen Haushalt mit Code", /^\d{6}$/.test(HC || ""), true);
await uli.close();
s = await neu();
await s.goto(`${ZIEL}/app/`, { waitUntil: "networkidle" });
await s.waitForSelector("#pilot-code");
await s.fill("#pilot-code", HC);
await s.click("[data-pilot-pruefen]");
await s.waitForSelector("[data-einladung-ok]");
pruefe("Als Haushaltscode erkannt", (await text(s, "[data-einladung-ok]")).includes("Nach der Anmeldung bist du gleich dabei"), true);
await s.goto(`${ZIEL}/api/auth/probe?sub=probe-ui-2&email=ui2@test&name=Zora`, { waitUntil: "networkidle" });
await s.waitForSelector("[data-eweiter]");
await s.click("[data-eweiter]");
await s.waitForSelector("text=Schön, dass du da bist");
pruefe("Statt gründen: beitreten", await s.locator("button[data-ecode]").first().innerText(), "Beitreten");
await s.click("button[data-ecode]");
pruefe("Code schon eingetragen", await s.locator("#code-eingabe").inputValue(), HC);
await s.click("[data-paar-beitreten]");
await s.waitForSelector(".toast[data-open]");
pruefe("Willkommen im Haushalt", (await text(s, ".toast")).includes("Willkommen im Haushalt"), true);
await s.context().close();

console.log("== Angemeldet ohne Haushalt: Einladung in der App annehmen");
// Pilot kurz aus, damit ein Konto ohne Einladung entsteht — wie jemand von vor dem Pilot.
await api("betrieb/pilot", { pflicht: false });
s = await neu();
await s.goto(`${ZIEL}/api/auth/probe?sub=probe-ui-3&email=ui3@test&name=Ida`, { waitUntil: "networkidle" });
await api("betrieb/pilot", { pflicht: true });
await s.reload({ waitUntil: "networkidle" });
await s.waitForSelector("[data-eweiter]");
await s.click("[data-eweiter]");
await s.waitForSelector("[data-ohne-gruenden]");
pruefe("Erklärt, warum nicht gegründet wird", (await text(s, "[data-ohne-gruenden]")).includes("mit einer Einladung"), true);
await s.screenshot({ path: `${AUS}/up-begruessung-ohne.png` });
await s.click("button[data-ecode]");
await s.fill("#code-eingabe", E2);
await s.click("[data-paar-beitreten]");
await s.waitForSelector("text=Euer Haushalt");
pruefe("Angenommen — weiter zum Haushalt", (await text(s, ".toast")).includes("Einladung angenommen"), true);
await s.context().close();

console.log("== Abstürze landen im Dashboard, Absagen nicht");
s = await neu();
await s.context().addCookies([{ name: "hq_sitzung", value: "tok-a", domain: "127.0.0.1", path: "/" }]);
await s.goto(`${ZIEL}/app/`, { waitUntil: "networkidle" });
await s.evaluate(() => setTimeout(() => { throw new TypeError("probe absturz"); }, 0));
// Eine Absage der Schnittstelle ist kein Absturz — weder in der App noch im Server.
await s.evaluate(() => fetch("/api/claims", { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ questId: "gibt-es-nicht" }) }).then(() => {}));
await s.waitForTimeout(800);
const lage = await api("betrieb");
pruefe("Absturz gemeldet", lage.fehler.some((f) => f.quelle === "app" && f.nachricht.includes("probe absturz")), true);
pruefe("Absage nicht als Fehler", lage.fehler.some((f) => /claims|Quest gibt es nicht/.test(f.nachricht + f.ort)), false);
pruefe("… mit dem Bereich, ohne Inhalte", lage.fehler.find((f) => f.nachricht.includes("probe absturz"))?.ort, "start");
await s.context().close();

console.log("== Das Betriebs-Dashboard");
s = await neu();
await s.goto(`${ZIEL}/betrieb/`, { waitUntil: "networkidle" });
pruefe("Ohne Anmeldung: Anmelden", await s.locator("a[href='/api/auth/start?weiter=/betrieb/']").count(), 1);
await s.context().addCookies([{ name: "hq_sitzung", value: "tok-a", domain: "127.0.0.1", path: "/" }]);
await s.reload({ waitUntil: "networkidle" });
pruefe("Nicht im Team: kein Zugang", (await text(s, "h1")), "Kein Zugang");
await s.context().addCookies([{ name: "hq_sitzung", value: "tok-ramon", domain: "127.0.0.1", path: "/" }]);
await s.reload({ waitUntil: "networkidle" });
await s.waitForSelector("[data-tor]");
pruefe("Vier Tore", await s.locator("[data-tor]").count(), 4);
pruefe("Testkauf: der Test läuft noch", (await text(s, "[data-tor='testkauf']")).includes("noch kein Test vorbei"), true);
pruefe("Haushalt unter dem Namen der Einladung", (await text(s)).includes("Familie UI"), true);
pruefe("Absturz in der Liste", (await text(s)).includes("probe absturz"), true);
pruefe("375 px: nichts läuft über", await ueberlauf(s), false);
await s.screenshot({ path: `${AUS}/up-dashboard.png`, fullPage: true });
await s.click("[data-neu]");
await s.fill("#ein-name", "Familie Neu");
await s.click("[data-anlegen]");
await s.waitForSelector(".ergebnis");
const neuerCode = await s.locator(".ergebnis .gross").innerText();
pruefe("Neuer Code", /^HOMI-[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(neuerCode), true);
pruefe("Mit Link", (await text(s, ".ergebnis .link")), `${ZIEL}/app/?pilot=${neuerCode}`);
await s.screenshot({ path: `${AUS}/up-dashboard-neu.png` });
await s.click("[data-zu]");
s.once("dialog", (d) => d.accept());
await s.click(`[data-zurueckziehen="${neuerCode}"]`);
await s.waitForSelector(".toast[data-offen]");
pruefe("Zurückgezogen", (await text(s, ".toast")), "Zurückgezogen.");
s.once("dialog", (d) => d.accept());
await s.click("[data-pflicht]");
await s.waitForTimeout(500);
pruefe("Pilot-Schalter aus", await s.locator("[data-pflicht]").getAttribute("aria-checked"), "false");
await s.context().close();

const dunkel = await neu({ colorScheme: "dark", viewport: { width: 1180, height: 900 } });
await dunkel.context().addCookies([{ name: "hq_sitzung", value: "tok-ramon", domain: "127.0.0.1", path: "/" }]);
await dunkel.goto(`${ZIEL}/betrieb/`, { waitUntil: "networkidle" });
await dunkel.waitForSelector("[data-tor]");
pruefe("Am Rechner: Tore nebeneinander", await dunkel.evaluate(() =>
  new Set([...document.querySelectorAll("[data-tor]")].map((e) => Math.round(e.getBoundingClientRect().top))).size), 1);
await dunkel.screenshot({ path: `${AUS}/up-dashboard-dunkel.png`, fullPage: true });
await dunkel.context().close();

await api("betrieb/pilot", { pflicht: false });
aufraeumen();
await browser.close();
console.log(fehler ? `${fehler} Fehler` : "ALLES GRÜN");
process.exit(fehler ? 1 : 0);
