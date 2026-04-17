alter table tournaments
add column if not exists is_public boolean not null default true,
add column if not exists show_player_names_public boolean not null default true,
add column if not exists show_dupr_public boolean not null default false,
add column if not exists use_aliases_public boolean not null default false;

alter table players
add column if not exists public_alias text;