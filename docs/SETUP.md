# Einrichtung

Was du klickst, was ich baue. Am Ende läuft die App unter deiner eigenen Domain,
lässt sich von dort auf beide Handys installieren, und die laufenden Kosten sind
der Preis der Domain — sonst nichts.

**Inhalt**

1. [Wie das Ganze zusammenhängt](#1-wie-das-ganze-zusammenhängt)
2. [Warum nicht Supabase](#2-warum-nicht-supabase)
3. [Domain kaufen](#3-domain-kaufen)
4. [Cloudflare einrichten](#4-cloudflare-einrichten)
5. [Google-Login einrichten](#5-google-login-einrichten)
6. [Was ich übernehme](#6-was-ich-übernehme)
7. [Was es kostet](#7-was-es-kostet)
8. [Was du mir schickst](#8-was-du-mir-schickst)
9. [Anhang: Supabase-Variante](#anhang-supabase-variante)

---

## 1. Wie das Ganze zusammenhängt

Alles unter einem Dach — die Domain, bei Cloudflare:

| Baustein | Aufgabe | Kosten |
| --- | --- | --- |
| **Domain** | Die Adresse. Gehört dir, bleibt bei einem Verkauf erhalten. | ~5–15 €/Jahr |
| **Cloudflare Pages** | Liefert Website und App ans Handy. | 0 € |
| **Cloudflare Workers** | Die API: prüft, wer fragt, und setzt die Regeln durch. | 0 € |
| **Cloudflare D1** | Die Datenbank: Quests, Meldungen, Punkte. | 0 € |

Die App ist eine **Web-App zum Anheften** (PWA): über den Browser installiert, danach ein
Symbol auf dem Startbildschirm — eigenes Fenster, keine Adressleiste, Push-Benachrichtigungen.
Auf Android von einer Store-App praktisch nicht zu unterscheiden.

Drei Vorteile, die zu deinen Vorgaben passen:

- **Kein Store nötig**, keine Gebühr, keine Prüfung, keine Datei zum Verschicken.
- **Updates sofort bei euch beiden** — ich pushe, ihr habt es beim nächsten Öffnen.
- **Später verkaufbar**: Dieselbe App lässt sich mit Bubblewrap in eine APK für den Play Store
  verpacken, ohne den Code neu zu schreiben. Der Weg dorthin bleibt offen, ohne dass wir ihn
  jetzt gehen müssen.

**Wo gerechnet und gespeichert wird:** in der Datenbank, nicht auf dem Handy. Punktestände
werden nicht abgelegt, sondern aus allen Buchungen **berechnet**. Die Regeln stecken in der
Datenbank selbst: Wer eine eigene Meldung bestätigen will, bekommt einen Fehler — nicht weil
die Oberfläche den Knopf versteckt, sondern weil die Datenbank es abweist. Das Handy schickt
nur „ich habe X erledigt“; ob daraus Punkte werden, entscheidet der Server.

**Die Website** unter deiner Domain ist bewusst winzig: Logo, ein Satz, ein Knopf
„App installieren“. Mehr braucht sie nicht.

```
haus-quest.com          →  Seite mit dem Installationsknopf
haus-quest.com/app      →  die App selbst
haus-quest.com/api/…    →  die Regeln (Worker) + Datenbank (D1)
```

---

## 2. Warum nicht Supabase

Supabase erlaubt im kostenlosen Rahmen **zwei aktive Projekte pro Konto** — die sind bei dir
mit Stage und Prod des Webportals belegt. Damit bleiben vier Möglichkeiten:

| Weg | Bewertung |
| --- | --- |
| **Cloudflare D1 + Workers** ← so machen wir es | Kein Projektlimit, kein Pausieren, kein zusätzliches Konto, keine Kreditkarte. Alles beim selben Anbieter wie Domain und Website. |
| Zweites Supabase-Konto | Ginge, ist aber ein weiteres Login und laut Supabase-Bedingungen eine Grauzone. |
| Webportal-Stage pausieren | Pausierte Projekte zählen nicht mit, es würde also ein Platz frei. Aber Stage wäre dann jedes Mal erst nach einem Klick und etwa einer Minute Wartezeit benutzbar. |
| Supabase Pro | 25 US-Dollar im Monat. Für zwei Personen und ein paar Tausend Buchungen absurd. |

Der kostenlose Rahmen bei Cloudflare, gemessen an eurem Bedarf:

| Grenze | Kostenlos | Euer Bedarf |
| --- | --- | --- |
| Datenbankspeicher | 5 GB | Ein paar Tausend Buchungen sind wenige MB |
| Gelesene Zeilen | 5 Mio./Tag | Ein paar Hundert |
| Geschriebene Zeilen | 100.000/Tag | Ein paar Dutzend |
| API-Aufrufe | 100.000/Tag | Ein paar Hundert |
| Datenverkehr Website | unbegrenzt | — |

Ihr kratzt an keiner dieser Grenzen, auch nicht in zehn Jahren. Und anders als bei Supabase
schläft nichts ein, wenn ihr eine Woche nicht hinschaut.

Was ich dafür selbst baue statt es fertig zu bekommen: die Anmeldung über Google und die
Zugriffsprüfung. Das ist meine Arbeit, nicht deine — für dich bedeutet dieser Weg sogar
**weniger** Klicks als Supabase.

---

## 3. Domain kaufen

Eine Domain, zwei Zwecke: eure Adresse jetzt, ein fertiger Markenname später.
Deshalb ein Rat: **nimm einen Namen, der auch ohne euch funktioniert.** „Bubu“ ist euer
Kosename — für einen Verkauf ist ein neutraler Name mehr wert, und ihr könnt die App im
Alltag trotzdem Bubu App nennen.

| Richtung | Beispiele | Gedanke dahinter |
| --- | --- | --- |
| Beschreibend | `punktepaar.de`, `paarpunkte.de`, `questpaar.de` | Sofort verständlich, gut für einen späteren Verkauf |
| Spielerisch | `questduo.de`, `hausquest.de`, `putzquest.de` | Näher am Reinigungsquest-Ursprung |
| Euer Name | `bubuapp.de`, `bubu-app.de` | Am persönlichsten, für einen Verkauf am schwächsten |

**Wo kaufen:** Am einfachsten direkt beim [Cloudflare Registrar](https://dash.cloudflare.com) —
dort werden Domains ohne Aufschlag zum Einkaufspreis verkauft (etwa 10–12 € im Jahr für
`.com` oder `.app`), und weil Hosting und Datenbank ohnehin dort liegen, entfällt jede
DNS-Fummelei. `.de` gibt es bei Cloudflare nicht; dafür sind [INWX](https://www.inwx.de) oder
[Netcup](https://www.netcup.de) günstig (5–8 € im Jahr), die Domain wird dann per Nameserver
zu Cloudflare gezeigt — auch kein Hexenwerk, nur ein Schritt mehr.

`.app` hat einen netten Nebeneffekt: Bei dieser Endung ist Verschlüsselung technisch erzwungen,
die Adresse funktioniert also nie versehentlich unverschlüsselt.

Was du **nicht** brauchst: Webspace, E-Mail-Postfach, SSL-Zertifikat, Homepage-Baukasten.
Nur die Domain.

---

## 4. Cloudflare einrichten

Rechne mit 5 Minuten.

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Sign up**. Kostenlos, **ohne
   Kreditkarte** — es sei denn, du kaufst die Domain gleich dort mit.
2. Domain hinzufügen:
   - **Bei Cloudflare gekauft:** nichts weiter zu tun.
   - **Woanders gekauft:** **Add a site** → Domain eintragen → Plan **Free** → Cloudflare zeigt
     dir zwei Nameserver an. Die trägst du beim Registrar (INWX/Netcup) unter „Nameserver“ ein.
     Danach dauert es zwischen zehn Minuten und ein paar Stunden, bis es greift.
3. Mehr nicht. Datenbank, API und Website richte ich ein — das läuft über Konfiguration im
   Repo, nicht über Klicks im Dashboard.

Damit Änderungen automatisch live gehen, braucht GitHub einmalig einen Schlüssel für dein
Cloudflare-Konto. **Ich bekomme ihn nie zu sehen** — er liegt als Repository-Secret, und die
Veröffentlichung übernimmt GitHub, nicht ich.

### 4.1 Datenbank anlegen ✓ erledigt

Angelegt über **Storage & Databases** → **D1 SQL Database** → **Create Database**, Name
`haus-quest`. Die Database ID steht bereits in der `wrangler.toml`, ebenso die Account ID —
dafür brauchst du kein Secret.

### 4.2 Schlüssel für die automatische Veröffentlichung

1. Cloudflare → **My Profile** → **API Tokens** → **Create Token**
2. Vorlage **Edit Cloudflare Workers** → **Use template**
3. Die Vorlage bringt das Meiste mit. Ergänze in der Liste **Permissions**:

   | Bereich | Recht |
   | --- | --- |
   | Account · Workers Scripts | Edit |
   | Account · Workers KV Storage | Edit |
   | Account · D1 | Edit |
   | Account · Account Settings | Read |
   | Zone · Workers Routes | Edit |
   | User · User Details | Read |
   | User · Memberships | Read |

4. **Account Resources:** `Include` → dein Konto auswählen
5. **Zone Resources:** `Include` → `Specific zone` → `haus-quest.com` auswählen
6. **Continue to summary** → **Create Token** → Wert **einmal kopieren**
7. Auf GitHub hinterlegen: Repo → **Settings** → **Secrets and variables** → **Actions** →
   **New repository secret**
   - **Name:** `CLOUDFLARE_API_TOKEN`
   - **Secret:** der kopierte Wert

Die beiden Auswahllisten in Schritt 4 und 5 sind die übliche Stolperstelle: Bleiben sie leer,
kann das Token zwar den Kontonamen lesen, aber nichts veröffentlichen. Die Fehlermeldung
lautet dann `Authentication error [code: 10000]` — sie klingt nach falschem Schlüssel, meint
aber fehlende Rechte.

Ab da gilt: Ich pushe, GitHub veröffentlicht, wenige Sekunden später ist es live.
Den Zugang entziehst du jederzeit, indem du das Token bei Cloudflare löschst.

### 4.3 Schema einspielen

Sobald das Token liegt, einmalig: Repo → **Actions** → **Datenbank aufsetzen** →
**Run workflow** → Auswahl `schema`. Danach stehen alle Tabellen und Regeln.
Die Startdaten aus eurer Tabelle kommen beim Pairing automatisch dazu; der Lauf mit
`seed` ist nur für den Fall, dass die Liste von Hand nachgezogen werden soll.

---

## 5. Google-Login einrichten

Der fummeligste Teil der Einrichtung — danach nie wieder. Plane 15 Minuten ein.
Google nennt die Dinge an drei Stellen unterschiedlich, deshalb hier jeder Klick einzeln.

**Was am Ende passieren soll:** Ihr tippt in der App auf „Mit Google anmelden“, seht das
bekannte Google-Fenster mit eurem Konto, tippt drauf — und seid drin. Kein Passwort, keine
Registrierung, kein Bestätigungsmail.

**Kostet das etwas? Nein.** „Anmelden mit Google“ ist dauerhaft kostenlos, ohne Kontingent und
ohne Gebühr pro Anmeldung. Ein Google-Cloud-Projekt anzulegen kostet ebenfalls nichts, und ein
Zahlungsmittel wird dafür nicht verlangt. Kosten entstehen bei Google Cloud nur, wenn man
zusätzliche Dienste bucht (Karten, Übersetzung, Speicher) — davon nutzen wir nichts.

---

### 5.1 Projekt anlegen

Ein „Projekt“ ist bei Google nur eine Schublade für Einstellungen. Es hat nichts mit Servern
oder Kosten zu tun.

1. [console.cloud.google.com](https://console.cloud.google.com/) öffnen und mit dem
   Google-Konto anmelden, dem die App gehören soll (sinnvollerweise deins).
2. Beim allerersten Besuch fragt Google nach Land und Nutzungsbedingungen — bestätigen.
3. Oben in der blauen Leiste, direkt rechts neben „Google Cloud“, ist die **Projektauswahl**
   (steht „Projekt auswählen“ oder ein Projektname). Anklicken.
4. Im Fenster oben rechts auf **Neues Projekt**.
5. Ausfüllen:
   - **Projektname:** `Haus-Quest`
   - **Speicherort / Organisation:** „Keine Organisation“ stehen lassen
6. **Erstellen**, ein paar Sekunden warten.
7. **Wichtig:** Nach dem Anlegen oben in der Projektauswahl prüfen, dass wirklich
   `Haus-Quest` ausgewählt ist und nicht ein anderes Projekt. Alles Folgende landet sonst
   an der falschen Stelle — der häufigste Fehler in dieser Anleitung.

---

### 5.2 Zustimmungsbildschirm

Das ist das Fenster, das ihr beim Anmelden seht: „Haus-Quest möchte auf dein Google-Konto
zugreifen“. Google will vorher wissen, wer dahintersteckt und was die App abfragt.

Zu finden über das **Navigationsmenü** (drei waagerechte Striche, ganz links oben) →
**APIs und Dienste** → **OAuth-Zustimmungsbildschirm**. Je nachdem, wie neu die Oberfläche
in deinem Konto ist, heißt der Punkt auch **Google Auth Platform** → **Branding**.

**Schritt 1 — Zielgruppe (User Type)**

Zwei Auswahlmöglichkeiten:

| Auswahl | Bedeutung |
| --- | --- |
| **Intern** | Nur für Google-Workspace-Konten derselben Firma. Steht bei privaten Konten meist gar nicht zur Wahl. |
| **Extern** ← **das nehmen wir** | Jedes Google-Konto kann sich anmelden — beschränkt auf die, die du als Testnutzer einträgst. |

**Extern** auswählen → **Erstellen**.

**Schritt 2 — App-Informationen**

| Feld | Was eintragen | Warum |
| --- | --- | --- |
| **App-Name** | `Haus-Quest` | Genau dieser Text steht später im Anmeldefenster. Änderbar, aber jede Änderung kann eine erneute Prüfung auslösen — nimm gleich den endgültigen Namen. |
| **Support-E-Mail für Nutzer** | Deine Adresse (Auswahlliste) | Wird im Anmeldefenster als Kontakt angezeigt. |
| **App-Logo** | Kannst du leer lassen | Ein Logo ist hübsch, löst aber eine Markenprüfung durch Google aus, die Tage dauert. **Lass es zunächst weg** — nachrüsten geht jederzeit. |
| **Startseite der App** | `https://haus-quest.com` | Optional, aber sinnvoll. |
| **Datenschutzerklärung** | leer lassen | Erst nötig, wenn ihr die App veröffentlicht oder verkauft. |
| **Nutzungsbedingungen** | leer lassen | Dito. |
| **Autorisierte Domains** | `haus-quest.com` (über **+ Domain hinzufügen**) | Ohne diesen Eintrag verweigert Google später die Weiterleitung. |
| **Kontakt-E-Mail des Entwicklers** | Deine Adresse | Hierhin schreibt Google, falls es Probleme gibt. |

**Speichern und fortfahren.**

**Schritt 3 — Bereiche (Scopes)**

„Bereiche“ ist Googles Wort für: Worauf darf die App zugreifen? Hier **nichts hinzufügen** und
einfach **Speichern und fortfahren** klicken.

Der Grund: Die drei Angaben, die wir brauchen — Name, E-Mail-Adresse und Profilbild — gelten
bei Google als Basisdaten (`openid`, `email`, `profile`) und werden automatisch mitgegeben.
Sie zählen ausdrücklich **nicht** als „sensibel“ oder „eingeschränkt“. Genau deshalb braucht
die App keine aufwendige Google-Überprüfung. Würdest du hier etwa Kalender- oder
Kontaktzugriff hinzufügen, sähe das ganz anders aus.

**Schritt 4 — Testnutzer**

**+ Nutzer hinzufügen** und **beide Google-Adressen** eintragen — deine und die von Crusty.
Genau die Adressen, mit denen ihr euch später anmeldet.

> Wer hier nicht eingetragen ist, bekommt beim Anmeldeversuch die Meldung
> „Zugriff blockiert: Haus-Quest hat den Google-Überprüfungsprozess nicht abgeschlossen“.
> Das ist kein Fehler, sondern genau der gewünschte Schutz: Fremde kommen nicht hinein.

**Speichern und fortfahren** → **Zurück zum Dashboard**.

**Zum Status „Testing“**

Die App steht jetzt auf **Testing**. Was das bedeutet:

- Nur eingetragene Testnutzer können sich anmelden (maximal 100 — ihr braucht 2).
- Beim ersten Anmelden zeigt Google einen Warnhinweis, dass die App nicht überprüft ist.
  Über **Erweitert** → **Weiter zu Haus-Quest (unsicher)** kommt ihr durch. Der Hinweis ist
  richtig — die App *ist* ungeprüft, weil sie privat ist — und er erscheint nur beim ersten Mal.
- Es gibt eine bekannte Eigenheit: Im Testmodus laufen Googles Sitzungsschlüssel nach sieben
  Tagen ab. **Für uns spielt das keine Rolle**, weil wir Google nur für die Anmeldung selbst
  benutzen und danach eine eigene Sitzung führen. Ihr bleibt angemeldet, bis ihr euch abmeldet.

Bei einem späteren Verkauf stellst du auf **In Produktion** um. Weil wir nur Basisdaten
abfragen, entfällt dann die aufwendige Prüfung; der Warnhinweis verschwindet.

---

### 5.3 Zugangsdaten erzeugen

Jetzt der eigentliche Schlüssel — Google muss wissen, welche Adresse zu dieser App gehört.

1. **APIs und Dienste** → **Anmeldedaten**
2. Oben **+ Anmeldedaten erstellen** → **OAuth-Client-ID**
3. **Anwendungstyp:** `Webanwendung`
   (nicht „Android“ — auch wenn die App auf Android landet. Die Anmeldung passiert im Browser,
   und für Google ist das eine Webanwendung. Der falsche Typ ist der zweithäufigste Fehler hier.)
4. **Name:** `Haus-Quest Web` — nur für deine Übersicht, sieht sonst niemand.
5. **Autorisierte JavaScript-Quellen** → **+ URI hinzufügen**, einzeln:
   ```
   https://haus-quest.com
   ```
   ```
   http://localhost:8787
   ```
6. **Autorisierte Weiterleitungs-URIs** → **+ URI hinzufügen**, einzeln:
   ```
   https://haus-quest.com/api/auth/callback
   ```
   ```
   http://localhost:8787/api/auth/callback
   ```
7. **Erstellen**

Achte penibel auf die Schreibweise: kein Schrägstrich am Ende, `https` bei der Domain und
`http` bei localhost, keine Leerzeichen. Weicht auch nur ein Zeichen ab, meldet Google beim
Anmelden `redirect_uri_mismatch`. Der localhost-Eintrag ist fürs Entwickeln — ohne ihn kann
ich die Anmeldung nicht testen, bevor sie live geht.

Es erscheint ein Fenster mit **Client-ID** und **Client-Schlüssel**. Beides lässt sich später
unter **Anmeldedaten** wieder aufrufen, du kannst also nichts verlieren.

---

### 5.4 Schlüssel hinterlegen

| Wert | Wohin |
| --- | --- |
| **Client-ID** (endet auf `.apps.googleusercontent.com`) | Kannst du mir schicken — die steht ohnehin im Quelltext jeder Anmeldeseite und ist kein Geheimnis. |
| **Client-Schlüssel** (beginnt mit `GOCSPX-`) | GitHub → Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. **Name:** `GOOGLE_CLIENT_SECRET`, **Secret:** der Schlüssel. Nicht in den Chat. |

---

### 5.5 Wenn etwas klemmt

| Meldung | Ursache | Lösung |
| --- | --- | --- |
| `redirect_uri_mismatch` | Die Weiterleitungs-URI stimmt nicht zeichengenau | Eintrag in 5.3 Schritt 6 prüfen — Tippfehler, Schrägstrich am Ende, `http` statt `https` |
| „Zugriff blockiert: … Überprüfungsprozess nicht abgeschlossen“ | Die Adresse ist nicht als Testnutzer eingetragen | In 5.2 Schritt 4 ergänzen |
| „Diese App ist nicht überprüft“ | Normal im Testmodus | **Erweitert** → **Weiter zu Haus-Quest** |
| `invalid_client` | Client-ID oder Schlüssel falsch übernommen | Beides unter **Anmeldedaten** neu kopieren |
| Einstellungen sind verschwunden | Falsches Projekt ausgewählt | Oben in der Projektauswahl auf `Haus-Quest` wechseln |

---

## 6. Was ich übernehme

Alles Übrige — hier nur, damit du weißt, was passiert:

| Schritt | Was dabei entsteht |
| --- | --- |
| Datenbank anlegen | `wrangler d1 create bubu`, danach [`d1/schema.sql`](../d1/schema.sql) einspielen: Tabellen, Regeln, Startdaten aus eurer Tabelle |
| API bauen | Ein Worker unter `haus-quest.com/api` — Anmeldung, Pairing, Melden, Bestätigen, Anträge, Abstimmungen |
| App bauen | Die Oberfläche genau nach dem Mockup, als installierbare Web-App |
| Push einrichten | Web Push mit VAPID-Schlüsseln, ausgelöst vom Worker, sobald jemand bestätigt oder genehmigt. Kein Firebase, keine Kosten |
| Veröffentlichen | Cloudflare Pages an dieses Repo koppeln: Push → wenige Sekunden später live |
| Sicherung | Schaltfläche „Alles exportieren“ in der App, die den kompletten Stand als Datei herunterlädt |

---

## 7. Was es kostet

| Posten | Laufend | Einmalig |
| --- | --- | --- |
| Domain | ~5–12 € / Jahr | — |
| Cloudflare Pages, Workers, D1 | 0 € | — |
| Push-Benachrichtigungen | 0 € | — |
| Google-Login | 0 € | — |
| **Summe** | **~5–12 € / Jahr** | **0 €** |

Optional, erst falls ihr wirklich in den Play Store wollt: einmalig 25 US-Dollar für das
Google-Entwicklerkonto. Für den privaten Betrieb nicht nötig.

---

## 8. Was du mir schickst

1. **Deine Domain**
2. **Google Client-ID** (Abschnitt 5.3)
3. Bescheid, dass **`CLOUDFLARE_API_TOKEN`** und **`GOOGLE_CLIENT_SECRET`** als
   GitHub-Secrets hinterlegt sind

Nicht schicken: Client-Schlüssel, API-Token, Passwörter. Die gehören in die Secrets, nicht in
den Chat. Ich habe keine E-Mail-Adresse und kein eigenes Konto — alles läuft über deine
Konten und die Secrets in diesem Repo.

Danach baue ich die App. Zum Schluss öffnet ihr die Domain auf euren Handys, tippt auf
**App installieren**, meldet euch mit Google an, einer erzeugt den Pairing-Code, der andere
gibt ihn ein — und ihr könnt loslegen.

---

## Anhang: Supabase-Variante

Falls doch ein Platz frei wird (Stage pausieren oder Pro-Plan), liegt das fertige
Postgres-Schema weiterhin unter [`supabase/schema.sql`](../supabase/schema.sql) bereit.
Kurzfassung der Einrichtung:

1. **Neues Projekt** anlegen, Region *Central EU (Frankfurt)*, Plan *Free*.
   Das Datenbank-Passwort sofort in den Passwortmanager.
2. **Project Settings → API**: *Project URL* und *`anon` `public` Key* notieren.
   Der `service_role`-Schlüssel bleibt geheim und gehört nie in die App.
3. **SQL Editor → New query**: `supabase/schema.sql` einfügen und ausführen.
   Erwartete Antwort: *Success. No rows returned.*
4. **Storage → New bucket** `belege`, *Public: aus*.
5. **Authentication → Providers → Google** aktivieren, Client-ID und Schlüssel eintragen
   (Weiterleitungs-URI dann `https://DEIN-PROJEKT.supabase.co/auth/v1/callback`).
   **Email-Provider ausschalten.**
6. **Authentication → URL Configuration**: Site URL und Redirect URLs auf die Domain.

Zu beachten: kostenlose Projekte pausieren nach sieben Tagen ohne Zugriff und werden per Klick
wieder geweckt; automatische Sicherungen gibt es im Free-Tier nicht.
