# Homi Point für Android

Die Android-App öffnet haus-quest.com/app in Chrome ohne Adresszeile (Trusted Web Activity).
Erzeugt mit Bubblewrap aus `twa-manifest.json`; alles andere hier ist daraus generiert.

Bauen (JDK 17 und Android-SDK, Pfade in `~/.bubblewrap/config.json`):

    cp /pfad/zum/upload-schluessel.jks ./upload-schluessel.jks
    npx @bubblewrap/cli@1.27.0 update --skipVersionUpgrade
    BUBBLEWRAP_KEYSTORE_PASSWORD=… BUBBLEWRAP_KEY_PASSWORD=… npx @bubblewrap/cli@1.27.0 build --skipPwaValidation

Ergebnis: `app-release-bundle.aab` — das lädt man in der Play Console hoch. Vor jedem neuen Paket
`appVersionCode` in `twa-manifest.json` um eins erhöhen. Der Schlüssel und das Passwort kommen nie ins Repo.
Mehr im Haupt-README unter „Android-App“.
