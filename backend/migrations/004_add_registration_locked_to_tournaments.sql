alter table tournaments
add column if not exists registration_locked boolean not null default false;