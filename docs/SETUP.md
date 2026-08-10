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

Damit ihr euch ohne eigenes Passwort anmelden könnt.

Google hat die Oberfläche auf die **Google Auth Platform** umgestellt — Seitenleiste mit
*Branding · Zielgruppe · Clients · Datenzugriff*. Weil das ausführlich erklärt gehört, steht
es in einer eigenen Anleitung:

**→ [Google-Login einrichten](./google-login.md)** — jeder Klick einzeln, mit Fehlertabelle.

Kurzfassung dessen, was dabei herauskommt:

| Was | Wert |
| --- | --- |
| App-Name | `Haus-Quest` |
| Autorisierte Domain | `haus-quest.com` |
| Nutzertyp | Extern, Status *Testen*, eure zwei Adressen als Testnutzer |
| Bereiche | `openid`, `userinfo.email`, `userinfo.profile` — alle nicht sensibel |
| Client-Typ | Webanwendung |
| JavaScript-Quellen | `https://haus-quest.com`, `http://localhost:8787` |
| Weiterleitungs-URIs | `https://haus-quest.com/api/auth/callback`, `http://localhost:8787/api/auth/callback` |

Die **Client-ID** schickst du mir, den **Client-Schlüssel** legst du als GitHub-Secret
`GOOGLE_CLIENT_SECRET` ab. Kosten: keine, dauerhaft.

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
