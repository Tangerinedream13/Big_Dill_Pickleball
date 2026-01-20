// backend/routes/teams.js
const express = require("express");
const pool = require("../db");

const router = express.Router();

/* -----------------------------
   Tournament helpers
------------------------------ */

function parseTournamentId(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

async function getDefaultTournamentId() {
  const r = await pool.query(
    "select id from tournaments order by id desc limit 1;"
  );
  if (r.rowCount === 0)
    throw new Error("No tournaments found. Seed one first.");
  return r.rows[0].id;
}

async function resolveTournamentId(req) {
  const fromQuery = parseTournamentId(req.query?.tournamentId);
  const fromBody = parseTournamentId(req.body?.tournamentId);
  return fromQuery || fromBody || (await getDefaultTournamentId());
}

/* -----------------------------
   Name helper (avoid unique constraint collisions)
   - If you keep teams.name unique globally, this prevents crashes.
   - If you DROP the teams_name_key constraint, this still works fine.
------------------------------ */

async function makeUniqueTeamName(baseName) {
  const trimmed = (baseName ?? "").toString().trim();
  const safeBase = trimmed || "Team";

  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? safeBase : `${safeBase} (${i + 1})`;
    const exists = await pool.query(
      `select 1 from teams where name = $1 limit 1;`,
      [candidate]
    );
    if (exists.rowCount === 0) return candidate;
  }

  return `${safeBase} (${Date.now()})`;
}

/* -----------------------------
   GET /api/teams?tournamentId=...
   Returns: [{ id, name, seed, players: [{id,name,duprRating}] }]
------------------------------ */

router.get("/", async (req, res) => {
  try {
    const tournamentId = await resolveTournamentId(req);

    const tRes = await pool.query(
      `
      select
        teams.id,
        teams.name,
        coalesce(tt.seed, 999999) as seed
      from tournament_teams tt
      join teams on teams.id = tt.team_id
      where tt.tournament_id = $1
      order by seed asc, teams.id asc;
      `,
      [tournamentId]
    );

    if (tRes.rowCount === 0) {
      return res.json([]);
    }

    const teamIds = tRes.rows.map((t) => t.id);

    const pRes = await pool.query(
      `
      select
        tp.team_id,
        p.id as player_id,
        p.name as player_name,
        p.dupr_rating as dupr_rating
      from team_players tp
      join players p on p.id = tp.player_id
      where tp.team_id = any($1::bigint[])
      order by tp.team_id asc, p.name asc;
      `,
      [teamIds]
    );

    const playersByTeam = new Map();
    for (const row of pRes.rows) {
      const key = String(row.team_id);
      if (!playersByTeam.has(key)) playersByTeam.set(key, []);
      playersByTeam.get(key).push({
        id: row.player_id,
        name: row.player_name,
        duprRating: row.dupr_rating,
      });
    }

    const out = tRes.rows.map((t) => ({
      id: t.id,
      name: t.name,
      seed: t.seed,
      players: playersByTeam.get(String(t.id)) ?? [],
    }));

    res.json(out);
  } catch (err) {
    console.error("GET /api/teams error:", err);
    res.status(500).json({ error: err.message || "Failed to load teams." });
  }
});

/* -----------------------------
   POST /api/teams
   Body: { tournamentId?, playerAId, playerBId, name? }
   Creates:
     - teams row
     - team_players (2 rows)
     - tournament_teams link
------------------------------ */

router.post("/", async (req, res) => {
  try {
    const tournamentId = await resolveTournamentId(req);
    const playerAId = Number(req.body?.playerAId);
    const playerBId = Number(req.body?.playerBId);

    if (!Number.isInteger(playerAId) || !Number.isInteger(playerBId)) {
      return res
        .status(400)
        .json({ error: "playerAId and playerBId must be integers." });
    }
    if (playerAId === playerBId) {
      return res.status(400).json({ error: "Pick two different players." });
    }

    // Make sure both players are in THIS tournament
    const inTournament = await pool.query(
      `
      select player_id
      from tournament_players
      where tournament_id = $1 and player_id = any($2::bigint[]);
      `,
      [tournamentId, [playerAId, playerBId]]
    );

    if (inTournament.rowCount !== 2) {
      return res.status(400).json({
        error: "Both players must be signed up for this tournament.",
      });
    }

    // Prevent duplicate team (same pair, any order) within this tournament
    const dup = await pool.query(
      `
      select tp1.team_id
      from team_players tp1
      join team_players tp2 on tp2.team_id = tp1.team_id
      join tournament_teams tt on tt.team_id = tp1.team_id
      where tt.tournament_id = $1
        and tp1.player_id = $2
        and tp2.player_id = $3
      limit 1;
      `,
      [tournamentId, playerAId, playerBId]
    );

    const dupReverse = await pool.query(
      `
      select tp1.team_id
      from team_players tp1
      join team_players tp2 on tp2.team_id = tp1.team_id
      join tournament_teams tt on tt.team_id = tp1.team_id
      where tt.tournament_id = $1
        and tp1.player_id = $2
        and tp2.player_id = $3
      limit 1;
      `,
      [tournamentId, playerBId, playerAId]
    );

    if (dup.rowCount > 0 || dupReverse.rowCount > 0) {
      return res.status(409).json({ error: "That team already exists." });
    }

    // Default team name if not provided
    const pNames = await pool.query(
      `select id, name from players where id = any($1::bigint[])`,
      [[playerAId, playerBId]]
    );
    const nameMap = new Map(pNames.rows.map((r) => [String(r.id), r.name]));

    const defaultName = `${nameMap.get(String(playerAId)) ?? "Player A"} / ${
      nameMap.get(String(playerBId)) ?? "Player B"
    }`;

    const rawName = (req.body?.name ?? "").toString().trim() || defaultName;

    // ✅ guarantees no "teams_name_key" crash (even if you forgot to drop it)
    const teamName = await makeUniqueTeamName(rawName);

    await pool.query("begin");
    try {
      // create team
      const teamIns = await pool.query(
        `insert into teams (name) values ($1) returning id, name;`,
        [teamName]
      );
      const teamId = teamIns.rows[0].id;

      // link players to team
      await pool.query(
        `insert into team_players (team_id, player_id) values ($1,$2), ($1,$3);`,
        [teamId, playerAId, playerBId]
      );

      // link team to tournament (seed null for now)
      await pool.query(
        `insert into tournament_teams (tournament_id, team_id) values ($1, $2);`,
        [tournamentId, teamId]
      );

      await pool.query("commit");

      res.status(201).json({
        id: teamId,
        name: teamIns.rows[0].name,
        seed: null,
        tournamentId,
        players: [
          { id: playerAId, name: nameMap.get(String(playerAId)) ?? "" },
          { id: playerBId, name: nameMap.get(String(playerBId)) ?? "" },
        ],
      });
    } catch (e) {
      await pool.query("rollback");
      throw e;
    }
  } catch (err) {
    console.error("POST /api/teams error:", err);

    // Friendly error for unique constraint collisions, just in case
    if (err && err.code === "23505") {
      return res.status(409).json({ error: "Team name already exists." });
    }

    res.status(500).json({ error: err.message || "Failed to create team." });
  }
});

/* -----------------------------
   DELETE /api/teams/:teamId?tournamentId=...
   Behavior:
     - If the team is referenced by matches.team_a_id / team_b_id / winner_id,
       deletion will fail with a 409 unless you reset/delete those matches first.
   What we delete:
     1) tournament_teams link (CASCADE to matches uses tournament_id, but matches FK to teams is RESTRICT)
     2) team_players rows
     3) teams row
------------------------------ */

router.delete("/:teamId", async (req, res) => {
  const teamId = Number(req.params.teamId);

  try {
    if (!Number.isInteger(teamId) || teamId <= 0) {
      return res.status(400).json({ error: "Invalid team id." });
    }

    const tournamentId = await resolveTournamentId(req);

    // Make sure this team belongs to this tournament
    const belongs = await pool.query(
      `
      select 1
      from tournament_teams
      where tournament_id = $1 and team_id = $2
      limit 1;
      `,
      [tournamentId, teamId]
    );

    if (belongs.rowCount === 0) {
      return res
        .status(404)
        .json({ error: "Team not found for this tournament." });
    }

    // If matches reference this team, deletion will violate FK constraints
    const usedInMatches = await pool.query(
      `
      select 1
      from matches
      where tournament_id = $1
        and (team_a_id = $2 or team_b_id = $2 or winner_id = $2)
      limit 1;
      `,
      [tournamentId, teamId]
    );

    if (usedInMatches.rowCount > 0) {
      return res.status(409).json({
        error:
          "This team is used in matches. Reset/delete matches for this tournament before deleting the team.",
      });
    }

    await pool.query("begin");
    try {
      await pool.query(
        `delete from tournament_teams where tournament_id = $1 and team_id = $2;`,
        [tournamentId, teamId]
      );

      await pool.query(`delete from team_players where team_id = $1;`, [
        teamId,
      ]);

      await pool.query(`delete from teams where id = $1;`, [teamId]);

      await pool.query("commit");
    } catch (e) {
      await pool.query("rollback");
      throw e;
    }

    res.json({ ok: true, teamId, tournamentId });
  } catch (err) {
    console.error("DELETE /api/teams/:teamId error:", err);

    // FK violation
    if (err && err.code === "23503") {
      return res.status(409).json({
        error:
          "Could not delete team due to related records (matches). Reset/delete matches first.",
      });
    }

    res.status(500).json({ error: err.message || "Failed to delete team." });
  }
});

module.exports = router;
