// Benachrichtigungen an den Haushalt.
//
// Das Ereignis in der Datenbank ist das Verlässliche: es zeigt den Moment auch
// dann, wenn die Push-Nachricht nie ankam oder weggewischt wurde.

import { sendePush } from "./push.js";

const id = () => crypto.randomUUID();

export async function melde(env, paarId, empfaengerId, ereignis) {
  await env.DB.prepare(
    `insert into ereignisse (id, couple_id, user_id, art, titel, text, punkte)
     values (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
  ).bind(id(), paarId, empfaengerId, ereignis.art, ereignis.titel,
         ereignis.text || null, ereignis.punkte ?? null).run();

  await sendePush(env, empfaengerId, {
    titel: ereignis.titel,
    text: ereignis.text || "",
    url: "/app/",
    tag: ereignis.art
  });
}

/** Alle Mitglieder des Haushalts. */
export async function mitgliederVon(env, paarId) {
  const treffer = await env.DB.prepare("select user_id from members where couple_id = ?1").bind(paarId).all();
  return treffer.results.map((r) => r.user_id);
}

/** Dasselbe Ereignis an alle außer einer Person. Wer etwas meldet, muss nicht
 *  wissen, wer gerade Zeit hat — jeder darf bestätigen, also erfährt es jeder. */
export async function meldeAlle(env, paarId, ausserId, ereignis) {
  for (const wer of await mitgliederVon(env, paarId)) {
    if (wer !== ausserId) await melde(env, paarId, wer, ereignis);
  }
}
