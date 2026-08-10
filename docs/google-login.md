# Google-Login einrichten

Damit ihr euch ohne eigenes Passwort anmelden könnt. Rechne mit 15 Minuten.
Das ist der fummeligste Teil der ganzen Einrichtung — danach nie wieder.

Diese Anleitung beschreibt die **neue Google Auth Platform**, also die Oberfläche mit der
Seitenleiste *Übersicht · Branding · Zielgruppe · Clients · Datenzugriff · Überprüfungscenter ·
Einstellungen*. Der alte Assistent „OAuth-Zustimmungsbildschirm“ mit den vier Schritten
existiert nicht mehr; stattdessen füllst du die Punkte einzeln aus, in beliebiger Reihenfolge.

**Kostet das etwas? Nein.** „Anmelden mit Google“ ist dauerhaft kostenlos — kein Kontingent,
keine Gebühr pro Anmeldung, kein Zahlungsmittel nötig. Kosten entstehen bei Google Cloud nur
für zusätzlich gebuchte Dienste wie Karten oder Übersetzung. Davon nutzen wir nichts.

**Es muss auch keine API aktiviert werden.** Anmeldung über Google braucht keinen Eintrag im
API-Katalog — falls dir irgendwo geraten wird, die „Google+ API“ oder „People API“
einzuschalten: veraltet, ignorieren.

---

## Bevor es losgeht: das richtige Projekt

Oben in der blauen Leiste, rechts neben „Google Cloud“, steht die Projektauswahl.
Dort muss **Haus-Quest** stehen. Wenn nicht: anklicken und wechseln.

Alles Folgende landet sonst in einem anderen Projekt, und du suchst dich später wund.
Das ist mit Abstand der häufigste Fehler.

Die Oberfläche erreichst du direkt über
[console.cloud.google.com/auth/overview](https://console.cloud.google.com/auth/overview)
oder über das Navigationsmenü (drei Striche links oben) → **APIs und Dienste** →
**OAuth-Zustimmungsbildschirm**, was auf dieselbe Seite führt.

## Was die Punkte in der Seitenleiste bedeuten

| Punkt | Wofür | Früher hieß das |
| --- | --- | --- |
| **Übersicht** | Statusanzeige, sonst nichts zu tun | — |
| **Branding** | Wie die App im Anmeldefenster erscheint: Name, Kontakt, Domain | Schritt 1 „App-Informationen“ |
| **Zielgruppe** | Wer sich anmelden darf: Nutzertyp, Testnutzer, Veröffentlichungsstatus | Schritt 1 „User Type“ + Schritt 4 „Testnutzer“ |
| **Datenzugriff** | Welche Daten die App abfragt | Schritt 2 „Bereiche“ |
| **Clients** | Der eigentliche Schlüssel samt erlaubter Adressen | „Anmeldedaten → OAuth-Client-ID“ |
| **Überprüfungscenter** | Anträge auf Google-Prüfung — brauchen wir nicht | — |
| **Einstellungen** | Projektname und Löschen | — |

Wir füllen vier davon aus: **Branding**, **Zielgruppe**, **Datenzugriff**, **Clients**.

---

## Schritt 1 — Branding

Das ist der Text, den ihr beim Anmelden seht: „Haus-Quest möchte auf dein Google-Konto
zugreifen“.

Seitenleiste → **Branding**

| Feld | Was eintragen |
| --- | --- |
| **App-Name** | `Haus-Quest` — genau dieser Text steht später im Anmeldefenster |
| **Nutzersupport-E-Mail** | Deine Adresse (Auswahlliste, dein Konto steht schon drin) |
| **App-Logo** | **Leer lassen.** Ein Logo löst eine Markenprüfung durch Google aus, die Tage dauern kann. Nachrüsten geht jederzeit — jetzt wäre es nur eine Bremse. |
| **Anwendungsstartseite** | `https://haus-quest.com` |
| **Datenschutzerklärung** | Leer lassen. Erst nötig, wenn ihr veröffentlicht oder verkauft. |
| **Nutzungsbedingungen** | Leer lassen |
| **Autorisierte Domains** | **+ Domain hinzufügen** → `haus-quest.com` (ohne `https://`, ohne Schrägstrich) |
| **Kontakt-E-Mail-Adressen** | Deine Adresse. Hierhin schreibt Google, falls es Probleme gibt. |

**Speichern.**

> Fehlt die autorisierte Domain, weist Google später die Weiterleitung ab. Die Startseite und
> die Weiterleitungs-URIs müssen unterhalb einer hier eingetragenen Domain liegen.

---

## Schritt 2 — Zielgruppe

Seitenleiste → **Zielgruppe**

**Nutzertyp**

| Auswahl | Bedeutung |
| --- | --- |
| **Intern** | Nur Google-Workspace-Konten derselben Firma. Bei privaten Konten meist gar nicht wählbar. |
| **Extern** ← **das nehmen wir** | Jedes Google-Konto — beschränkt auf die, die du als Testnutzer einträgst. |

**Veröffentlichungsstatus**

Steht auf **Testen** (englisch *Testing*). So lassen. Was das heißt:

- Nur eingetragene Testnutzer können sich anmelden — höchstens 100, ihr braucht 2.
- Beim ersten Anmelden zeigt Google einen Warnhinweis, dass die App nicht überprüft ist.
  Über **Erweitert** → **Weiter zu Haus-Quest (unsicher)** kommt ihr durch. Der Hinweis
  stimmt ja: Die App *ist* ungeprüft, weil sie privat ist. Er erscheint nur beim ersten Mal.
- Bekannte Eigenheit: Im Testmodus laufen Googles Sitzungsschlüssel nach sieben Tagen ab.
  **Für uns ohne Bedeutung** — wir benutzen Google nur für die Anmeldung selbst und führen
  danach eine eigene Sitzung. Ihr bleibt angemeldet, bis ihr euch abmeldet.

Die Schaltfläche **In Produktion veröffentlichen** brauchst du jetzt nicht. Erst bei einem
Verkauf. Weil wir nur Basisdaten abfragen (siehe Schritt 3), entfällt auch dann die aufwendige
Prüfung, und der Warnhinweis verschwindet.

**Testnutzer**

Weiter unten auf derselben Seite: **+ Nutzer hinzufügen** → **beide Google-Adressen**
eintragen, deine und die von Crusty. Genau die Adressen, mit denen ihr euch anmeldet.
**Speichern.**

> Wer hier fehlt, bekommt beim Anmeldeversuch:
> *„Zugriff blockiert: Haus-Quest hat den Google-Überprüfungsprozess nicht abgeschlossen.“*
> Kein Fehler, sondern genau der gewünschte Schutz — Fremde kommen nicht hinein.

---

## Schritt 3 — Datenzugriff

Hier legst du fest, was die App über euch erfährt: Name, E-Mail-Adresse, Profilbild. Sonst nichts.

Seitenleiste → **Datenzugriff** → **Bereiche hinzufügen oder entfernen**

Rechts öffnet sich eine Liste. Im Filterfeld nacheinander suchen und jeweils das Häkchen setzen:

| Suchbegriff | Bereich | Was er liefert |
| --- | --- | --- |
| `openid` | `openid` | Die Anmeldung selbst |
| `userinfo.email` | `.../auth/userinfo.email` | Die E-Mail-Adresse |
| `userinfo.profile` | `.../auth/userinfo.profile` | Name und Profilbild |

Dann **Aktualisieren** und unten **Speichern**.

Die drei stehen in der Tabelle unter **Nicht sensible Bereiche**. Genau deshalb braucht die App
keine Google-Prüfung. Würdest du hier Kalender-, Kontakt- oder Drive-Zugriff hinzufügen, wäre
das eine ganz andere Nummer: Prüfung, Fragebogen, unter Umständen ein kostenpflichtiges
Sicherheitsaudit. Lass die Liste bei diesen dreien.

---

## Schritt 4 — Clients

Jetzt der eigentliche Schlüssel. Google muss wissen, welche Adresse zu dieser App gehört.

Seitenleiste → **Clients** → **+ Client erstellen**

| Feld | Wert |
| --- | --- |
| **Anwendungstyp** | `Webanwendung` |
| **Name** | `Haus-Quest Web` — nur für deine Übersicht, sieht sonst niemand |

> **Nicht „Android“ wählen**, auch wenn die App auf Android landet. Die Anmeldung passiert im
> Browser, und das ist für Google eine Webanwendung. Der falsche Typ ist die zweithäufigste
> Falle hier — und man merkt es erst, wenn nichts geht.

**Autorisierte JavaScript-Quellen** → **+ URI hinzufügen**, jede Zeile einzeln:

```
https://haus-quest.com
```
```
http://localhost:8787
```

**Autorisierte Weiterleitungs-URIs** → **+ URI hinzufügen**, jede Zeile einzeln:

```
https://haus-quest.com/api/auth/callback
```
```
http://localhost:8787/api/auth/callback
```

**Erstellen.**

Achte penibel auf die Schreibweise: kein Schrägstrich am Ende, `https` bei der Domain,
`http` bei localhost, keine Leerzeichen. Weicht ein einziges Zeichen ab, meldet Google beim
Anmelden `redirect_uri_mismatch`.

Der localhost-Eintrag ist fürs Entwickeln. Ohne ihn kann ich die Anmeldung nicht testen,
bevor sie live geht.

Es erscheint ein Fenster mit **Client-ID** und **Client-Schlüssel**. Beides findest du später
jederzeit wieder unter **Clients** → auf den Client klicken. Du kannst also nichts verlieren.

---

## Schritt 5 — Schlüssel hinterlegen

| Wert | Erkennbar an | Wohin |
| --- | --- | --- |
| **Client-ID** | endet auf `.apps.googleusercontent.com` | Kannst du mir schicken. Die steht im Quelltext jeder Anmeldeseite und ist kein Geheimnis. |
| **Client-Schlüssel** | beginnt mit `GOCSPX-` | GitHub → Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. **Name:** `GOOGLE_CLIENT_SECRET`, **Secret:** der Schlüssel. Nicht in den Chat. |

---

## Wenn etwas klemmt

| Meldung | Ursache | Lösung |
| --- | --- | --- |
| `redirect_uri_mismatch` | Weiterleitungs-URI stimmt nicht zeichengenau | Schritt 4 prüfen: Tippfehler, Schrägstrich am Ende, `http` statt `https` |
| „Zugriff blockiert: … Überprüfungsprozess nicht abgeschlossen“ | Adresse fehlt bei den Testnutzern | Schritt 2 ergänzen |
| „Diese App ist nicht überprüft“ | Normal im Testmodus | **Erweitert** → **Weiter zu Haus-Quest** |
| `invalid_client` | Client-ID oder Schlüssel falsch übernommen | Unter **Clients** neu kopieren |
| „Fehler 400: invalid_request“ mit Hinweis auf die Domain | Autorisierte Domain fehlt im Branding | Schritt 1 ergänzen |
| Einstellungen sind verschwunden | Falsches Projekt ausgewählt | Oben in der Projektauswahl auf `Haus-Quest` wechseln |

Wenn eine Meldung auftaucht, die hier nicht steht: schick sie mir im Wortlaut, am besten mit
Bildschirmfoto. Googles Fehlertexte sind knapp, aber eindeutig — daran lässt sich immer
ablesen, welches Feld klemmt.
