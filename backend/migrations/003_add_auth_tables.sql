create table if not exists users (
  id bigserial primary key,
  email text not null unique,
  email_lower text generated always as (lower(email)) stored,
  password_hash text not null,
  role text not null default 'participant'
    check (role in ('participant', 'admin')),
  created_at timestamptz not null default now()
);

alter table players
add column if not exists user_id bigint references users(id) on delete set null;

create unique index if not exists users_email_lower_idx
on users (email_lower);