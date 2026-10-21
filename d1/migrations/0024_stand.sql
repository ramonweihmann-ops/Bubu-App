-- Ein Zähler je Haushalt, der bei jeder Änderung weiterspringt.
--
-- Die App fragt alle 25 Sekunden nach, ob sich etwas getan hat. Bisher lud sie
-- dafür jedes Mal den ganzen Zustand — im Mittel hunderte Zeilen, bei langem
-- Verlauf tausende. Jetzt fragt sie nur `couples.stand` ab (eine Zeile) und lädt
-- den Zustand bloß, wenn der Zähler weitergesprungen ist oder fünf Minuten um
-- sind. So bleibt Homi Point auch im Pilot im kostenlosen Rahmen von Cloudflare.
--
-- Den Zähler pflegen Trigger, nicht der Code: Jede Tabelle, die zum Zustand
-- eines Haushalts gehört, zählt beim Anlegen, Ändern und Löschen hoch. So kann
-- keine neue Stelle im Code vergessen, Bescheid zu sagen. Bilder fehlen mit
-- Absicht — sichtbar wird ein Bild erst, wenn eine Quest oder Belohnung es nennt.

alter table couples add column stand integer not null default 0;

create trigger stand_aktionen_neu after insert on aktionen begin
  update couples set stand = stand + 1 where id = new.couple_id;
end;

create trigger stand_aktionen_aendern after update on aktionen begin
  update couples set stand = stand + 1 where id in (old.couple_id, new.couple_id);
end;

create trigger stand_aktionen_weg after delete on aktionen begin
  update couples set stand = stand + 1 where id = old.couple_id;
end;

create trigger stand_bewerbungen_neu after insert on bewerbungen begin
  update couples set stand = stand + 1 where id = new.couple_id;
end;

create trigger stand_bewerbungen_aendern after update on bewerbungen begin
  update couples set stand = stand + 1 where id in (old.couple_id, new.couple_id);
end;

create trigger stand_bewerbungen_weg after delete on bewerbungen begin
  update couples set stand = stand + 1 where id = old.couple_id;
end;

create trigger stand_claims_neu after insert on claims begin
  update couples set stand = stand + 1 where id = new.couple_id;
end;

create trigger stand_claims_aendern after update on claims begin
  update couples set stand = stand + 1 where id in (old.couple_id, new.couple_id);
end;

create trigger stand_claims_weg after delete on claims begin
  update couples set stand = stand + 1 where id = old.couple_id;
end;

create trigger stand_ereignisse_neu after insert on ereignisse begin
  update couples set stand = stand + 1 where id = new.couple_id;
end;

create trigger stand_ereignisse_aendern after update on ereignisse begin
  update couples set stand = stand + 1 where id in (old.couple_id, new.couple_id);
end;

create trigger stand_ereignisse_weg after delete on ereignisse begin
  update couples set stand = stand + 1 where id = old.couple_id;
end;

create trigger stand_events_neu after insert on events begin
  update couples set stand = stand + 1 where id = new.couple_id;
end;

create trigger stand_events_aendern after update on events begin
  update couples set stand = stand + 1 where id in (old.couple_id, new.couple_id);
end;

create trigger stand_events_weg after delete on events begin
  update couples set stand = stand + 1 where id = old.couple_id;
end;

create trigger stand_jubel_gifs_neu after insert on jubel_gifs begin
  update couples set stand = stand + 1 where id = new.couple_id;
end;

create trigger stand_jubel_gifs_aendern after update on jubel_gifs begin
  update couples set stand = stand + 1 where id in (old.couple_id, new.couple_id);
end;

create trigger stand_jubel_gifs_weg after delete on jubel_gifs begin
  update couples set stand = stand + 1 where id = old.couple_id;
end;

create trigger stand_kindcodes_neu after insert on kindcodes begin
  update couples set stand = stand + 1 where id = new.couple_id;
end;

create trigger stand_kindcodes_aendern after update on kindcodes begin
  update couples set stand = stand + 1 where id in (old.couple_id, new.couple_id);
end;

create trigger stand_kindcodes_weg after delete on kindcodes begin
  update couples set stand = stand + 1 where id = old.couple_id;
end;

create trigger stand_ledger_neu after insert on ledger begin
  update couples set stand = stand + 1 where id = new.couple_id;
end;

create trigger stand_ledger_aendern after update on ledger begin
  update couples set stand = stand + 1 where id in (old.couple_id, new.couple_id);
end;

create trigger stand_ledger_weg after delete on ledger begin
  update couples set stand = stand + 1 where id = old.couple_id;
end;

create trigger stand_members_neu after insert on members begin
  update couples set stand = stand + 1 where id = new.couple_id;
end;

create trigger stand_members_aendern after update on members begin
  update couples set stand = stand + 1 where id in (old.couple_id, new.couple_id);
end;

create trigger stand_members_weg after delete on members begin
  update couples set stand = stand + 1 where id = old.couple_id;
end;

create trigger stand_proposals_neu after insert on proposals begin
  update couples set stand = stand + 1 where id = new.couple_id;
end;

create trigger stand_proposals_aendern after update on proposals begin
  update couples set stand = stand + 1 where id in (old.couple_id, new.couple_id);
end;

create trigger stand_proposals_weg after delete on proposals begin
  update couples set stand = stand + 1 where id = old.couple_id;
end;

create trigger stand_quests_neu after insert on quests begin
  update couples set stand = stand + 1 where id = new.couple_id;
end;

create trigger stand_quests_aendern after update on quests begin
  update couples set stand = stand + 1 where id in (old.couple_id, new.couple_id);
end;

create trigger stand_quests_weg after delete on quests begin
  update couples set stand = stand + 1 where id = old.couple_id;
end;

create trigger stand_raeume_neu after insert on raeume begin
  update couples set stand = stand + 1 where id = new.couple_id;
end;

create trigger stand_raeume_aendern after update on raeume begin
  update couples set stand = stand + 1 where id in (old.couple_id, new.couple_id);
end;

create trigger stand_raeume_weg after delete on raeume begin
  update couples set stand = stand + 1 where id = old.couple_id;
end;

create trigger stand_requests_neu after insert on requests begin
  update couples set stand = stand + 1 where id = new.couple_id;
end;

create trigger stand_requests_aendern after update on requests begin
  update couples set stand = stand + 1 where id in (old.couple_id, new.couple_id);
end;

create trigger stand_requests_weg after delete on requests begin
  update couples set stand = stand + 1 where id = old.couple_id;
end;

create trigger stand_rewards_neu after insert on rewards begin
  update couples set stand = stand + 1 where id = new.couple_id;
end;

create trigger stand_rewards_aendern after update on rewards begin
  update couples set stand = stand + 1 where id in (old.couple_id, new.couple_id);
end;

create trigger stand_rewards_weg after delete on rewards begin
  update couples set stand = stand + 1 where id = old.couple_id;
end;

create trigger stand_transfers_neu after insert on transfers begin
  update couples set stand = stand + 1 where id = new.couple_id;
end;

create trigger stand_transfers_aendern after update on transfers begin
  update couples set stand = stand + 1 where id in (old.couple_id, new.couple_id);
end;

create trigger stand_transfers_weg after delete on transfers begin
  update couples set stand = stand + 1 where id = old.couple_id;
end;

create trigger stand_urlaube_neu after insert on urlaube begin
  update couples set stand = stand + 1 where id = new.couple_id;
end;

create trigger stand_urlaube_aendern after update on urlaube begin
  update couples set stand = stand + 1 where id in (old.couple_id, new.couple_id);
end;

create trigger stand_urlaube_weg after delete on urlaube begin
  update couples set stand = stand + 1 where id = old.couple_id;
end;

-- Der Haushalt selbst (Einstellungen, Plus, Soll …) — außer wenn nur der Zähler springt.
create trigger stand_couples_aendern after update on couples when new.stand = old.stand begin
  update couples set stand = stand + 1 where id = new.id;
end;

-- Name oder Bild einer Person: in ihrem Haushalt.
create trigger stand_users_aendern after update on users begin
  update couples set stand = stand + 1 where id in (select couple_id from members where user_id = new.id);
end;

-- Stimmen hängen über den Vorschlag am Haushalt.
create trigger stand_stimmen_neu after insert on proposal_votes begin
  update couples set stand = stand + 1 where id = (select couple_id from proposals where id = new.proposal_id);
end;

create trigger stand_stimmen_aendern after update on proposal_votes begin
  update couples set stand = stand + 1 where id = (select couple_id from proposals where id = new.proposal_id);
end;

create trigger stand_stimmen_weg after delete on proposal_votes begin
  update couples set stand = stand + 1 where id = (select couple_id from proposals where id = old.proposal_id);
end;
