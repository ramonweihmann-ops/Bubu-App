delete from raeume;
delete from proposal_votes;
delete from proposals;
delete from ereignisse;
delete from aktionen;
delete from claims;
delete from requests;
delete from transfers;
delete from ledger;
delete from quests;
delete from rewards;
delete from sessions;
delete from members;
delete from couples;
delete from users;

insert into users (id, email, name) values ('u-ramon', 'ramon@example.com', 'Ramon Weihmann');
insert into users (id, email, name) values ('u-crusty', 'crusty@example.com', 'Crusty Beispiel');

insert into couples (id, art, groesse, eingerichtet, startguthaben) values ('paar-1', 'paar', 2, 1, 1);
insert into members (user_id, couple_id, rolle) values ('u-ramon', 'paar-1', 'verwalter');
insert into members (user_id, couple_id, rolle) values ('u-crusty', 'paar-1', 'mitglied');

insert into quests (id, couple_id, name, category, points) values ('q-1', 'paar-1', 'Badezimmer putzen', 'Bad', 10);
insert into quests (id, couple_id, name, category, points) values ('q-2', 'paar-1', 'Staubsaugen', 'Wohnzimmer', 6);
insert into rewards (id, couple_id, name, cost) values ('b-1', 'paar-1', 'Massage', 50);
insert into rewards (id, couple_id, name, cost) values ('b-2', 'paar-1', 'Kinoabend', 30);

insert into sessions (token_hash, user_id, expires_at) values ('9c39b5d5c2fef0ac17d521dd6d99177c81fa6a93ee7a6084a818310409c85d8d', 'u-ramon', datetime('now','+30 days'));
insert into sessions (token_hash, user_id, expires_at) values ('fee2769944990417f19937eedb71488bbd2d0277beb03e383753151cf87911cf', 'u-crusty', datetime('now','+30 days'));

insert into raeume (id, couple_id, name, sortierung) values ('r-1', 'paar-1', 'Bad', 0);
insert into raeume (id, couple_id, name, sortierung) values ('r-2', 'paar-1', 'Wohnzimmer', 1);
insert into raeume (id, couple_id, name, sortierung) values ('r-3', 'paar-1', 'Küche', 2);
