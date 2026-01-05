-- 001_tournaments_matches.sql
-- Big Dill Pickleball: tournaments + teams + matches persistence

begin;

-- 1) tournaments
create table if not exists tournaments (
  id bigserial primary key,
  name text not null,
  location text,
  start_date date,
  games_per_team int not null default 4 check (games_per_team >= 1),
  created_at timestamptz not null default now()
);

-- 2) teams (doubles teams)
create table if not exists teams (
  id bigserial primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

-- 3) tournament_teams (which teams are in a tournament)
create table if not exists tournament_teams (
  tournament_id bigint not null references tournaments(id) on delete cascade,
  team_id bigint not null references teams(id) on delete restrict,
  seed int,
  created_at timestamptz not null default now(),
  primary key (tournament_id, team_id),
  unique (tournament_id, seed)
);

create index if not exists idx_tournament_teams_tournament on tournament_teams(tournament_id);

-- 4) matches (RR + playoffs)
create table if not exists matches (
  id bigserial primary key,
  tournament_id bigint not null references tournaments(id) on delete cascade,

  -- human-friendly identifier for bracket wiring: RR-1, SF1, FINAL, THIRD
  code text not null,

  -- RR, SF, FINAL, THIRD (keep it simple)
  phase text not null check (phase in ('RR', 'SF', 'FINAL', 'THIRD')),

  team_a_id bigint not null references teams(id) on delete restrict,
  team_b_id bigint not null references teams(id) on delete restrict,

  score_a int check (score_a >= 0),
  score_b int check (score_b >= 0),
  winner_id bigint references teams(id) on delete restrict,

  created_at timestamptz not null default now(),

  unique (tournament_id, code),
  check (team_a_id <> team_b_id),
  check (
    (score_a is null and score_b is null and winner_id is null)
    or
    (score_a is not null and score_b is not null and winner_id is not null and score_a <> score_b)
  )
);

create index if not exists idx_matches_tournament_phase on matches(tournament_id, phase);
create index if not exists idx_matches_tournament on matches(tournament_id);

commit;