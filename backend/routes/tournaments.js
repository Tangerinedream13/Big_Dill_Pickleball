// backend/routes/tournaments.js
const express = require("express");
const router = express.Router();
const pool = require("../db");

function errToMessage(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  return (
    err.message || err.detail || err.hint || err.code || JSON.stringify(err)
  );
}

function parseId(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/* ------------------ TOURNAMENTS ------------------ */

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
    res.status(500).json({ error: errToMessage(err) });
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
    res.status(500).json({ error: errToMessage(err) });
  }
});

// DELETE /api/tournaments/:id
// Deletes the tournament and tournament-scoped data.
// If tournament doesn't exist -> 404
// Otherwise deletes matches + joins, then tournament.
router.delete("/:id", async (req, res) => {
  const tournamentId = parseId(req.params.id);
  if (!tournamentId) {
    return res.status(400).json({ error: "Invalid tournament id." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Ensure tournament exists first so we can return a clean 404
    const exists = await client.query(
      `select id from tournaments where id = $1;`,
      [tournamentId]
    );
    if (exists.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.json({
        ok: true,
        deletedTournamentId: String(tournamentId),
        message: "Tournament already deleted.",
      });
    }

    // Delete matches first
    await client.query(`delete from matches where tournament_id = $1;`, [
      tournamentId,
    ]);

    // Get team IDs linked to this tournament
    const teamIdsRes = await client.query(
      `select team_id from tournament_teams where tournament_id = $1;`,
      [tournamentId]
    );
    const teamIds = teamIdsRes.rows.map((r) => r.team_id);

    // Remove tournament -> team links
    await client.query(
      `delete from tournament_teams where tournament_id = $1;`,
      [tournamentId]
    );

    // Remove team players + teams (if any exist)
    if (teamIds.length) {
      await client.query(
        `delete from team_players where team_id = any($1::int[]);`,
        [teamIds]
      );
      await client.query(`delete from teams where id = any($1::int[]);`, [
        teamIds,
      ]);
    }

    // Remove tournament player links
    await client.query(
      `delete from tournament_players where tournament_id = $1;`,
      [tournamentId]
    );

    // Delete the tournament row
    await client.query(`delete from tournaments where id = $1;`, [
      tournamentId,
    ]);

    await client.query("COMMIT");
    return res.json({ ok: true, deletedTournamentId: String(tournamentId) });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("DELETE /api/tournaments/:id error:", err);
    return res.status(500).json({ error: errToMessage(err) });
  } finally {
    client.release();
  }
});

/* ------------------ OPTION A: TOURNAMENT DOUBLES TEAMS ------------------ */
/**
 * Shape returned from GET must match PlayersPage.jsx:
 * [
 *   { id, name, players: [{id,name,email,duprRating}, ...] },
 *   ...
 * ]
 */

// GET /api/tournaments/:id/teams  (list doubles teams + members)
router.get("/:id/teams", async (req, res) => {
  const tournamentId = parseId(req.params.id);
  if (!tournamentId)
    return res.status(400).json({ error: "Invalid tournament id." });

  try {
    const r = await pool.query(
      `
      select
        t.id as id,
        t.name as name,
        coalesce(
          json_agg(
            json_build_object(
              'id', p.id,
              'name', p.name,
              'email', p.email,
              'duprRating', p.dupr_rating
            )
            order by p.id
          ) filter (where p.id is not null),
          '[]'::json
        ) as players
      from tournament_teams tt
      join teams t on t.id = tt.team_id
      left join team_players tp on tp.team_id = t.id
      left join players p on p.id = tp.player_id
      where tt.tournament_id = $1
      group by t.id, t.name
      order by t.id;
      `,
      [tournamentId]
    );

    res.json(r.rows);
  } catch (err) {
    console.error("GET /api/tournaments/:id/teams error:", err);
    res.status(500).json({ error: errToMessage(err) });
  }
});

// POST /api/tournaments/:id/teams  (create doubles team)
router.post("/:id/teams", async (req, res) => {
  const tournamentId = parseId(req.params.id);
  const playerAId = parseId(req.body?.playerAId);
  const playerBId = parseId(req.body?.playerBId);
  const requestedName = (req.body?.teamName ?? "").toString().trim();

  if (!tournamentId)
    return res.status(400).json({ error: "Invalid tournament id." });
  if (!playerAId || !playerBId)
    return res
      .status(400)
      .json({ error: "playerAId and playerBId are required." });
  if (playerAId === playerBId)
    return res.status(400).json({ error: "Pick two different players." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Guard: both players must be in this tournament
    const inTournament = await client.query(
      `
      select count(*)::int as c
      from tournament_players
      where tournament_id = $1
        and player_id in ($2, $3);
      `,
      [tournamentId, playerAId, playerBId]
    );

    if (inTournament.rows?.[0]?.c !== 2) {
      throw new Error("Both players must be signed up for this tournament.");
    }

    // Guard: neither player can already be on a team in this tournament
    const alreadyOnTeam = await client.query(
      `
      select tp.player_id
      from team_players tp
      join tournament_teams tt on tt.team_id = tp.team_id
      where tt.tournament_id = $1
        and tp.player_id in ($2, $3)
      limit 1;
      `,
      [tournamentId, playerAId, playerBId]
    );

    if (alreadyOnTeam.rowCount > 0) {
      throw new Error(
        "One of those players is already on a team in this tournament."
      );
    }

    // Auto-name if not provided
    let finalName = requestedName;
    if (!finalName) {
      const n = await client.query(
        `select count(*)::int as c from tournament_teams where tournament_id = $1;`,
        [tournamentId]
      );
      finalName = `T-${tournamentId}-Team-${(n.rows?.[0]?.c ?? 0) + 1}`;
    }

    // Create team
    const teamRow = await client.query(
      `insert into teams(name) values ($1) returning id, name;`,
      [finalName]
    );
    const teamId = teamRow.rows[0].id;

    // Link players to team
    await client.query(
      `insert into team_players(team_id, player_id) values ($1, $2), ($1, $3);`,
      [teamId, playerAId, playerBId]
    );

    // Add team to tournament
    await client.query(
      `insert into tournament_teams(tournament_id, team_id) values ($1, $2);`,
      [tournamentId, teamId]
    );

    await client.query("COMMIT");

    res.status(201).json({
      ok: true,
      tournamentId,
      team: { id: teamId, name: finalName },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("POST /api/tournaments/:id/teams error:", err);
    res.status(400).json({ error: errToMessage(err) });
  } finally {
    client.release();
  }
});

// DELETE /api/tournaments/:id/teams/:teamId
// Removes the team from THIS tournament and cleans up the team + team_players.
router.delete("/:id/teams/:teamId", async (req, res) => {
  const tournamentId = parseId(req.params.id);
  const teamId = parseId(req.params.teamId);
  if (!tournamentId)
    return res.status(400).json({ error: "Invalid tournament id." });
  if (!teamId) return res.status(400).json({ error: "Invalid team id." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Remove link to tournament
    await client.query(
      `delete from tournament_teams where tournament_id = $1 and team_id = $2;`,
      [tournamentId, teamId]
    );

    // Remove team players
    await client.query(`delete from team_players where team_id = $1;`, [
      teamId,
    ]);

    // Remove team (safe if teams are only used in one tournament)
    await client.query(`delete from teams where id = $1;`, [teamId]);

    await client.query("COMMIT");
    res.json({ ok: true, tournamentId, teamId });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("DELETE /api/tournaments/:id/teams/:teamId error:", err);
    res.status(500).json({ error: errToMessage(err) });
  } finally {
    client.release();
  }
});

module.exports = router;
