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

// ------------------ PROCESS ERROR LOGGING ------------------
process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED PROMISE REJECTION:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

// ------------------ HELPERS (DB) ------------------
async function getDefaultTournamentId() {
  const r = await pool.query("select id from tournaments order by id asc limit 1;");
  if (r.rowCount === 0) throw new Error("No tournaments found. Seed one first.");
  return r.rows[0].id;
}

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
// Body: { name }
// Creates a tournament row and returns it.
// (Optional next step: auto-create teams + tournament_teams associations.)
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

// ------------------ PLAYERS HELPERS (supports both schemas) ------------------
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
      // column tournament_id does not exist -> fallback
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

// DB-backed reset: wipes all matches for the default tournament
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

// ------------------ ROUND ROBIN (DB-BACKED) ------------------
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
      select code, team_a_id as "teamAId", team_b_id as "teamBId"
      from matches
      where tournament_id = $1 and code = $2 and phase = 'RR'
      `,
      [tournamentId, id]
    );

    if (matchRes.rowCount === 0) return res.status(404).json({ error: `RR match not found: ${id}` });

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

// ------------------ PLAYOFFS (DB-BACKED) ------------------
app.post("/api/playoffs/generate", async (req, res) => {
  try {
    const tournamentId = await getDefaultTournamentId();

    const teams = await getTeamsForTournament(tournamentId);
    const rrMatches = await getMatchesForTournamentByPhase(tournamentId, ["RR"]);

    const standings = engine.computeStandings(teams.map((t) => t.id), rrMatches);
    const semis = engine.generatePlayoffsFromStandings(standings);

    await pool.query(`delete from matches where tournament_id = $1 and phase = 'SF';`, [tournamentId]);

    if (semis.length > 0) {
      const params = [];
      const chunks = [];
      let i = 1;

      for (const m of semis) {
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

app.post("/api/playoffs/semis/:id/score", async (req, res) => {
  const { id } = req.params; // "SF1" or "SF2"
  const { scoreA, scoreB } = req.body;

  try {
    const tournamentId = await getDefaultTournamentId();

    if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB)) {
      return res.status(400).json({ error: "Scores must be integers." });
    }
    if (scoreA === scoreB) {
      return res.status(400).json({ error: "Ties not supported." });
    }

    const sfRes = await pool.query(
      `
      select code, team_a_id as "teamAId", team_b_id as "teamBId"
      from matches
      where tournament_id = $1 and code = $2 and phase = 'SF'
      `,
      [tournamentId, id]
    );

    if (sfRes.rowCount === 0) return res.status(404).json({ error: `SF match not found: ${id}` });

    const sf = sfRes.rows[0];
    const winnerId = scoreA > scoreB ? sf.teamAId : sf.teamBId;

    await pool.query(
      `
      update matches
      set score_a = $1, score_b = $2, winner_id = $3
      where tournament_id = $4 and code = $5 and phase = 'SF'
      `,
      [scoreA, scoreB, winnerId, tournamentId, id]
    );

    const semis = await getMatchesForTournamentByPhase(tournamentId, ["SF"]);
    const sf1Done = semis.find((m) => m.id === "SF1")?.winnerId;
    const sf2Done = semis.find((m) => m.id === "SF2")?.winnerId;

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

      await pool.query("begin");
      try {
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

    const semisOut = await getMatchesForTournamentByPhase(tournamentId, ["SF"]);
    const finalsOut = await getMatchesForTournamentByPhase(tournamentId, ["FINAL", "THIRD"]);

    res.json({ semis: semisOut, finals: finalsOut, tournamentId });
  } catch (err) {
    console.error("Semi score error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/playoffs/finals/:id/score", async (req, res) => {
  const { id } = req.params; // "FINAL" or "THIRD"
  const { scoreA, scoreB } = req.body;

  try {
    const tournamentId = await getDefaultTournamentId();

    if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB)) {
      return res.status(400).json({ error: "Scores must be integers." });
    }
    if (scoreA === scoreB) {
      return res.status(400).json({ error: "Ties not supported." });
    }

    const mRes = await pool.query(
      `
      select code, phase, team_a_id as "teamAId", team_b_id as "teamBId"
      from matches
      where tournament_id = $1 and code = $2 and phase in ('FINAL','THIRD')
      `,
      [tournamentId, id]
    );

    if (mRes.rowCount === 0) return res.status(404).json({ error: `Finals match not found: ${id}` });

    const m = mRes.rows[0];
    const winnerId = scoreA > scoreB ? m.teamAId : m.teamBId;

    const updated = await pool.query(
      `
      update matches
      set score_a = $1, score_b = $2, winner_id = $3
      where tournament_id = $4 and code = $5 and phase in ('FINAL','THIRD')
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

    const finals = await getMatchesForTournamentByPhase(tournamentId, ["FINAL", "THIRD"]);
    res.json({ match: updated.rows[0], finals, tournamentId });
  } catch (err) {
    console.error("Finals score error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------ PLAYERS (DB-BACKED, DUPR) ------------------
// Search ONLY by name OR DUPR. No "level" / no "skill".
app.get("/api/players", async (req, res) => {
  try {
    const tournamentId = await getDefaultTournamentId();
    const qRaw = (req.query.q ?? "").toString().trim();

    const qNum = qRaw !== "" ? Number(qRaw) : NaN;
    const isNumericQuery = Number.isFinite(qNum);
    const qRounded = isNumericQuery ? Math.round(qNum * 100) / 100 : null;

    const withT = `
      select id, name, dupr_rating as "duprRating"
      from players
      where tournament_id = $1
        and (
          $2 = '' OR
          ( $3 = true  and dupr_rating = $4 ) OR
          ( $3 = false and name ilike $5 )
        )
      order by name asc;
    `;
    const withoutT = `
      select id, name, dupr_rating as "duprRating"
      from players
      where
        $1 = '' OR
        ( $2 = true  and dupr_rating = $3 ) OR
        ( $2 = false and name ilike $4 )
      order by name asc;
    `;

    const result = await queryPlayersScoped(
      withT,
      [tournamentId, qRaw, isNumericQuery, qRounded, `%${qRaw}%`],
      withoutT,
      [qRaw, isNumericQuery, qRounded, `%${qRaw}%`]
    );

    res.json(
      result.rows.map((p) => ({
        ...p,
        duprTier: duprLabel(p.duprRating),
      }))
    );
  } catch (err) {
    console.error("GET /api/players error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/players", async (req, res) => {
  try {
    const tournamentId = await getDefaultTournamentId();
    const name = (req.body.name ?? "").toString().trim();
    const dupr = parseDupr(req.body.duprRating);

    if (!name) return res.status(400).json({ error: "Name is required." });
    if (Number.isNaN(dupr)) return res.status(400).json({ error: "DUPR must be a number." });
    if (dupr !== null && (dupr < 2.0 || dupr > 6.99)) {
      return res.status(400).json({ error: "DUPR must be between 2.00 and 6.99 (or blank)." });
    }

    const withT = `
      insert into players (tournament_id, name, dupr_rating)
      values ($1, $2, $3)
      returning id, name, dupr_rating as "duprRating";
    `;
    const withoutT = `
      insert into players (name, dupr_rating)
      values ($1, $2)
      returning id, name, dupr_rating as "duprRating";
    `;

    const inserted = await queryPlayersScoped(
      withT,
      [tournamentId, name, dupr],
      withoutT,
      [name, dupr]
    );

    const p = inserted.rows[0];
    res.status(201).json({ ...p, duprTier: duprLabel(p.duprRating) });
  } catch (err) {
    console.error("POST /api/players error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/players/:id", async (req, res) => {
  try {
    const tournamentId = await getDefaultTournamentId();
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid player id." });

    const name =
      req.body.name === undefined ? undefined : (req.body.name ?? "").toString().trim();
    const dupr =
      req.body.duprRating === undefined ? undefined : parseDupr(req.body.duprRating);

    if (name !== undefined && !name) return res.status(400).json({ error: "Name cannot be empty." });
    if (dupr !== undefined && Number.isNaN(dupr)) return res.status(400).json({ error: "DUPR must be a number." });
    if (dupr !== undefined && dupr !== null && (dupr < 2.0 || dupr > 6.99)) {
      return res.status(400).json({ error: "DUPR must be between 2.00 and 6.99 (or blank)." });
    }

    const withT = `
      update players
      set
        name = coalesce($1, name),
        dupr_rating = $2
      where tournament_id = $3 and id = $4
      returning id, name, dupr_rating as "duprRating";
    `;
    const withoutT = `
      update players
      set
        name = coalesce($1, name),
        dupr_rating = $2
      where id = $3
      returning id, name, dupr_rating as "duprRating";
    `;

    // If dupr is not provided, keep current value by passing null? -> we don't want that.
    // So: pass current value by using "dupr_rating = coalesce($2, dupr_rating)" only if undefined.
    // We’ll do it by rewriting params:
    const duprParam = dupr === undefined ? null : dupr;
    const nameParam = name === undefined ? null : name;

    const withT2 = `
      update players
      set
        name = coalesce($1, name),
        dupr_rating = coalesce($2, dupr_rating)
      where tournament_id = $3 and id = $4
      returning id, name, dupr_rating as "duprRating";
    `;
    const withoutT2 = `
      update players
      set
        name = coalesce($1, name),
        dupr_rating = coalesce($2, dupr_rating)
      where id = $3
      returning id, name, dupr_rating as "duprRating";
    `;

    const updated = await queryPlayersScoped(
      withT2,
      [nameParam, duprParam, tournamentId, id],
      withoutT2,
      [nameParam, duprParam, id]
    );

    if (updated.rowCount === 0) return res.status(404).json({ error: `Player not found: ${id}` });

    const p = updated.rows[0];
    res.json({ ...p, duprTier: duprLabel(p.duprRating) });
  } catch (err) {
    console.error("PATCH /api/players/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/players/:id", async (req, res) => {
  try {
    const tournamentId = await getDefaultTournamentId();
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid player id." });

    const withT = `
      delete from players
      where tournament_id = $1 and id = $2
      returning id;
    `;
    const withoutT = `
      delete from players
      where id = $1
      returning id;
    `;

    const deleted = await queryPlayersScoped(withT, [tournamentId, id], withoutT, [id]);

    if (deleted.rowCount === 0) return res.status(404).json({ error: `Player not found: ${id}` });

    res.json({ ok: true, id });
  } catch (err) {
    console.error("DELETE /api/players/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------ (OPTIONAL) /api/matches mock route ------------------
// If you still use this anywhere in the UI, keep it. Otherwise you can delete it safely.
app.get("/api/matches", (req, res) => {
  res.json([
    { teamA: "Team 1", teamB: "Team 2", date: "2025-11-15", time: "10:00 AM", court: "Court 1" },
    { teamA: "Team 3", teamB: "Team 4", date: "2025-11-15", time: "11:00 AM", court: "Court 2" },
  ]);
});

// ------------------ START SERVER ------------------
console.log("✅ about to listen on port", PORT);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});