const express = require("express");
const router = express.Router();
const pool = require("../db");

/**
 * Parse a tournament id from query/body.
 * Returns a string id or null.
 */
function parseTournamentId(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) return null;
  return String(n);
}

/**
 * Your existing logic: teams attached to a tournament live in tournament_teams.
 */
async function getTeamsForTournament(tournamentId) {
  const r = await pool.query(
    `
    select teams.id, teams.name
    from tournament_teams tt
    join teams on teams.id = tt.team_id
    where tt.tournament_id = $1
    order by coalesce(tt.seed, 999999), teams.id;
    `,
    [tournamentId]
  );
  return r.rows;
}

/**
 * GET /api/teams
 * List all teams in the system (catalog).
 */
router.get("/", async (req, res) => {
  try {
    const r = await pool.query(
      `
      select id, name
      from teams
      order by name asc;
      `
    );
    res.json(r.rows);
  } catch (err) {
    console.error("GET /api/teams error:", err);
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

/**
 * POST /api/teams
 * Create a team in the system (not attached to any tournament yet).
 * Body: { "name": "Aubrey & Olivia" }
 */
router.post("/", async (req, res) => {
  try {
    const name = (req.body?.name ?? "").toString().trim();
    if (!name) return res.status(400).json({ error: "Name is required." });

    const inserted = await pool.query(
      `
      insert into teams (name)
      values ($1)
      returning id, name;
      `,
      [name]
    );

    res.status(201).json(inserted.rows[0]);
  } catch (err) {
    console.error("POST /api/teams error:", err);
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

/**
 * GET /api/teams/for-tournament?tournamentId=6
 * Convenience endpoint: returns teams attached to a tournament.
 * (Useful for UI pickers without going through /api/tournaments/:id/teams yet.)
 */
router.get("/for-tournament", async (req, res) => {
  try {
    const tournamentId = parseTournamentId(req.query?.tournamentId);
    if (!tournamentId) {
      return res.status(400).json({ error: "tournamentId is required." });
    }

    const teams = await getTeamsForTournament(tournamentId);
    res.json({ tournamentId, teams });
  } catch (err) {
    console.error("GET /api/teams/for-tournament error:", err);
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

module.exports = router;