alter table matches
add column if not exists status text not null default 'pending'
  check (status in ('pending', 'on_court', 'completed'));

update matches
set status = 'completed'
where winner_id is not null;