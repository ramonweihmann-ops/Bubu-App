// Einladung per Link: Die Nachricht ist kurz, die Seite hinter dem Link zeigt die
// Schritte fürs Handy. Android: Testgruppe, App laden, Link noch einmal antippen —
// oder „In der App öffnen“, wenn die App schon da ist. iPhone: anmelden, auf den
// Home-Bildschirm, dort neu anmelden; die Startseite erinnert daran. Am Rechner: ein
// QR-Code fürs Handy. Dazu die Texte, die das Dashboard und ein Haushalt teilen.
// Braucht den Testserver mit HQ_TEST=1 und BETRIEB_EMAILS=ramon@example.com.
// Schaltet den Pilot ein und am Ende aus.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
const ZIEL = process.env.HQ_ZIEL || "http://127.0.0.1:8792";
const AUS = process.env.HQ_BILDER || "/tmp";
const GRUPPE = "https://groups.google.com/g/homi-point-pilot";
const TEST = "https://play.google.com/apps/testing/com.homipoint.app";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

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
const sql = (befehl) => JSON.parse(execFileSync("npx",
  ["wrangler", "d1", "execute", "haus-quest", "--local", "--json", "--command", befehl.replace(/\s+/g, " ")],
  { cwd: "/workspace/bubu-app", stdio: ["ignore", "pipe", "ignore"] }).toString())[0].results;
const aufraeumen = () => sql(`delete from couples where id in (select couple_id from members where user_id like 'probe-ue-%');
  delete from users where id like 'probe-ue-%'; delete from einladungen where name like 'Einladung UI%';`);
aufraeumen();

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
/** Ein frisches Gerät. `art`: android, iphone oder rechner; `vorher` läuft vor jeder Seite. */
async function geraet(art, { token = null, vorher = null, dunkel = false, breit = false } = {}) {
  const handy = art !== "rechner";
  const ctx = await browser.newContext({
    viewport: breit ? { width: 1180, height: 900 } : { width: 375, height: 812 }, deviceScaleFactor: 2, locale: "de-DE",
    colorScheme: dunkel ? "dark" : "light",
    ...(handy ? { userAgent: art === "android" ? ANDROID : IPHONE, isMobile: true, hasTouch: true } : {})
  });
  if (token) await ctx.addCookies([{ name: "hq_sitzung", value: token, domain: "127.0.0.1", path: "/" }]);
  // Was geteilt wird, landet in window.__geteilt statt im Teilen-Menü.
  await ctx.addInitScript(() => { navigator.share = async (d) => { window.__geteilt = d.text; }; });
  if (vorher) await ctx.addInitScript(vorher);
  const s = await ctx.newPage();
  s.on("pageerror", (e) => { console.log("  FEHL pageerror: " + e.message); fehler++; });
  s.on("console", (m) => { if (m.type() === "error" && !/favicon|vibrate|status of 40/.test(m.text())) { console.log("  FEHL console: " + m.text()); fehler++; } });
  return s;
}
const text = async (s, sel = "body") => (await s.locator(sel).innerText()).replace(/\s+/g, " ").trim();
const ueberlauf = (s) => s.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const appDa = () => { navigator.getInstalledRelatedApps = async () => [{ platform: "play", id: "com.homipoint.app" }]; };
const inDerApp = () => {
  const echt = window.matchMedia.bind(window);
  window.matchMedia = (q) => q.includes("standalone") ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : echt(q);
};

await api("betrieb/pilot", { pflicht: true });
const E1 = (await api("betrieb/einladung", { name: "Einladung UI 1" })).code;
pruefe("Einladung angelegt", /^HOMI-/.test(E1 || ""), true);

console.log("== Android: erst die App");
let s = await geraet("android");
await s.goto(`${ZIEL}/app/?pilot=${E1}`, { waitUntil: "networkidle" });
await s.waitForSelector('[data-schritte="android"]');
pruefe("Einladung erkannt", (await text(s, "[data-einladung-ok]")).includes(E1), true);
pruefe("Drei Schritte", await s.locator(".schritte li").count(), 3);
pruefe("1. zur Testgruppe", await s.locator("[data-testgruppe]").getAttribute("href"), GRUPPE);
pruefe("… mit Hilfe, wenn Google „nicht berechtigt“ zeigt", (await text(s, "[data-nicht-berechtigt]")).includes("Oben rechts „Anmelden“ tippen"), true);
pruefe("2. zum Play-Store-Test", await s.locator("[data-play-test]").getAttribute("href"), TEST);
pruefe("3. den Link noch einmal", (await text(s, ".schritte li:nth-child(3)")).startsWith("Diesen Link noch einmal antippen"), true);
pruefe("Noch keine Google-Anmeldung", await s.locator("[data-google]").count(), 0);
pruefe("375 px: nichts läuft über", await ueberlauf(s), false);
pruefe("Alles auf einen Blick (ohne Scrollen)",
  await s.evaluate(() => document.querySelector("[data-browser-weiter]").getBoundingClientRect().bottom <= innerHeight), true);
await s.screenshot({ path: `${AUS}/uei1-android.png` });
// Chrome bietet das Installieren an — die Schritte bleiben, ohne Band darüber.
await s.evaluate(() => { const ev = new Event("beforeinstallprompt", { cancelable: true }); ev.prompt = () => {}; ev.userChoice = Promise.resolve({ outcome: "dismissed" }); window.dispatchEvent(ev); });
await s.waitForTimeout(300);
pruefe("Kein Installieren-Band über den Schritten", await s.locator("[data-installband]").count(), 0);
pruefe("Schritte noch da", await s.locator('[data-schritte="android"]').count(), 1);
await s.click("[data-browser-weiter]");
await s.waitForSelector("a[data-google]");
pruefe("Lieber im Browser: anmelden geht", await s.locator("a[data-google]").getAttribute("href"), "/api/auth/start");
pruefe("… mit der Einladung", (await text(s, "[data-einladung-ok]")).includes(E1), true);
pruefe("… und dem Band zum Installieren", await s.locator("[data-installband]").count(), 1);
await s.reload({ waitUntil: "networkidle" });
await s.waitForSelector("a[data-google]");
pruefe("Nach dem Neuladen bleibt es beim Browser", await s.locator("[data-schritte]").count(), 0);
const zweiterTab = await s.context().newPage();
await zweiterTab.goto(`${ZIEL}/app/?pilot=${E1}`, { waitUntil: "networkidle" });
await zweiterTab.waitForSelector('[data-schritte="android"]');
pruefe("Der Link später noch einmal: wieder die Schritte", await zweiterTab.locator(".schritte li").count(), 3);
await s.context().close();

console.log("== Android: die App ist schon da");
s = await geraet("android", { vorher: appDa });
await s.goto(`${ZIEL}/app/?pilot=${E1}`, { waitUntil: "networkidle" });
await s.waitForSelector("[data-in-app]");
const intent = await s.locator("[data-in-app]").getAttribute("href");
pruefe("Öffnet die App mit dem Link", intent, `intent://127.0.0.1:8792/app/?pilot=${E1}#Intent;scheme=https;package=com.homipoint.app;end`);
pruefe("Keine Schritte zum Installieren", await s.locator(".schritte").count(), 0);
pruefe("Browser geht trotzdem", await s.locator("[data-browser-weiter]").count(), 1);
await s.screenshot({ path: `${AUS}/uei2-android-app-da.png` });
await s.context().close();

console.log("== Android: in der App");
s = await geraet("android", { vorher: inDerApp });
await s.goto(`${ZIEL}/app/?pilot=${E1}`, { waitUntil: "networkidle" });
await s.waitForSelector("[data-einladung-ok]");
pruefe("Keine Schritte", await s.locator("[data-schritte]").count(), 0);
pruefe("Gleich anmelden", await s.locator("a[data-google]").getAttribute("href"), "/api/auth/start");
pruefe("Einladung erkannt", (await text(s, "[data-einladung-ok]")).includes("kam mit dem Link"), true);
await s.context().close();

console.log("== Android: ohne Link, mit falschem Code");
s = await geraet("android");
await s.goto(`${ZIEL}/app/`, { waitUntil: "networkidle" });
await s.waitForSelector("#pilot-code");
pruefe("Ohne Link: Anmeldung wie immer", await s.locator("[data-schritte]").count(), 0);
await s.goto(`${ZIEL}/app/?pilot=HOMI-ZZZ-ZZZ`, { waitUntil: "networkidle" });
await s.waitForSelector(".pilotfehler");
pruefe("Falscher Code: erst der Fehler, keine Schritte", await s.locator("[data-schritte]").count(), 0);
await s.context().close();

console.log("== iPhone: anmelden, dann auf den Home-Bildschirm");
s = await geraet("iphone");
await s.goto(`${ZIEL}/app/?pilot=${E1}`, { waitUntil: "networkidle" });
await s.waitForSelector('[data-schritte="iphone"]');
pruefe("Drei Schritte", await s.locator(".schritte li").count(), 3);
pruefe("1. anmelden und einrichten", await text(s, ".schritte li:nth-child(1)"), "Mit Google anmelden und euren Haushalt einrichten");
pruefe("2. Teilen → Zum Home-Bildschirm", (await text(s, ".schritte li:nth-child(2)")).includes("„Zum Home-Bildschirm“"), true);
pruefe("… mit dem Teilen-Zeichen", await s.locator(".schritte li:nth-child(2) svg").count(), 1);
pruefe("3. dort neu anmelden", await text(s, ".schritte li:nth-child(3)"), "Vom Home-Bildschirm öffnen und einmal neu anmelden");
pruefe("Google-Anmeldung unter den Schritten", await s.locator("a[data-google]").getAttribute("href"), "/api/auth/start");
pruefe("… gleich darunter", await s.evaluate(() =>
  document.querySelector("[data-google]").getBoundingClientRect().top > document.querySelector(".schritte").getBoundingClientRect().bottom), true);
pruefe("Anmelden ohne Scrollen sichtbar",
  await s.evaluate(() => document.querySelector("[data-google]").getBoundingClientRect().bottom <= innerHeight), true);
pruefe("375 px: nichts läuft über", await ueberlauf(s), false);
await s.screenshot({ path: `${AUS}/uei3-iphone.png` });
await s.context().close();

console.log("== Am Rechner: QR-Code fürs Handy");
s = await geraet("rechner", { breit: true });
await s.goto(`${ZIEL}/app/?pilot=${E1}`, { waitUntil: "networkidle" });
await s.waitForSelector("[data-qr-karte] svg");
pruefe("QR-Code mit dem Link", await s.locator("[data-qr]").getAttribute("data-qr"), `${ZIEL}/app/?pilot=${E1}`);
pruefe("… beschriftet", await s.locator("[data-qr] svg").getAttribute("aria-label"), "QR-Code für dein Handy");
pruefe("Sagt, was zu tun ist", (await text(s, "[data-qr-karte]")).includes("Scanne den Code mit der Kamera"), true);
pruefe("Am Rechner anmelden geht auch", await s.locator("a[data-google]").getAttribute("href"), "/api/auth/start");
pruefe("Keine Handy-Schritte", await s.locator(".schritte").count(), 0);
await s.screenshot({ path: `${AUS}/uei4-rechner.png` });
await s.context().close();
s = await geraet("rechner");
await s.goto(`${ZIEL}/app/?pilot=${E1}`, { waitUntil: "networkidle" });
await s.waitForSelector("[data-qr-karte] svg");
pruefe("Schmal: nichts läuft über", await ueberlauf(s), false);
await s.goto(`${ZIEL}/app/`, { waitUntil: "networkidle" });
await s.waitForSelector("#pilot-code");
pruefe("Ohne Link kein QR-Code", await s.locator("[data-qr-karte]").count(), 0);
await s.context().close();

console.log("== Ein Haushalt lädt ein");
// Uli gründet über die Schnittstelle — kurz ohne Pilot, sonst bräuchte es eine Einladung.
await api("betrieb/pilot", { pflicht: false });
const uli = await browser.newContext();
const uliSeite = await uli.newPage();
await uliSeite.goto(`${ZIEL}/api/auth/probe?sub=probe-ue-1&email=ue1@test&name=Uli`);
const uliToken = (await uli.cookies()).find((k) => k.name === "hq_sitzung").value;
await uli.close();
await api("haushalt/einrichten", { art: "wg", personen: 3, raeume: ["Küche"] }, uliToken);
await api("betrieb/pilot", { pflicht: true });
const HC = (await api("state", undefined, uliToken)).code;
pruefe("Haushalt mit Code", /^\d{6}$/.test(HC || ""), true);
s = await geraet("android", { token: uliToken });
await s.goto(`${ZIEL}/app/`, { waitUntil: "networkidle" });
await s.waitForSelector('[data-go="einladen"]');
await s.locator('[data-go="einladen"]').first().click();
await s.waitForSelector("[data-teilen]");
await s.click("[data-teilen]");
await s.waitForFunction(() => window.__geteilt);
const geteilt = await s.evaluate(() => window.__geteilt);
pruefe("Kurze Nachricht", geteilt.split("\n")[0], "Komm in unseren Haushalt bei Homi Point! 🏠");
pruefe("Mit Link und Code darin", geteilt.includes(`${ZIEL}/app/?einladung=${HC}`), true);
pruefe("Sagt, wie lange", geteilt.trim().endsWith("Gilt 24 Stunden."), true);
pruefe("Kein „Punkte“", /\bPunkte\b/.test(geteilt), false);
await s.context().close();
// Ohne Teilen-Menü (Rechner): in die Zwischenablage.
s = await geraet("rechner", { token: uliToken, vorher: () => { delete Navigator.prototype.share; delete navigator.share; } });
await s.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: ZIEL });
await s.goto(`${ZIEL}/app/`, { waitUntil: "networkidle" });
await s.locator('[data-go="einladen"]').first().click();
await s.waitForSelector("[data-teilen]");
await s.click("[data-teilen]");
await s.waitForSelector(".toast[data-open]");
pruefe("Kopiert", await text(s, ".toast"), "Einladung kopiert.");
pruefe("Dieselbe Nachricht", (await s.evaluate(() => navigator.clipboard.readText())).includes(`/app/?einladung=${HC}`), true);
await s.context().close();

console.log("== Der Link eines Haushalts — Pilot an");
s = await geraet("android");
await s.goto(`${ZIEL}/app/?einladung=${HC}`, { waitUntil: "networkidle" });
await s.waitForSelector('[data-schritte="android"]');
pruefe("Als Haushaltscode erkannt", (await text(s, "[data-einladung-ok]")).includes("Nach der Anmeldung bist du gleich dabei"), true);
pruefe("Code gemerkt", await s.evaluate(() => localStorage.getItem("hq-haushaltscode")), HC);
await s.context().close();
s = await geraet("iphone");
await s.goto(`${ZIEL}/app/?einladung=${HC}`, { waitUntil: "networkidle" });
await s.waitForSelector('[data-schritte="iphone"]');
pruefe("iPhone: beitreten statt einrichten", await text(s, ".schritte li:nth-child(1)"), "Mit Google anmelden und dem Haushalt beitreten");
await s.context().close();

console.log("== Der Link eines Haushalts — Pilot aus");
await api("betrieb/pilot", { pflicht: false });
s = await geraet("android");
await s.goto(`${ZIEL}/app/?einladung=${HC}`, { waitUntil: "networkidle" });
await s.waitForSelector('[data-schritte="android"]');
pruefe("Auch ohne Pilot: die Schritte", await s.locator(".schritte li").count(), 3);
pruefe("Code gemerkt", await s.evaluate(() => localStorage.getItem("hq-haushaltscode")), HC);
await s.click("[data-browser-weiter]");
await s.waitForSelector("a[data-google]");
pruefe("Im Browser: Einladung sichtbar", (await text(s, "[data-einladung-ok]")).includes(HC), true);
pruefe("Kein Feld für einen Code", await s.locator("#pilot-code").count(), 0);
await s.goto(`${ZIEL}/api/auth/probe?sub=probe-ue-2&email=ue2@test&name=Zora`, { waitUntil: "networkidle" });
await s.waitForSelector("[data-eweiter]");
await s.click("[data-eweiter]");
await s.waitForSelector("text=Schön, dass du da bist");
pruefe("Nach der Anmeldung: gleich beitreten", await s.locator("button[data-ecode]").first().innerText(), "Beitreten");
await s.context().close();
await api("betrieb/pilot", { pflicht: true });

console.log("== iPhone: die Startseite erinnert an den Home-Bildschirm");
s = await geraet("iphone", { token: "tok-ramon" });
await s.goto(`${ZIEL}/app/`, { waitUntil: "networkidle" });
await s.waitForSelector(".navbar");
await s.waitForSelector("[data-homescreen]");
pruefe("Hinweis da", (await text(s, "[data-homescreen]")).includes("„Zum Home-Bildschirm“"), true);
pruefe("375 px: nichts läuft über", await ueberlauf(s), false);
await s.locator("[data-homescreen]").scrollIntoViewIfNeeded();
await s.screenshot({ path: `${AUS}/uei5-iphone-start.png` });
await s.click('[data-hinweis-weg="homescreen"]');
pruefe("Weggetippt", await s.locator("[data-homescreen]").count(), 0);
await s.reload({ waitUntil: "networkidle" });
await s.waitForSelector(".navbar");
pruefe("Kommt nicht wieder", await s.locator("[data-homescreen]").count(), 0);
await s.context().close();
s = await geraet("iphone", { token: "tok-ramon", vorher: () => { Object.defineProperty(navigator, "standalone", { value: true }); } });
await s.goto(`${ZIEL}/app/`, { waitUntil: "networkidle" });
await s.waitForSelector(".navbar");
pruefe("Vom Home-Bildschirm geöffnet: kein Hinweis", await s.locator("[data-homescreen]").count(), 0);
await s.context().close();
for (const art of ["android", "rechner"]) {
  s = await geraet(art, { token: "tok-ramon" });
  await s.goto(`${ZIEL}/app/`, { waitUntil: "networkidle" });
  await s.waitForSelector(".navbar");
  pruefe(`${art}: kein Hinweis zum Home-Bildschirm`, await s.locator("[data-homescreen]").count(), 0);
  await s.context().close();
}

console.log("== Dashboard: Einladung teilen");
s = await geraet("rechner", { token: "tok-ramon", breit: true });
await s.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: ZIEL });
await s.goto(`${ZIEL}/betrieb/`, { waitUntil: "networkidle" });
await s.waitForSelector(`[data-teilen="${E1}"]`);
pruefe("In der Liste: „Einladung teilen“", await s.locator(`[data-teilen="${E1}"]`).innerText(), "Einladung teilen");
await s.click(`[data-teilen="${E1}"]`);
await s.waitForSelector("[data-link-teilen]");
pruefe("Knopf „Einladung teilen“", await s.locator("[data-link-teilen]").innerText(), "Einladung teilen");
pruefe("Knopf „Nur Link kopieren“", await s.locator("[data-link-kopieren]").innerText(), "Nur Link kopieren");
await s.locator("#blatt").screenshot({ path: `${AUS}/uei6-dashboard.png` });
await s.click("[data-link-teilen]");
await s.waitForFunction(() => window.__geteilt);
const nachricht = await s.evaluate(() => window.__geteilt);
pruefe("Beginnt mit Hallo", nachricht.startsWith("Hallo! 👋\nDu bist zum Pilot von Homi Point eingeladen"), true);
pruefe("Verweist auf die Schritte", nachricht.includes("dort steht, wie es auf Android und iPhone weitergeht:"), true);
pruefe("Der Link auf eigener Zeile", nachricht.split("\n").includes(`${ZIEL}/app/?pilot=${E1}`), true);
pruefe("Keine Schritte in der Nachricht", /Testgruppe|Home-Bildschirm/.test(nachricht), false);
pruefe("Kein „Punkte“", /\bPunkte\b/.test(nachricht), false);
await s.click("[data-link-kopieren]");
await s.waitForSelector(".toast[data-offen]");
pruefe("Nur der Link in der Zwischenablage", await s.evaluate(() => navigator.clipboard.readText()), `${ZIEL}/app/?pilot=${E1}`);
await s.context().close();

console.log("== Handy im Dunkeln");
for (const art of ["android", "iphone"]) {
  s = await geraet(art, { dunkel: true });
  await s.goto(`${ZIEL}/app/?pilot=${E1}`, { waitUntil: "networkidle" });
  await s.waitForSelector(`[data-schritte="${art}"]`);
  pruefe(`${art} dunkel: nichts läuft über`, await ueberlauf(s), false);
  await s.screenshot({ path: `${AUS}/uei7-${art}-dunkel.png` });
  await s.context().close();
}

await api("betrieb/pilot", { pflicht: false });
aufraeumen();
await browser.close();
console.log(fehler ? `${fehler} Fehler` : "ALLES GRÜN");
process.exit(fehler ? 1 : 0);
