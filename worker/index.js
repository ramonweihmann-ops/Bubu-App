// Haus-Quest – ein Worker liefert die Seite, die Schnittstelle und den Wecker.

import { handleAuth } from "./auth.js";
import { handleApi } from "./api.js";
import { planNachziehen } from "./plan.js";
import { eventsNachziehen } from "./events.js";
import { umziehen } from "./umzug.js";
import { fehlerMerken, fehlerAufraeumen, ortOhneKennung } from "./fehler.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Solange die alte Datenbank noch daneben hängt: erst umziehen, dann antworten.
    // /api/health stößt den Umzug selbst an und meldet, woran er scheitert.
    if (url.pathname.startsWith("/api/") && url.pathname !== "/api/health") {
      let fertig = false;
      try {
        fertig = await umziehen(env);
      } catch (fehler) {
        console.log(`Umzug: ${fehler.message}`);
      }
      if (!fertig) {
        return Response.json({ fehler: "Homi Point zieht gerade um — bitte gleich noch einmal versuchen" }, { status: 503 });
      }
    }

    if (url.pathname.startsWith("/api/auth/")) {
      try {
        return await handleAuth(request, env, url);
      } catch (fehler) {
        // Die Anmeldung hat keinen eigenen Fehlerfang — was hier ankommt, ist ein echter Fehler.
        await fehlerMerken(env, { quelle: "server", nachricht: String(fehler.message || fehler), ort: ortOhneKennung(url.pathname) });
        throw fehler;
      }
    }
    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url);
    }
    return env.ASSETS.fetch(request);
  },

  /**
   * Der Wecker. Einmal am Morgen geht er alle Haushalte durch und zieht nach,
   * was am Kalender hängt: die Rangliste einen Tag vor Fälligkeit, die Mahnung
   * bei überfälligen Aufgaben, die Gruppenstrafe nach sieben Tagen.
   *
   * Beim Laden der App passiert dasselbe noch einmal — doppelt schadet nicht,
   * weil jeder Schritt am Fälligkeitsdatum festhält, dass er gelaufen ist. Der
   * Wecker sorgt nur dafür, dass es auch dann passiert, wenn tagelang niemand
   * die App öffnet.
   */
  async scheduled(ereignis, env, ctx) {
    ctx.waitUntil(alleHaushalteNachziehen(env));
  }
};

async function alleHaushalteNachziehen(env) {
  if (!(await umziehen(env))) return; // erst wenn der Umzug durch ist
  await fehlerAufraeumen(env).catch((e) => console.log(`Wecker: Fehler aufräumen — ${e.message}`));
  const haushalte = await env.DB.prepare(
    "select id from couples where eingerichtet = 1"
  ).all();

  for (const haus of haushalte.results) {
    try {
      await planNachziehen(env, haus.id);
      // Dauerevents rücken hier weiter, auch wenn tagelang niemand die App öffnet.
      await eventsNachziehen(env, haus.id);
    } catch (fehler) {
      // Ein kaputter Haushalt darf die anderen nicht aufhalten.
      console.log(`Wecker: ${haus.id} übersprungen — ${fehler.message}`);
    }
  }
}
