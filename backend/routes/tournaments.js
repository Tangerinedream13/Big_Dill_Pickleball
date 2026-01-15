const express = require("express");
const router = express.Router();
const pool = require("../db");

function parseId(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? String(n) : null;
}

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

// ------------------ TOURNAMENTS ------------------

// GET /api/tournaments
router.get("/", async (req, res) => {
  try {
    const r = await pool.query(
      `
      select id, name
      from tournaments
      order by id desc;
      `
    );
    res.json(r.rows);
  } catch (err) {
    console.error("GET /api/tournaments error:", err);
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

// POST /api/tournaments
router.post("/", async (req, res) => {
  try {
    const name = (req.body?.name ?? "").toString().trim();
    if (!name) return res.status(400).json({ error: "Name is required." });

    const inserted = await pool.query(
      `
      insert into tournaments (name)
      values ($1)
      returning id, name;
      `,
      [name]
    );

    res.status(201).json(inserted.rows[0]);
  } catch (err) {
    console.error("POST /api/tournaments error:", err);
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

// ------------------ TOURNAMENT TEAMS ------------------

// GET /api/tournaments/:id/teams
router.get("/:id/teams", async (req, res) => {
  try {
    const tournamentId = parseId(req.params.id);
    if (!tournamentId) return res.status(400).json({ error: "Invalid tournament id." });

    const teams = await getTeamsForTournament(tournamentId);
    res.json({ tournamentId, teams });
  } catch (err) {
    console.error("GET /api/tournaments/:id/teams error:", err);
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

// POST /api/tournaments/:id/teams
// Body: { teamIds: [7, 8, 9] }
router.post("/:id/teams", async (req, res) => {
  try {
    const tournamentId = parseId(req.params.id);
    if (!tournamentId) return res.status(400).json({ error: "Invalid tournament id." });

    const teamIdsRaw = Array.isArray(req.body?.teamIds) ? req.body.teamIds : [];
    if (teamIdsRaw.length === 0) {
      return res.status(400).json({ error: "teamIds is required." });
    }

    const values = [];
    const params = [];
    let i = 1;

    for (const tid of teamIdsRaw) {
      const teamId = parseId(tid);
      if (!teamId) continue;

      values.push(`($${i++}, $${i++})`);
      params.push(tournamentId, teamId);
    }

    if (values.length === 0) {
      return res.status(400).json({ error: "No valid teamIds provided." });
    }

    await pool.query(
      `
      insert into tournament_teams (tournament_id, team_id)
      values ${values.join(", ")}
      on conflict do nothing;
      `,
      params
    );

    const teams = await getTeamsForTournament(tournamentId);
    res.status(201).json({ tournamentId, teams });
  } catch (err) {
    console.error("POST /api/tournaments/:id/teams error:", err);
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

// DELETE /api/tournaments/:id/teams/:teamId
router.delete("/:id/teams/:teamId", async (req, res) => {
  try {
    const tournamentId = parseId(req.params.id);
    const teamId = parseId(req.params.teamId);
    if (!tournamentId) return res.status(400).json({ error: "Invalid tournament id." });
    if (!teamId) return res.status(400).json({ error: "Invalid team id." });

    await pool.query(
      `delete from tournament_teams where tournament_id = $1 and team_id = $2;`,
      [tournamentId, teamId]
    );

    res.json({ ok: true, tournamentId, teamId });
  } catch (err) {
    console.error("DELETE /api/tournaments/:id/teams/:teamId error:", err);
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

module.exports = router;