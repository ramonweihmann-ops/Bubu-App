# Haus-Quest

Punktekonto für zwei. Aufgaben („Quests“) haben einen **vorher festgelegten** Punktwert.
Wer eine erledigt, meldet sie — gutgeschrieben wird sie erst, wenn **der andere bestätigt**.
Punktwerte ändern sich nie im Alleingang, sondern nur über eine **Abstimmung**, der beide zustimmen.

Grundlage ist die Reinigungsquest-Tabelle (22 Quests, 11 Belohnungen, zwei Konten).

Eigenes Projekt mit eigener Datenbasis — bewusst getrennt von allen anderen Projekten.

- **Mockup:** [`docs/mockup.html`](./docs/mockup.html) — im Browser öffnen, der Prototyp oben ist antippbar.
- **Mockup „Erster Start":** [`web/mockup/`](./web/mockup) — live unter `haus-quest.com/mockup/`.
  Einrichtung vom Namen bis zum fertigen Haushalt. Noch nichts davon ist gebaut.
- **Einrichtung:** [`docs/SETUP.md`](./docs/SETUP.md) — Schritt für Schritt, was zu klicken ist.
- **Google-Login:** [`docs/google-login.md`](./docs/google-login.md) — die neue Google Auth Platform, Klick für Klick.
- **Geplant:** [`docs/naechste-schritte.md`](./docs/naechste-schritte.md) — Dashboard mit Prognose, Rabatte, doppelte Punkte.
- **Datenbank:** [`d1/migrations/`](./d1/migrations) — Tabellen und Regeln, als Migrationen.

---

## Die drei Regeln

| Regel | Bedeutung |
| --- | --- |
| Preis steht vorher | Beim Melden wird der aktuelle Punktwert eingefroren. Spätere Änderungen wirken nie rückwirkend. |
| Vier Augen | Melden darf jeder, freigeben nur der andere. Ohne Bestätigung keine Punkte. |
| Nur gemeinsam | Punktwert ändern, Quest oder Belohnung anlegen **oder löschen**: nur mit Zustimmung von beiden. Ein Nein lässt alles beim Alten. |

Die Übernahme selbst — neuer Punktwert, neuer Eintrag, Löschung, Aktion — passiert in derselben
Transaktion wie das Schließen der Abstimmung: entweder beides oder nichts. Sollte eine Abstimmung
doch einmal mit zwei Ja-Stimmen offen stehen bleiben, zieht die App sie beim nächsten Laden nach.

Die zweite Regel ist keine Frage der Oberfläche, sondern der Datenbank: Wer eine eigene Meldung
bestätigen will, bekommt einen Fehler — nicht weil ein Knopf versteckt ist, sondern weil die
Datenbank es abweist (CHECK in der Tabelle und Prüfung in `worker/api.js`). Punktestände werden nirgends
gespeichert, sondern aus allen Buchungen berechnet.

## Aufbau

```
haus-quest.com          →  Seite mit dem Installationsknopf
haus-quest.com/app      →  die App (Web-App zum Anheften, PWA)
haus-quest.com/api/…    →  Worker: prüft, wer fragt, und setzt die Regeln durch
                            D1: Quests, Meldungen, Buchungen
```

| Baustein | Technik | Kosten |
| --- | --- | --- |
| Website + App | Cloudflare Workers (statische Dateien) | 0 € |
| API und Regeln | derselbe Worker unter `/api` | 0 € |
| Datenbank | Cloudflare D1 (SQLite) | 0 € |
| Anmeldung | Google OAuth, Sitzung im Worker | 0 € |
| Benachrichtigungen | Web Push (VAPID), Schlüsselpaar erzeugt sich selbst | 0 € |
| Domain | beliebiger Registrar | ~5–12 €/Jahr |

Warum nicht Supabase: Der kostenlose Rahmen erlaubt zwei aktive Projekte pro Konto, und die
sind hier bereits belegt. Das fertige Postgres-Schema liegt für den Fall der Fälle unter
[`supabase/schema.sql`](./supabase/schema.sql) bereit — Details im
[Anhang der Einrichtung](./docs/SETUP.md#anhang-supabase-variante).

## Anmeldung

Google Sign-In — kein eigenes Passwort, keine Registrierung. Übernommen werden Name, E-Mail
und Profilbild. Wer den Namen in den Einstellungen ändert, behält ihn: die nächste Anmeldung
lässt ihn dann in Ruhe.

Danach das **Pairing**: Der erste erzeugt einen sechsstelligen Code, der zweite gibt ihn ein.
Der Code ist einmal einlösbar und verfällt nach 24 Stunden. Ein Konto kann in genau einem Paar
sein, ein Paar besteht aus genau zwei Personen — beides erzwingt die Datenbank.

## Trennung von anderen Projekten

| Ebene | Trennung |
| --- | --- |
| Repository | Eigenes Repo, eigener Verlauf, eigene Releases. |
| Datenbank | Eigene D1-Instanz, ausschließlich für diese App. Kein geteiltes Schema, keine geteilten Tabellen. |
| Nutzerkonten | Eigene Sitzungsverwaltung. Eine Anmeldung anderswo gilt hier nicht und umgekehrt. |
| Schlüssel | Eigene Secrets in diesem Repo. Kein Schlüssel wandert zwischen Projekten. |
| Hosting | Eigenes Cloudflare-Projekt unter eigener Domain. |

## Wie die App aufs Handy kommt

Über die Domain: Seite öffnen, **App installieren** antippen, fertig. Danach liegt sie als
Symbol auf dem Startbildschirm, mit eigenem Fenster und Push-Benachrichtigungen — auf Android
kaum von einer Store-App zu unterscheiden. Kein Store, keine Gebühr, keine Installationsdatei
zum Verschicken, und Updates sind sofort bei beiden.

Falls es später doch in den Play Store soll: Dieselbe App lässt sich mit Bubblewrap in eine APK
verpacken, ohne den Code neu zu schreiben. Das Google-Entwicklerkonto kostet einmalig 25 US-Dollar.

## Figuren und Namen

Fuchs und Wolf liegen als Bilddateien in `web/` (`logo.webp`, `fox.webp`, `wolf.webp`) und
in `docs/assets/`. Sie können bleiben oder in einem Zug getauscht werden.
Der Name **Haus-Quest** ist beschreibend und übersteht einen Verkauf; privat heißt die App
weiterhin Bubu App.

## Listen bedienen

Quests und Belohnungen haben oben ein Suchfeld (Groß- und Kleinschreibung sowie Umlaute egal),
darunter Sortierung nach **meist genutzt**, **Punkten** oder **Alphabet** — die aktive
Sortierung kehrt beim erneuten Tippen ihre Richtung um. Bei den Quests bleibt darunter der
Filter nach Kategorie.

Jeder Eintrag hat einen **Stift**, der ein Menü mit *Ändern* und *Löschen* öffnet. Beides geht
weiterhin nur über die Abstimmung. Zwei getrennte Symbole je Zeile wären auf dem Handy zu
kleine Ziele, und Löschen soll nicht direkt neben dem Melden liegen.

## Einstellungen

Das Zahnrad steht oben neben dem Verlauf, auf **Start** und auf **Wir**. Darunter liegen:

| Einstellung | Reicht wie weit |
| --- | --- |
| **Anzeigename** | Gilt für beide — der Name steht auch in der App des anderen. Ändern darf ihn jeder für sich allein, das ist keine Sache für eine Abstimmung. |
| **Dunkles Design** | Nur dieses Gerät. *System* folgt der Handy-Einstellung und wechselt mit ihr, *Hell* und *Dunkel* setzen sich darüber. |
| **Benachrichtigungen** | Nur dieses Gerät. Zeigt auch, wenn der Browser sie blockiert — dann hilft nur dessen Berechtigungsdialog. |

Der dunkle Satz ist dieselbe Marke mit getauschten Rollen: Navy als Grund, Weiß als Schrift.
Das Rot bleibt, wird aber für Schrift aufgehellt und für gefüllte Knöpfe vertieft — sonst
trägt weißer Text darauf nicht. Die Wahl liegt im Speicher des Browsers, nicht in der
Datenbank, und wird schon im Kopf der Seite gesetzt, damit beim Öffnen kein Weiß aufblitzt.

Die Fußleiste steht fest am unteren Rand: sie bleibt sichtbar, egal wie lang eine Liste ist.
Auf Unterseiten — Verlauf, Auswertung, Einstellungen — leuchtet weiter der Reiter, aus dem sie
hervorgehen, damit die Leiste nie erloschen wirkt.

## Auswertung

Punkte je Tag der letzten zwei Wochen als Balken, beide Personen nebeneinander, dazu
Hochrechnungen auf Woche und Monat aus dem Schnitt der letzten sieben Tage. Gezählt wird nur,
was durch **bestätigte Quests** hereinkam — Übertragungen und Einlösungen sind Bewegungen,
kein Verdienst.

Der Tag beginnt dort, wo die Person wohnt: die App schickt ihren Zeitversatz mit, damit eine
Meldung um 23 Uhr nicht auf den Folgetag rutscht.

## Aktionen

Befristete Zeiträume, die nur gemeinsam starten — über dieselbe Abstimmung wie alles andere:

- **Doppelte Punkte** auf Quests, wahlweise für alle oder nur für einen Raum
  („+100 % auf Küche, diese Woche“)
- **Rabatt** auf Belohnungen, in Prozent

Der Faktor greift beim **Melden** bzw. beim **Stellen des Antrags** — dort friert der Wert ein.
Wer während der Aktion meldet, behält den erhöhten Wert, auch wenn erst danach bestätigt wird;
wer vorher gemeldet hat, bekommt nichts nachträglich. Damit bleibt die Grundregel unangetastet:
der Preis steht fest, bevor gearbeitet wird — und niemand hat einen Grund, Meldungen
zurückzuhalten.

## Benachrichtigungen

Jede Entscheidung erreicht die andere Person auf zwei Wegen:

- **Push aufs Handy**, auch bei geschlossener App. Das Schlüsselpaar (VAPID) erzeugt der Worker
  beim ersten Versand selbst und legt es in der Datenbank ab — es ist nichts von Hand zu hinterlegen.
- **Ein gemerktes Ereignis** in der Datenbank. Beim nächsten Öffnen zeigt die App den
  Vollbild-Moment nach — auch wenn die Push-Nachricht nie ankam oder weggewischt wurde.

Der Vollbild-Moment erscheint dadurch bei **beiden**: beim Prüfenden sofort nach dem Tippen,
beim Melder, sobald er die App das nächste Mal öffnet. Zustimmung feiert mit Konfetti und
hochzählenden Punkten, eine Ablehnung wird ruhig gezeigt.

## Aufbau des Codes

```
web/            Startseite mit Installationsknopf, Symbole, Service Worker
web/app/        Die App selbst (index.html, app.css, app.js) — ohne Bauschritt
worker/         Schnittstelle: index.js (Router), auth.js (Google), api.js (Regeln),
                push.js (Benachrichtigungen)
d1/migrations/  Datenbank: Tabellen, Ansichten, Änderungsschritte
docs/           Mockup und Anleitungen
```
