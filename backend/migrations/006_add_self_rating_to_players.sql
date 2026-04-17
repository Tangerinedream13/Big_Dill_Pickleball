alter table players
add column if not exists self_rating text;

alter table players
add column if not exists skill_source text
  check (skill_source in ('dupr', 'self_rating', 'unknown'));

  update players
set skill_source = case
  when dupr_rating is not null then 'dupr'
  else 'unknown'
end
where skill_source is null;