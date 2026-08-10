// Haus-Quest – Schnittstelle.
//
// Alles, was Punkte bewegt, läuft hier durch: Die App schickt nur Absichten
// („ich habe X erledigt“), geprüft und gebucht wird an dieser Stelle und in
// der Datenbank. Die eigentlichen Endpunkte kommen mit der App dazu.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, dienst: "haus-quest", zeit: new Date().toISOString() });
    }

    if (url.pathname.startsWith("/api/")) {
      return Response.json({ fehler: "Unbekannter Endpunkt" }, { status: 404 });
    }

    return env.ASSETS.fetch(request);
  }
};
