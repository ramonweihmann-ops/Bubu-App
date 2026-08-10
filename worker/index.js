// Haus-Quest – ein Worker liefert die Seite und die Schnittstelle.

import { handleAuth } from "./auth.js";
import { handleApi } from "./api.js";

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
  }
};
