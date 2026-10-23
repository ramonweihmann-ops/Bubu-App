// Android im Browser: die Datei, mit der Android die App der Seite zuordnet
// (/.well-known/assetlinks.json), der Verweis auf die Play-Store-App im Manifest, das
// einfarbige Zeichen für Benachrichtigungen und das Band „Homi Point als App“ — auf
// der Anmeldung, auf der Kinder-Anmeldung und als Zeile auf der Startseite.
// Chrome bietet das Installieren in Tests nicht von selbst an; der Test schickt das
// Ereignis „beforeinstallprompt“ deshalb selbst, mit einem Probe-Dialog.
import { chromium } from "playwright";
const ZIEL = process.env.HQ_ZIEL || "http://127.0.0.1:8792";
const AUS = process.env.HQ_BILDER || "/tmp";

let fehler = 0;
const pruefe = (n, ist, soll) => {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) fehler++;
  console.log(`${ok ? "  ok  " : "  FEHL"} ${n}: ${JSON.stringify(ist)}${ok ? "" : " soll=" + JSON.stringify(soll)}`);
};

console.log("== Was Android von der Seite braucht");
const al = await fetch(`${ZIEL}/.well-known/assetlinks.json`);
pruefe("assetlinks.json kommt", al.status, 200);
pruefe("… als JSON", (al.headers.get("content-type") || "").startsWith("application/json"), true);
const links = await al.json();
pruefe("Für die App com.homipoint.app", links[0]?.target?.package_name, "com.homipoint.app");
pruefe("Darf alle Links öffnen", links[0]?.relation?.[0], "delegate_permission/common.handle_all_urls");
pruefe("Mit Fingerabdruck", /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(links[0]?.target?.sha256_cert_fingerprints?.[0] || ""), true);
const manifest = await (await fetch(`${ZIEL}/manifest.webmanifest`)).json();
pruefe("Manifest kennt die Store-App", manifest.related_applications?.[0]?.id, "com.homipoint.app");
pruefe("… zieht sie aber nicht vor (Kinder-Tablets installieren aus dem Browser)", manifest.prefer_related_applications, false);
pruefe("Einfarbiges Zeichen da", (await fetch(`${ZIEL}/icons/badge-96.png`)).status, 200);
pruefe("Benachrichtigungen nutzen es", (await (await fetch(`${ZIEL}/sw.js`)).text()).includes('badge: "/icons/badge-96.png"'), true);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
async function seite(token = null) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, locale: "de-DE" });
  if (token) await ctx.addCookies([{ name: "hq_sitzung", value: token, domain: "127.0.0.1", path: "/" }]);
  const s = await ctx.newPage();
  s.on("pageerror", (e) => { console.log("  FEHL pageerror: " + e.message); fehler++; });
  return s;
}
// Was Chrome auf Android schickt, sobald Homi Point installierbar ist.
const angebot = (s, wahl = "accepted") => s.evaluate((w) => {
  const ev = new Event("beforeinstallprompt", { cancelable: true });
  ev.prompt = () => { window.__gefragt = (window.__gefragt || 0) + 1; };
  ev.userChoice = Promise.resolve({ outcome: w });
  window.dispatchEvent(ev);
}, wahl);

console.log("== Anmeldung");
let s = await seite();
await s.goto(`${ZIEL}/app/`, { waitUntil: "networkidle" });
await s.waitForSelector("[data-google]");
pruefe("Ohne Angebot kein Band", await s.locator("[data-installband]").count(), 0);
await angebot(s);
await s.waitForSelector("[data-installband]");
pruefe("Band oben", (await s.locator("[data-installband]").innerText()).replace(/\s+/g, " ").trim().startsWith("Homi Point als App"), true);
pruefe("375 px: nichts läuft über", await s.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
await s.screenshot({ path: `${AUS}/uan1-band.png` });
await s.click("[data-installieren]");
await s.waitForSelector("#toast[data-open]");
pruefe("Chrome hat gefragt", await s.evaluate(() => window.__gefragt), 1);
pruefe("Bestätigt", (await s.locator("#toast").innerText()).includes("liegt jetzt auf dem Startbildschirm"), true);
pruefe("Band weg", await s.locator("[data-installband]").count(), 0);

console.log("== Wegtippen merkt sich die App");
await s.reload({ waitUntil: "networkidle" });
await s.waitForSelector("[data-google]");
await angebot(s);
await s.waitForSelector("[data-installband]");
await s.click('[data-installband] [data-hinweis-weg="installieren"]');
pruefe("Weggetippt", await s.locator("[data-installband]").count(), 0);
await s.reload({ waitUntil: "networkidle" });
await s.waitForSelector("[data-google]");
await angebot(s);
await s.waitForTimeout(300);
pruefe("Kommt nicht wieder", await s.locator("[data-installband]").count(), 0);
await s.context().close();

console.log("== Kinder-Anmeldung");
s = await seite();
await s.goto(`${ZIEL}/app/`, { waitUntil: "networkidle" });
await s.waitForSelector("[data-kind-code-eingeben]");
await s.click("[data-kind-code-eingeben]");
await angebot(s);
await s.waitForTimeout(300);
await s.click("[data-kind-zurueck]");
pruefe("Zurück auf der Anmeldung steht das Band", await s.locator("[data-installband]").count(), 1);
await s.click("[data-kind-code-eingeben]");
pruefe("Auf der Kinder-Anmeldung auch", await s.locator("[data-installband]").count(), 1);
await s.locator(".mitte").screenshot({ path: `${AUS}/uan2-kind.png` });
await s.context().close();

console.log("== Startseite");
s = await seite("tok-ramon");
await s.goto(`${ZIEL}/app/`, { waitUntil: "networkidle" });
await s.waitForSelector(".navbar");
pruefe("Ohne Angebot keine Zeile", await s.locator(".zuletzt.hinweis [data-installieren]").count(), 0);
await angebot(s, "dismissed");
await s.waitForSelector(".zuletzt.hinweis [data-installieren]");
pruefe("Zeile zum Installieren", (await s.locator(".zuletzt.hinweis [data-installieren]").innerText()).includes("Homi Point als App installieren"), true);
await s.locator(".zuletzt.hinweis [data-installieren]").scrollIntoViewIfNeeded();
await s.screenshot({ path: `${AUS}/uan3-start.png` });
await s.click(".zuletzt.hinweis [data-installieren]");
await s.waitForFunction(() => !document.querySelector(".zuletzt.hinweis [data-installieren]"));
pruefe("Abgelehnt: kein Jubel", await s.locator("#toast[data-open]").count(), 0);
pruefe("Zeile weg — Chrome fragt erst später wieder", await s.locator(".zuletzt.hinweis [data-installieren]").count(), 0);
await s.context().close();

await browser.close();
console.log(fehler ? `${fehler} Fehler` : "ALLES GRÜN");
process.exit(fehler ? 1 : 0);
