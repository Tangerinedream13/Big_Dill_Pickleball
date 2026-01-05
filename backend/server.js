// server.js
console.log("TOP OF SERVER.JS");

require("dotenv").config();
console.log("✅ after dotenv");

const express = require("express");
console.log("✅ after express");

const pool = require("./db");
console.log("✅ after db");

const engine = require("./tournamentEngine");
console.log("✅ after engine");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
console.log("✅ server.js loaded, routes about to be registered");

// ------------------ TEMP IN-MEMORY STORE ------------------
// (Kept only because you had it; DB-backed routes below don't rely on it.)
const store = {
  teams: [
    { id: 1, name: "Aubrey & Olivia" },
    { id: 2, name: "Big Dill Energy" },
    { id: 3, name: "Kitchen Dinks" },
    { id: 4, name: "Pickles" },
    { id: 5, name: "Dill With It" },
    { id: 6, name: "Net Results" },
  ],
  rrMatches: [],
  semis: [],
  finals: [],
};

// ------------------ PROCESS ERROR LOGGING ------------------
process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED PROMISE REJECTION:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

// ------------------ HELPERS (DB) ------------------
// For now, we use the first tournament in the DB (your seeded "Default Tournament" is id=1).
async function getDefaultTournamentId() {
  const r = await pool.query(
    "select id from tournaments order by id asc limit 1;"
  );
  if (r.rowCount === 0)
    throw new Error("No tournaments found. Seed one first.");
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

// Returns rows shaped for the client: teamAId/teamBId/scoreA/scoreB/winnerId + code/phase
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

  // Your engine expects match objects with `id`, so we map `code` -> `id`
  return r.rows.map((m) => ({
    id: m.code,
    phase: m.phase,
    teamAId: m.teamAId,
    teamBId: m.teamBId,
    scoreA: m.scoreA,
    scoreB: m.scoreB,
    winnerId: m.winnerId,
  }));
}

// ------------------ API ROUTES ------------------

// Test message route
app.get("/api/message", (req, res) => {
  res.json({ text: "Hello from the Big Dill Pickleball backend!" });
});

// ---- GET /api/players ----
app.get("/api/players", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM players ORDER BY id;");
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching players:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ---- POST /api/players ----
app.post("/api/players", async (req, res) => {
  const { name, skill } = req.body;

  if (!name) return res.status(400).json({ error: "Name is required" });

  try {
    const result = await pool.query(
      "INSERT INTO players (name, skill) VALUES ($1, $2) RETURNING *;",
      [name, skill]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error adding player:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ---- GET /api/matches (mock data) ----
app.get("/api/matches", (req, res) => {
  res.json([
    {
      teamA: "Team 1",
      teamB: "Team 2",
      date: "2025-11-15",
      time: "10:00 AM",
      court: "Court 1",
    },
    {
      teamA: "Team 3",
      teamB: "Team 4",
      date: "2025-11-15",
      time: "11:00 AM",
      court: "Court 2",
    },
  ]);
});

// ------------------ TOURNAMENT STATE (DB-BACKED) ------------------
// ---- GET /api/tournament/state ----
app.get("/api/tournament/state", async (req, res) => {
  try {
    const tournamentId = await getDefaultTournamentId();

    const teams = await getTeamsForTournament(tournamentId);
    const rrMatches = await getMatchesForTournamentByPhase(tournamentId, [
      "RR",
    ]);
    const semis = await getMatchesForTournamentByPhase(tournamentId, ["SF"]);
    const finals = await getMatchesForTournamentByPhase(tournamentId, [
      "FINAL",
      "THIRD",
    ]);

    const standings = engine.computeStandings(
      teams.map((t) => t.id),
      rrMatches
    );

    res.json({
      teams,
      rrMatches,
      standings,
      semis,
      finals,
      tournamentId,
    });
  } catch (err) {
    console.error("State error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---- POST /api/tournament/reset ----
// DB-backed reset: wipes all matches for the default tournament
app.post("/api/tournament/reset", async (req, res) => {
  try {
    const tournamentId = await getDefaultTournamentId();
    await pool.query(`delete from matches where tournament_id = $1;`, [
      tournamentId,
    ]);
    res.json({ ok: true, tournamentId });
  } catch (err) {
    console.error("Reset error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------ ROUND ROBIN (DB-BACKED) ------------------

// ---- POST /api/roundrobin/generate ----
app.post("/api/roundrobin/generate", async (req, res) => {
  try {
    const tournamentId = await getDefaultTournamentId();

    const teams = await getTeamsForTournament(tournamentId);

    const gamesPerTeamRaw = req.body?.gamesPerTeam;
    const gamesPerTeam = Number.isFinite(Number(gamesPerTeamRaw))
      ? Number(gamesPerTeamRaw)
      : 4;

    const rrMatches = engine.generateRoundRobinSchedule(teams, gamesPerTeam);

    // Clear existing RR matches in DB for this tournament
    await pool.query(
      `delete from matches where tournament_id = $1 and phase = 'RR';`,
      [tournamentId]
    );

    // ALSO clear playoffs because RR schedule/results changed
    await pool.query(
      `delete from matches where tournament_id = $1 and phase in ('SF','FINAL','THIRD');`,
      [tournamentId]
    );

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

// ---- PATCH /api/roundrobin/matches/:id/score ----
app.patch("/api/roundrobin/matches/:id/score", async (req, res) => {
  const { id } = req.params; // e.g., "RR-1"
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
      select
        code,
        team_a_id as "teamAId",
        team_b_id as "teamBId"
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
      set score_a = $1,
          score_b = $2,
          winner_id = $3
      where tournament_id = $4
        and code = $5
        and phase = 'RR'
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
    const rrMatches = await getMatchesForTournamentByPhase(tournamentId, [
      "RR",
    ]);

    const standings = engine.computeStandings(
      teams.map((t) => t.id),
      rrMatches
    );

    res.json({ match: updated.rows[0], standings });
  } catch (err) {
    console.error("Score error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------ PLAYOFFS (DB-BACKED) ------------------

// ---- POST /api/playoffs/generate ----
// Reads RR results from DB -> computes standings -> generates SF1/SF2 -> inserts into DB
app.post("/api/playoffs/generate", async (req, res) => {
  try {
    const tournamentId = await getDefaultTournamentId();

    const teams = await getTeamsForTournament(tournamentId);
    const rrMatches = await getMatchesForTournamentByPhase(tournamentId, ["RR"]);

    const standings = engine.computeStandings(
      teams.map((t) => t.id),
      rrMatches
    );

    const semis = engine.generatePlayoffsFromStandings(standings);

    // Clear any existing SF matches (so regenerate is idempotent)
    await pool.query(
      `delete from matches where tournament_id = $1 and phase = 'SF';`,
      [tournamentId]
    );

    // Insert SF1/SF2
    if (semis.length > 0) {
      const params = [];
      const chunks = [];
      let i = 1;

      for (const m of semis) {
        // code = "SF1"/"SF2", phase="SF"
        chunks.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++})`);
        params.push(tournamentId, m.id, "SF", m.teamAId, m.teamBId);
      }

      await pool.query(
        `
        insert into matches (tournament_id, code, phase, team_a_id, team_b_id)
        values ${chunks.join(", ")}
        `,
        params
      );
    }

    res.json({ semis, tournamentId });
  } catch (err) {
    console.error("Playoffs generate error:", err);
    res.status(500).json({ error: err.message }); 
  }
});

// ---- POST /api/playoffs/semis/:id/score ----
// Updates SF match score in DB.
// If BOTH SF winners exist, generates FINAL + THIRD and inserts them.
// Includes:
//  - ✅ 500 on server errors (was 400)
//  - ✅ transaction for delete+insert finals
//  - ✅ 409 guard if finals already have scores (prevents wiping scored finals)
app.post("/api/playoffs/semis/:id/score", async (req, res) => {
  const { id } = req.params; // "SF1" or "SF2"
  const { scoreA, scoreB } = req.body;

  try {
    const tournamentId = await getDefaultTournamentId();

    // Validate
    if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB)) {
      return res.status(400).json({ error: "Scores must be integers." });
    }
    if (scoreA === scoreB) {
      return res.status(400).json({ error: "Ties not supported." });
    }

    // Load the SF match so we can compute winnerId
    const sfRes = await pool.query(
      `
      select
        code,
        team_a_id as "teamAId",
        team_b_id as "teamBId"
      from matches
      where tournament_id = $1 and code = $2 and phase = 'SF'
      `,
      [tournamentId, id]
    );

    if (sfRes.rowCount === 0) {
      return res.status(404).json({ error: `SF match not found: ${id}` });
    }

    const sf = sfRes.rows[0];
    const winnerId = scoreA > scoreB ? sf.teamAId : sf.teamBId;

    // Update SF score in DB
    await pool.query(
      `
      update matches
      set score_a = $1,
          score_b = $2,
          winner_id = $3
      where tournament_id = $4 and code = $5 and phase = 'SF'
      `,
      [scoreA, scoreB, winnerId, tournamentId, id]
    );

    // Pull both semis back from DB (as engine-shaped objects)
    const semis = await getMatchesForTournamentByPhase(tournamentId, ["SF"]);

    const sf1Done = semis.find((m) => m.id === "SF1")?.winnerId;
    const sf2Done = semis.find((m) => m.id === "SF2")?.winnerId;

    // If both semis have winners, generate finals + third place
    if (sf1Done && sf2Done) {
      // ✅ 409 guard: don't allow changing semis if finals already scored
      const finalsScoredRes = await pool.query(
        `
        select 1
        from matches
        where tournament_id = $1
          and phase in ('FINAL','THIRD')
          and (score_a is not null or score_b is not null)
        limit 1;
        `,
        [tournamentId]
      );

      if (finalsScoredRes.rowCount > 0) {
        return res.status(409).json({
          error: "Finals already scored. Reset playoffs before changing semis.",
        });
      }

      const finals = engine.generateFinalsFromSemis(semis);

      // ✅ Transaction: delete + insert finals atomically
      await pool.query("begin");
      try {
        // Clear existing FINAL/THIRD then insert fresh
        await pool.query(
          `delete from matches where tournament_id = $1 and phase in ('FINAL','THIRD');`,
          [tournamentId]
        );

        const params = [];
        const chunks = [];
        let i = 1;

        for (const m of finals) {
          chunks.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++})`);
          params.push(tournamentId, m.id, m.phase, m.teamAId, m.teamBId);
        }

        await pool.query(
          `
          insert into matches (tournament_id, code, phase, team_a_id, team_b_id)
          values ${chunks.join(", ")}
          `,
          params
        );

        await pool.query("commit");
      } catch (e) {
        await pool.query("rollback");
        throw e;
      }
    }

    // Return updated semis + finals from DB
    const semisOut = await getMatchesForTournamentByPhase(tournamentId, ["SF"]);
    const finalsOut = await getMatchesForTournamentByPhase(tournamentId, [
      "FINAL",
      "THIRD",
    ]);

    res.json({ semis: semisOut, finals: finalsOut, tournamentId });
  } catch (err) {
    console.error("Semi score error:", err);
    res.status(500).json({ error: err.message }); 
  }
});

// ---- POST /api/playoffs/finals/:id/score ----
// Scores FINAL or THIRD in DB and returns updated finals from DB
app.post("/api/playoffs/finals/:id/score", async (req, res) => {
  const { id } = req.params; // "FINAL" or "THIRD"
  const { scoreA, scoreB } = req.body;

  try {
    const tournamentId = await getDefaultTournamentId();

    // Validate
    if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB)) {
      return res.status(400).json({ error: "Scores must be integers." });
    }
    if (scoreA === scoreB) {
      return res.status(400).json({ error: "Ties not supported." });
    }

    // Load the match so we can compute winnerId
    const mRes = await pool.query(
      `
      select
        code,
        phase,
        team_a_id as "teamAId",
        team_b_id as "teamBId"
      from matches
      where tournament_id = $1
        and code = $2
        and phase in ('FINAL','THIRD')
      `,
      [tournamentId, id]
    );

    if (mRes.rowCount === 0) {
      return res.status(404).json({ error: `Finals match not found: ${id}` });
    }

    const m = mRes.rows[0];
    const winnerId = scoreA > scoreB ? m.teamAId : m.teamBId;

    const updated = await pool.query(
      `
      update matches
      set score_a = $1,
          score_b = $2,
          winner_id = $3
      where tournament_id = $4
        and code = $5
        and phase in ('FINAL','THIRD')
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

    const finals = await getMatchesForTournamentByPhase(tournamentId, [
      "FINAL",
      "THIRD",
    ]);

    res.json({ match: updated.rows[0], finals, tournamentId });
  } catch (err) {
    console.error("Finals score error:", err);
    res.status(500).json({ error: err.message }); 
  }
});

// ------------------ START SERVER ------------------
console.log("✅ about to listen on port", PORT);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
