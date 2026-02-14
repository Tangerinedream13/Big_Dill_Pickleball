// backend/server.js
require("dotenv").config();

// Boot logging (set BOOT_DEBUG=1 to enable verbose startup logs)
const BOOT_DEBUG = process.env.BOOT_DEBUG === "1";
const bootLog = (...args) => BOOT_DEBUG && console.log(...args);

bootLog("TOP OF SERVER.JS");
bootLog("after dotenv");

// Process error logging (install early)
process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED PROMISE REJECTION:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT) || 3001;

/* -----------------------------
   CORS
------------------------------ */

const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:3001",
  "https://client-production-b04f.up.railway.app",
]);

const corsOptions = {
  origin: (origin, cb) => {
    // allow curl/postman/server-to-server requests
    if (!origin) return cb(null, true);

    if (allowedOrigins.has(origin)) return cb(null, true);

    // block silently (do not throw)
    return cb(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions)); // preflight

// body parsing
app.use(express.json());

/* -----------------------------
   Imports
------------------------------ */
const pool = require("./db");
bootLog("after db");

const engine = require("./tournamentEngine");
bootLog("after engine");

const teamsRoutes = require("./routes/teams");
const tournamentsRoutes = require("./routes/tournaments");
const signupRoutes = require("./routes/signup");

/* -----------------------------
   Helpers
------------------------------ */
function errToMessage(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  return (
    err.message || err.detail || err.hint || err.code || JSON.stringify(err)
  );
}

// DUPR helpers
function parseDupr(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function duprLabel(dupr) {
  const n = parseDupr(dupr);
  if (n == null) return "Unrated";
  if (n >= 5.0) return "Elite (5.0+)";
  if (n >= 4.0) return "Advanced (4.0–4.99)";
  if (n >= 3.0) return "Intermediate (3.0–3.99)";
  if (n >= 2.0) return "Beginner (2.0–2.99)";
  return "New (under 2.0)";
}

// Score validation (Pickleball)
function validatePickleballScore(
  scoreA,
  scoreB,
  { playTo = 11, winBy = 2 } = {}
) {
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB)) {
    return "Scores must be integers.";
  }
  if (scoreA < 0 || scoreB < 0) return "Scores must be >= 0.";
  if (scoreA === scoreB) return "Ties are not allowed.";

  const max = Math.max(scoreA, scoreB);
  const min = Math.min(scoreA, scoreB);

  if (max < playTo) return `Game must be played to at least ${playTo}.`;
  if (max - min < winBy) return `Team must win by ${winBy}.`;

  return null;
}

/* -----------------------------
   Routes (mount early)
------------------------------ */
bootLog("server.js loaded, routes about to be registered");

app.use("/api/teams", teamsRoutes);
app.use("/api/tournaments", tournamentsRoutes);
app.use("/api", signupRoutes(pool));

// Health
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

/* -----------------------------
   Tournament helpers (DB)
------------------------------ */
async function getDefaultTournamentId() {
  const r = await pool.query(
    "select id from tournaments order by id desc limit 1;"
  );
  if (r.rowCount === 0)
    throw new Error("No tournaments found. Seed one first.");
  return String(r.rows[0].id);
}

function parseTournamentId(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) return null;
  return String(n);
}

async function resolveTournamentId(req) {
  const fromQuery = parseTournamentId(req.query?.tournamentId);
  const fromBody = parseTournamentId(req.body?.tournamentId);
  return fromQuery || fromBody || (await getDefaultTournamentId());
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

// Compute placements from completed playoff matches (FINAL + THIRD winners)
function computePlacementsFromMatches({ semis, finals }) {
  const byId = new Map();
  for (const m of [...(semis ?? []), ...(finals ?? [])]) {
    byId.set(String(m.id), m);
  }

  const final = byId.get("FINAL");
  const third = byId.get("THIRD");

  if (!final?.winnerId || !third?.winnerId) return null;

  const champion = String(final.winnerId);
  const runnerUp =
    String(final.winnerId) === String(final.teamAId)
      ? String(final.teamBId)
      : String(final.teamAId);

  const thirdPlace = String(third.winnerId);
  const fourthPlace =
    String(third.winnerId) === String(third.teamAId)
      ? String(third.teamBId)
      : String(third.teamAId);

  return { champion, runnerUp, third: thirdPlace, fourth: fourthPlace };
}

// Decorate placements with team names so UI can render directly
function decoratePlacementsWithTeamNames(placements, teams) {
  if (!placements) return null;

  const nameById = new Map((teams ?? []).map((t) => [String(t.id), t.name]));
  const nameFor = (id) => nameById.get(String(id)) ?? `Team ${id}`;

  return {
    champion: { id: placements.champion, name: nameFor(placements.champion) },
    runnerUp: { id: placements.runnerUp, name: nameFor(placements.runnerUp) },
    third: { id: placements.third, name: nameFor(placements.third) },
    fourth: { id: placements.fourth, name: nameFor(placements.fourth) },
  };
}

function parseISODate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function minutesBetween(a, b) {
  return Math.floor((b.getTime() - a.getTime()) / 60000);
}

function addMinutes(d, mins) {
  return new Date(d.getTime() + mins * 60000);
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
      winner_id as "winnerId",
      start_time as "startTime",
      court
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

  // engine expects `id`
  return r.rows.map((m) => ({
    id: m.code,
    phase: m.phase,
    teamAId: m.teamAId,
    teamBId: m.teamBId,
    scoreA: m.scoreA,
    scoreB: m.scoreB,
    winnerId: m.winnerId,
    startTime: m.startTime,
    court: m.court,
  }));
}

/* -----------------------------
   Tournament-scoped Players + Team Creation
------------------------------ */

// GET players in a specific tournament
app.get("/api/tournaments/:tid/players", async (req, res) => {
  const tid = Number(req.params.tid);
  if (!Number.isInteger(tid) || tid <= 0) {
    return res.status(400).json({ error: "Invalid tournament id." });
  }

  try {
    const q = `
      select
        p.id,
        p.name,
        p.email,
        p.dupr_rating as "duprRating",
        exists (
          select 1
          from team_players tp
          join tournament_teams tt on tt.team_id = tp.team_id
          where tt.tournament_id = $1
            and tp.player_id = p.id
        ) as "inTeam"
      from tournament_players tpp
      join players p on p.id = tpp.player_id
      where tpp.tournament_id = $1
      order by p.id desc;
    `;
    const r = await pool.query(q, [tid]);

    res.json(
      r.rows.map((p) => ({
        ...p,
        duprTier: duprLabel(p.duprRating),
      }))
    );
  } catch (err) {
    console.error("GET /api/tournaments/:tid/players error:", err);
    res.status(500).json({ error: errToMessage(err) });
  }
});

// POST create a doubles team (exactly 2 players)
app.post("/api/tournaments/:tid/teams", async (req, res) => {
  const tid = Number(req.params.tid);
  const playerAId = Number(req.body.playerAId);
  const playerBId = Number(req.body.playerBId);
  const requestedName = (req.body.teamName ?? "").toString().trim();

  if (!Number.isInteger(tid) || tid <= 0) {
    return res.status(400).json({ error: "Invalid tournament id." });
  }
  if (!Number.isInteger(playerAId) || !Number.isInteger(playerBId)) {
    return res
      .status(400)
      .json({ error: "playerAId and playerBId are required." });
  }
  if (playerAId === playerBId) {
    return res.status(400).json({ error: "Pick two different players." });
  }

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
      [tid, playerAId, playerBId]
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
      [tid, playerAId, playerBId]
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
        [tid]
      );
      finalName = `SPD-${tid}-Team-${(n.rows?.[0]?.c ?? 0) + 1}`;
    }

    // Create team
    const teamRow = await client.query(
      `insert into teams(name) values ($1) returning id, name;`,
      [finalName]
    );
    const teamId = teamRow.rows[0].id;

    // Link two players to team
    await client.query(
      `insert into team_players(team_id, player_id) values ($1, $2), ($1, $3);`,
      [teamId, playerAId, playerBId]
    );

    // Add team to tournament
    await client.query(
      `insert into tournament_teams(tournament_id, team_id) values ($1, $2);`,
      [tid, teamId]
    );

    await client.query("COMMIT");
    res.json({
      ok: true,
      tournamentId: tid,
      team: { id: teamId, name: finalName },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("POST /api/tournaments/:tid/teams error:", err);
    res.status(400).json({ error: errToMessage(err) });
  } finally {
    client.release();
  }
});

/* -----------------------------
   Tournament State + Match Endpoints
------------------------------ */

// Tournament state (DB-backed)
app.get("/api/tournament/state", async (req, res) => {
  try {
    const tournamentId = await resolveTournamentId(req);

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

    const placementsRaw = computePlacementsFromMatches({ semis, finals });
    const placements = decoratePlacementsWithTeamNames(placementsRaw, teams);

    res.json({
      teams,
      rrMatches,
      standings,
      semis,
      finals,
      placements,
      tournamentId,
    });
  } catch (err) {
    console.error("State error:", err);
    res.status(500).json({ error: errToMessage(err) });
  }
});

// Reset tournament matches
app.post("/api/tournament/reset", async (req, res) => {
  try {
    const tournamentId = await resolveTournamentId(req);
    await pool.query(`delete from matches where tournament_id = $1;`, [
      tournamentId,
    ]);
    res.json({ ok: true, tournamentId });
  } catch (err) {
    console.error("Reset error:", err);
    res.status(500).json({ error: errToMessage(err) });
  }
});

// Round robin generate
app.post("/api/roundrobin/generate", async (req, res) => {
  try {
    const tournamentId = await resolveTournamentId(req);
    const teams = await getTeamsForTournament(tournamentId);

    if (teams.length < 3) {
      return res.status(409).json({
        error: "You need at least 3 teams to generate a round robin schedule.",
      });
    }

    const maxGamesPerTeam = teams.length - 1;

    const raw = req.body?.gamesPerTeam;
    const hasExplicitGamesPerTeam =
      raw !== undefined && raw !== null && raw !== "";

    let gamesPerTeam = Number.isFinite(Number(raw)) ? Number(raw) : 4;

    if (!hasExplicitGamesPerTeam) {
      gamesPerTeam = Math.min(4, maxGamesPerTeam);
    }

    if (gamesPerTeam > maxGamesPerTeam) {
      return res.status(409).json({
        error: `gamesPerTeam=${gamesPerTeam} is too large for ${teams.length} teams (max is ${maxGamesPerTeam}).`,
      });
    }

    const slotMinutesRaw = req.body?.slotMinutes;
    const slotMinutes = Number.isFinite(Number(slotMinutesRaw))
      ? Number(slotMinutesRaw)
      : 20;

    const courtsRaw = req.body?.courts;
    const courts = Number.isFinite(Number(courtsRaw)) ? Number(courtsRaw) : 4;

    const startTime = parseISODate(req.body?.startTimeISO);
    const endTime = parseISODate(req.body?.endTimeISO);

    const rrMatches = engine.generateRoundRobinSchedule(teams, gamesPerTeam);

    await pool.query(
      `delete from matches where tournament_id = $1 and phase = 'RR';`,
      [tournamentId]
    );
    await pool.query(
      `delete from matches where tournament_id = $1 and phase in ('SF','FINAL','THIRD');`,
      [tournamentId]
    );

    let scheduled = rrMatches.map((m) => ({
      ...m,
      startTime: null,
      court: null,
    }));

    if (startTime && endTime) {
      const totalMinutes = minutesBetween(startTime, endTime);
      const slots = Math.floor(totalMinutes / slotMinutes);
      const capacity = slots * courts;

      if (rrMatches.length > capacity) {
        return res.status(409).json({
          error: `Schedule won't fit: ${rrMatches.length} matches > capacity ${capacity} (${slots} slots x ${courts} courts).`,
        });
      }

      scheduled = rrMatches.map((m, idx) => {
        const slotIndex = Math.floor(idx / courts);
        const court = (idx % courts) + 1;
        const st = addMinutes(startTime, slotIndex * slotMinutes);
        return { ...m, startTime: st.toISOString(), court };
      });
    }

    if (scheduled.length > 0) {
      const params = [];
      const chunks = [];
      let i = 1;

      for (const m of scheduled) {
        chunks.push(
          `($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`
        );
        params.push(
          tournamentId,
          m.id,
          "RR",
          m.teamAId,
          m.teamBId,
          m.startTime ? m.startTime : null,
          m.court ? m.court : null
        );
      }

      await pool.query(
        `
        insert into matches (
          tournament_id, code, phase, team_a_id, team_b_id, start_time, court
        )
        values ${chunks.join(", ")}
        `,
        params
      );
    }

    res.json({
      teams,
      matches: scheduled,
      tournamentId,
      meta: {
        teamsCount: teams.length,
        gamesPerTeam,
        maxGamesPerTeam,
        rrMatchesCount: scheduled.length,
      },
      schedule:
        startTime && endTime
          ? {
              startTimeISO: startTime.toISOString(),
              endTimeISO: endTime.toISOString(),
              slotMinutes,
              courts,
            }
          : null,
    });
  } catch (err) {
    console.error("RR generate error:", err);
    res.status(500).json({ error: errToMessage(err) });
  }
});

// Round robin scoring
app.patch("/api/roundrobin/matches/:code/score", async (req, res) => {
  const { code } = req.params;
  const { scoreA, scoreB, winnerId: winnerIdRaw } = req.body;

  try {
    const tournamentId = await resolveTournamentId(req);

    const mRes = await pool.query(
      `
      select team_a_id as "teamAId", team_b_id as "teamBId"
      from matches
      where tournament_id = $1
        and code = $2
        and phase = 'RR'
      `,
      [tournamentId, code]
    );

    if (mRes.rowCount === 0) {
      return res.status(404).json({ error: `RR match not found: ${code}` });
    }

    const m = mRes.rows[0];

    if (
      winnerIdRaw !== undefined &&
      winnerIdRaw !== null &&
      winnerIdRaw !== ""
    ) {
      const w = Number(winnerIdRaw);
      if (!Number.isInteger(w)) {
        return res.status(400).json({ error: "winnerId must be an integer." });
      }

      const a = Number(m.teamAId);
      const b = Number(m.teamBId);
      if (w !== a && w !== b) {
        return res.status(400).json({
          error: "winnerId must be Team A or Team B for this match.",
        });
      }

      await pool.query(
        `
        update matches
        set score_a = null, score_b = null, winner_id = $1
        where tournament_id = $2
          and code = $3
          and phase = 'RR'
        `,
        [w, tournamentId, code]
      );
    } else {
      const msg = validatePickleballScore(scoreA, scoreB, {
        playTo: 11,
        winBy: 2,
      });
      if (msg) return res.status(400).json({ error: msg });

      const winnerId = scoreA > scoreB ? m.teamAId : m.teamBId;

      await pool.query(
        `
        update matches
        set score_a = $1, score_b = $2, winner_id = $3
        where tournament_id = $4
          and code = $5
          and phase = 'RR'
        `,
        [scoreA, scoreB, winnerId, tournamentId, code]
      );
    }

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

    const placementsRaw = computePlacementsFromMatches({ semis, finals });
    const placements = decoratePlacementsWithTeamNames(placementsRaw, teams);

    res.json({
      teams,
      rrMatches,
      standings,
      semis,
      finals,
      placements,
      tournamentId,
    });
  } catch (err) {
    console.error("RR score error:", err);
    res.status(500).json({ error: errToMessage(err) });
  }
});

/* -----------------------------
   Players helpers (schema fallback)
------------------------------ */
async function queryPlayersScoped(
  withTournamentSql,
  withTournamentParams,
  withoutTournamentSql,
  withoutTournamentParams
) {
  try {
    return await pool.query(withTournamentSql, withTournamentParams);
  } catch (err) {
    const msg = (err?.message || "").toLowerCase();
    const missingTournamentColumn =
      err?.code === "42703" ||
      msg.includes("tournament_id") ||
      (msg.includes("column") && msg.includes("tournament"));

    if (missingTournamentColumn) {
      return await pool.query(withoutTournamentSql, withoutTournamentParams);
    }
    throw err;
  }
}

/* -----------------------------
   Players (DB-backed, DUPR)
------------------------------ */
app.get("/api/players", async (req, res) => {
  try {
    const tournamentId = await resolveTournamentId(req);
    const qRaw = (req.query.q ?? "").toString().trim();

    const qNum = qRaw !== "" ? Number(qRaw) : NaN;
    const isNumericQuery = Number.isFinite(qNum);
    const qRounded = isNumericQuery ? Math.round(qNum * 100) / 100 : null;

    const withT = `
      select id, name, email, dupr_rating as "duprRating"
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
      select id, name, email, dupr_rating as "duprRating"
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
    res.status(500).json({ error: errToMessage(err) });
  }
});

app.post("/api/players", async (req, res) => {
  try {
    const tournamentId = await resolveTournamentId(req);
    const name = (req.body.name ?? "").toString().trim();
    const email = (req.body.email ?? "").toString().trim() || null;
    const dupr = parseDupr(req.body.duprRating);

    if (!name) return res.status(400).json({ error: "Name is required." });
    if (Number.isNaN(dupr))
      return res.status(400).json({ error: "DUPR must be a number." });
    if (dupr !== null && (dupr < 2.0 || dupr > 6.99)) {
      return res
        .status(400)
        .json({ error: "DUPR must be between 2.00 and 6.99 (or blank)." });
    }

    const withT = `
      insert into players (tournament_id, name, email, dupr_rating)
      values ($1, $2, $3, $4)
      returning id, name, email, dupr_rating as "duprRating";
    `;
    const withoutT = `
      insert into players (name, email, dupr_rating)
      values ($1, $2, $3)
      returning id, name, email, dupr_rating as "duprRating";
    `;

    const inserted = await queryPlayersScoped(
      withT,
      [tournamentId, name, email, dupr],
      withoutT,
      [name, email, dupr]
    );

    const p = inserted.rows[0];
    res.status(201).json({ ...p, duprTier: duprLabel(p.duprRating) });
  } catch (err) {
    console.error("POST /api/players error:", err);
    res.status(500).json({ error: errToMessage(err) });
  }
});

app.patch("/api/players/:id", async (req, res) => {
  try {
    const tournamentId = await resolveTournamentId(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id))
      return res.status(400).json({ error: "Invalid player id." });

    const name =
      req.body.name === undefined
        ? undefined
        : (req.body.name ?? "").toString().trim();
    const email =
      req.body.email === undefined
        ? undefined
        : (req.body.email ?? "").toString().trim();
    const dupr =
      req.body.duprRating === undefined
        ? undefined
        : parseDupr(req.body.duprRating);

    if (name !== undefined && !name)
      return res.status(400).json({ error: "Name cannot be empty." });
    if (dupr !== undefined && Number.isNaN(dupr))
      return res.status(400).json({ error: "DUPR must be a number." });
    if (dupr !== undefined && dupr !== null && (dupr < 2.0 || dupr > 6.99)) {
      return res
        .status(400)
        .json({ error: "DUPR must be between 2.00 and 6.99 (or blank)." });
    }

    const duprParam = dupr === undefined ? null : dupr;
    const nameParam = name === undefined ? null : name;
    const emailParam = email === undefined ? null : email || null;

    const withT2 = `
      update players
      set
        name = coalesce($1, name),
        email = coalesce($2, email),
        dupr_rating = coalesce($3, dupr_rating)
      where tournament_id = $4 and id = $5
      returning id, name, email, dupr_rating as "duprRating";
    `;
    const withoutT2 = `
      update players
      set
        name = coalesce($1, name),
        email = coalesce($2, email),
        dupr_rating = coalesce($3, dupr_rating)
      where id = $4
      returning id, name, email, dupr_rating as "duprRating";
    `;

    const updated = await queryPlayersScoped(
      withT2,
      [nameParam, emailParam, duprParam, tournamentId, id],
      withoutT2,
      [nameParam, emailParam, duprParam, id]
    );

    if (updated.rowCount === 0)
      return res.status(404).json({ error: `Player not found: ${id}` });

    const p = updated.rows[0];
    res.json({ ...p, duprTier: duprLabel(p.duprRating) });
  } catch (err) {
    console.error("PATCH /api/players/:id error:", err);
    res.status(500).json({ error: errToMessage(err) });
  }
});

app.delete("/api/players/:id", async (req, res) => {
  try {
    const tournamentId = await resolveTournamentId(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id))
      return res.status(400).json({ error: "Invalid player id." });

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

    const deleted = await queryPlayersScoped(
      withT,
      [tournamentId, id],
      withoutT,
      [id]
    );

    if (deleted.rowCount === 0)
      return res.status(404).json({ error: `Player not found: ${id}` });

    res.json({ ok: true, id });
  } catch (err) {
    console.error("DELETE /api/players/:id error:", err);
    res.status(500).json({ error: errToMessage(err) });
  }
});

/* -----------------------------
   Matches
------------------------------ */
app.get("/api/matches", async (req, res) => {
  try {
    const tournamentId = await resolveTournamentId(req);
    const phase = (req.query.phase ?? "").toString().trim();

    const params = [tournamentId];
    let where = "where tournament_id = $1";

    if (phase) {
      params.push(phase);
      where += " and phase = $2";
    }

    const r = await pool.query(
      `
      select
        code as "id",
        phase,
        team_a_id as "teamAId",
        team_b_id as "teamBId",
        score_a as "scoreA",
        score_b as "scoreB",
        winner_id as "winnerId",
        start_time as "startTime",
        court
      from matches
      ${where}
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
      params
    );

    res.json({ tournamentId, matches: r.rows });
  } catch (err) {
    console.error("GET /api/matches error:", err);
    res.status(500).json({ error: errToMessage(err) });
  }
});

/* -----------------------------
   Production: serve client build
------------------------------ */
if (process.env.NODE_ENV === "production") {
  const clientDistPath = path.join(__dirname, "..", "client", "dist");
  app.use(express.static(clientDistPath));

  // SPA fallback (only for non-API GET routes)
  app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(clientDistPath, "index.html"));
  });
}

/* -----------------------------
   Start server
------------------------------ */
bootLog("starting express server");

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on port ${PORT}`);
  if (process.env.BOOT_DEBUG === "1") {
    console.log("BOOT_DEBUG enabled (verbose startup logs)");
  }
});
