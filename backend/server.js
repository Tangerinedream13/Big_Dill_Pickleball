// backend/server.js
console.log("TOP OF SERVER.JS");

require("dotenv").config();
console.log("✅ after dotenv");

const express = require("express");
console.log("✅ after express");

const pool = require("./db");
console.log("✅ after db");

const engine = require("./tournamentEngine");
console.log("✅ after engine");

const path = require("path");
const fs = require("fs");

const app = express();

// ✅ Railway-friendly port (Railway sets PORT)
const PORT = process.env.PORT || 3001;

app.use(express.json());
console.log("✅ server.js loaded, routes about to be registered");

// ------------------ PROCESS ERROR LOGGING ------------------
process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED PROMISE REJECTION:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

// ------------------ HEALTH ------------------
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// ------------------ HELPERS (DB) ------------------
async function getDefaultTournamentId() {
  const r = await pool.query("select id from tournaments order by id asc limit 1;");
  if (r.rowCount === 0) throw new Error("No tournaments found. Seed one first.");
  return r.rows[0].id;
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

async function getMatchesForTournamentByPhase(tournamentId, phases) {
  const r = await pool.query(
    `
    select
      code,
      phase,
      team_a_id as "teamAId",
      team_b_id as "teamBId",
      score_a as "scoreA",
      score_b as "scoreB",
      winner_id as "winnerId"
    from matches
    where tournament_id = $1
      and phase = any($2::text[])
    order by
      case
        when code like 'RR-%' then 1
        when code like 'SF%' then 2
        when code = 'FINAL' then 3
        when code = 'THIRD' then 4
        else 9
      end,
      code;
    `,
    [tournamentId, phases]
  );

  return r.rows.map((m) => ({
    id: m.code, // engine expects `id`
    phase: m.phase,
    teamAId: m.teamAId,
    teamBId: m.teamBId,
    scoreA: m.scoreA,
    scoreB: m.scoreB,
    winnerId: m.winnerId,
  }));
}

// ------------------ PLAYERS HELPERS ------------------
function parseDupr(v) {
  if (v === null || v === undefined || v === "") return null;
  const num = Number(v);
  if (!Number.isFinite(num)) return NaN;
  return Math.round(num * 100) / 100;
}

function duprLabel(dupr) {
  if (dupr === null || dupr === undefined) return "Unrated";
  if (dupr >= 5.0) return "Elite (5.0+)";
  if (dupr >= 4.0) return "Advanced (4.0–4.99)";
  if (dupr >= 3.0) return "Intermediate (3.0–3.99)";
  return "Beginner (2.0–2.99)";
}

// If players.tournament_id does not exist, Postgres throws 42703 (undefined_column).
async function queryPlayersScoped(sqlWithTournament, paramsWithTournament, sqlWithoutTournament, paramsWithoutTournament) {
  try {
    return await pool.query(sqlWithTournament, paramsWithTournament);
  } catch (err) {
    if (err && err.code === "42703") {
      return await pool.query(sqlWithoutTournament, paramsWithoutTournament);
    }
    throw err;
  }
}

// ------------------ API ROUTES ------------------

// Test message route
app.get("/api/message", (req, res) => {
  res.json({ text: "Hello from the Big Dill Pickleball backend!" });
});

// ------------------ TOURNAMENTS (DB-BACKED) ------------------

// GET /api/tournaments
app.get("/api/tournaments", async (req, res) => {
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
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tournaments
app.post("/api/tournaments", async (req, res) => {
  try {
    const name = (req.body.name ?? "").toString().trim();
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
    res.status(500).json({ error: err.message });
  }
});

// ------------------ TOURNAMENT STATE (DB-BACKED) ------------------
app.get("/api/tournament/state", async (req, res) => {
  try {
    const tournamentId = await getDefaultTournamentId();

    const teams = await getTeamsForTournament(tournamentId);
    const rrMatches = await getMatchesForTournamentByPhase(tournamentId, ["RR"]);
    const semis = await getMatchesForTournamentByPhase(tournamentId, ["SF"]);
    const finals = await getMatchesForTournamentByPhase(tournamentId, ["FINAL", "THIRD"]);

    const standings = engine.computeStandings(teams.map((t) => t.id), rrMatches);

    res.json({ teams, rrMatches, standings, semis, finals, tournamentId });
  } catch (err) {
    console.error("State error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Reset tournament matches
app.post("/api/tournament/reset", async (req, res) => {
  try {
    const tournamentId = await getDefaultTournamentId();
    await pool.query(`delete from matches where tournament_id = $1;`, [tournamentId]);
    res.json({ ok: true, tournamentId });
  } catch (err) {
    console.error("Reset error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------ ROUND ROBIN ------------------
app.post("/api/roundrobin/generate", async (req, res) => {
  try {
    const tournamentId = await getDefaultTournamentId();
    const teams = await getTeamsForTournament(tournamentId);

    const gamesPerTeamRaw = req.body?.gamesPerTeam;
    const gamesPerTeam = Number.isFinite(Number(gamesPerTeamRaw)) ? Number(gamesPerTeamRaw) : 4;

    const rrMatches = engine.generateRoundRobinSchedule(teams, gamesPerTeam);

    await pool.query(`delete from matches where tournament_id = $1 and phase = 'RR';`, [tournamentId]);
    await pool.query(`delete from matches where tournament_id = $1 and phase in ('SF','FINAL','THIRD');`, [tournamentId]);

    if (rrMatches.length > 0) {
      const params = [];
      const chunks = [];
      let i = 1;

      for (const m of rrMatches) {
        chunks.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++})`);
        params.push(tournamentId, m.id, "RR", m.teamAId, m.teamBId);
      }

      await pool.query(
        `
        insert into matches (tournament_id, code, phase, team_a_id, team_b_id)
        values ${chunks.join(", ")}
        `,
        params
      );
    }

    res.json({ teams, matches: rrMatches, tournamentId });
  } catch (err) {
    console.error("RR generate error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/roundrobin/matches/:id/score", async (req, res) => {
  const { id } = req.params;
  const { scoreA, scoreB } = req.body;

  try {
    const tournamentId = await getDefaultTournamentId();

    if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB)) {
      return res.status(400).json({ error: "Scores must be integers." });
    }
    if (scoreA === scoreB) {
      return res.status(400).json({ error: "Ties not supported." });
    }

    const matchRes = await pool.query(
      `
      select code, team_a_id as "teamAId", team_b_id as "teamBId"
      from matches
      where tournament_id = $1 and code = $2 and phase = 'RR'
      `,
      [tournamentId, id]
    );

    if (matchRes.rowCount === 0) {
      return res.status(404).json({ error: `RR match not found: ${id}` });
    }

    const matchRow = matchRes.rows[0];
    const winnerId = scoreA > scoreB ? matchRow.teamAId : matchRow.teamBId;

    const updated = await pool.query(
      `
      update matches
      set score_a = $1, score_b = $2, winner_id = $3
      where tournament_id = $4 and code = $5 and phase = 'RR'
      returning
        code as id,
        phase,
        team_a_id as "teamAId",
        team_b_id as "teamBId",
        score_a as "scoreA",
        score_b as "scoreB",
        winner_id as "winnerId";
      `,
      [scoreA, scoreB, winnerId, tournamentId, id]
    );

    const teams = await getTeamsForTournament(tournamentId);
    const rrMatches = await getMatchesForTournamentByPhase(tournamentId, ["RR"]);
    const standings = engine.computeStandings(teams.map((t) => t.id), rrMatches);

    res.json({ match: updated.rows[0], standings });
  } catch (err) {
    console.error("RR score error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------ OPTIONAL: /api/matches mock ------------------
app.get("/api/matches", (req, res) => {
  res.json([
    { teamA: "Team 1", teamB: "Team 2", date: "2025-11-15", time: "10:00 AM", court: "Court 1" },
    { teamA: "Team 3", teamB: "Team 4", date: "2025-11-15", time: "11:00 AM", court: "Court 2" },
  ]);
});

// ------------------ STATIC CLIENT (serve if dist exists) ------------------
const clientDistPath = path.join(__dirname, "..", "client", "dist");

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));

  // SPA fallback (so refreshes work on /players, /matches, etc.)
  app.get("*", (req, res) => {
    res.sendFile(path.join(clientDistPath, "index.html"));
  });
}

// ------------------ START SERVER (Railway-safe) ------------------
console.log("✅ about to listen on port", PORT);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});