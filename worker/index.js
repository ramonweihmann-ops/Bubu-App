// Haus-Quest – ein Worker liefert die Seite, die Schnittstelle und den Wecker.

import { handleAuth } from "./auth.js";
import { handleApi } from "./api.js";
import { planNachziehen } from "./plan.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/auth/")) {
      return handleAuth(request, env, url);
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
  const haushalte = await env.DB.prepare(
    "select id from couples where eingerichtet = 1"
  ).all();

  for (const haus of haushalte.results) {
    try {
      await planNachziehen(env, haus.id);
    } catch (fehler) {
      // Ein kaputter Haushalt darf die anderen nicht aufhalten.
      console.log(`Wecker: ${haus.id} übersprungen — ${fehler.message}`);
    }
  }
}
