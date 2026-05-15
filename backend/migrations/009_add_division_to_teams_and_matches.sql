alter table teams
add column if not exists division text;

alter table tournament_teams
add column if not exists division text;

alter table matches
add column if not exists division text;