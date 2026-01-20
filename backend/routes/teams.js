// backend/routes/teams.js
const express = require("express");
const pool = require("../db");

const router = express.Router();

/* -----------------------------
   Helpers
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

function normalizeName(s) {
  return String(s ?? "").trim();
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function makeTeamName(aName, bName) {
  return `${aName || "Player A"} / ${bName || "Player B"}`;
}

/**
 * Fair DUPR pairing strategy: sort by dupr desc (null last),
 * then pair top with bottom, next top with next bottom, etc.
 * Example with 10: [1..10] -> (1,10), (2,9), (3,8)...
 */
function pairByDupr(players) {
  const sorted = [...players].sort((p1, p2) => {
    const a = p1.duprRating;
    const b = p2.duprRating;

    const aNull = a === null || a === undefined;
    const bNull = b === null || b === undefined;

    if (aNull && bNull) return 0;
    if (aNull) return 1; // nulls last
    if (bNull) return -1;

    // higher dupr first
    return Number(b) - Number(a);
  });

  const pairs = [];
  let i = 0;
  let j = sorted.length - 1;
  while (i < j) {
    pairs.push([sorted[i], sorted[j]]);
    i++;
    j--;
  }
  const leftover = i === j ? sorted[i] : null;
  return { pairs, leftover };
}

function pairRandom(players) {
  const copy = [...players];
  shuffleInPlace(copy);

  const pairs = [];
  for (let i = 0; i + 1 < copy.length; i += 2) {
    pairs.push([copy[i], copy[i + 1]]);
  }
  const leftover = copy.length % 2 === 1 ? copy[copy.length - 1] : null;
  return { pairs, leftover };
}

/* -----------------------------
   GET /api/teams?tournamentId=...
   Return teams with players
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

    if (tRes.rowCount === 0) return res.json([]);

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
      id: String(t.id),
      name: t.name,
      seed: t.seed,
      players: playersByTeam.get(String(t.id)) ?? [],
    }));

    return res.json(out);
  } catch (err) {
    console.error("GET /api/teams error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Failed to load teams." });
  }
});

/* -----------------------------
   POST /api/teams
   Manual create
   Body: { tournamentId, playerAId, playerBId, name? }
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
      `select id, name, dupr_rating as "duprRating" from players where id = any($1::bigint[])`,
      [[playerAId, playerBId]]
    );
    const nameMap = new Map(pNames.rows.map((r) => [String(r.id), r.name]));
    const defaultName = makeTeamName(
      nameMap.get(String(playerAId)),
      nameMap.get(String(playerBId))
    );
    const teamName = normalizeName(req.body?.name) || defaultName;

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

      // link team to tournament (seed null for manual)
      await pool.query(
        `insert into tournament_teams (tournament_id, team_id) values ($1, $2);`,
        [tournamentId, teamId]
      );

      await pool.query("commit");

      return res.status(201).json({
        id: String(teamId),
        name: teamIns.rows[0].name,
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
    return res
      .status(500)
      .json({ error: err.message || "Failed to create team." });
  }
});

/* -----------------------------
   PATCH /api/teams/:id
   Rename a team (SAFE even if matches exist)
   Body: { tournamentId?, name }
------------------------------ */
router.patch("/:id", async (req, res) => {
  try {
    const tournamentId = await resolveTournamentId(req);
    const teamId = Number(req.params.id);
    const name = (req.body?.name ?? "").toString().trim();

    if (!Number.isInteger(teamId) || teamId <= 0) {
      return res.status(400).json({ error: "Invalid team id." });
    }
    if (!name) {
      return res.status(400).json({ error: "Team name is required." });
    }

    // Ensure this team belongs to this tournament
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

    // Rename the team (safe even if matches exist)
    const updated = await pool.query(
      `
      update teams
      set name = $1
      where id = $2
      returning id, name;
      `,
      [name, teamId]
    );

    return res.json({ ok: true, team: updated.rows[0], tournamentId });
  } catch (err) {
    console.error("PATCH /api/teams/:id error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Failed to rename team." });
  }
});

/* -----------------------------
   POST /api/teams/generate
   Auto-generate doubles teams from tournament players

   Body:
   {
     tournamentId?: number,
     strategy?: "dupr" | "random",
     force?: boolean   // if true, delete existing tournament teams first (ONLY if no matches exist)
   }

   Notes:
   - If matches already exist, we block generation (409) to avoid FK issues.
   - If existing teams exist and force is not true, we block (409).
------------------------------ */
router.post("/generate", async (req, res) => {
  try {
    const tournamentId = await resolveTournamentId(req);
    const strategy = (req.body?.strategy ?? "dupr").toString().toLowerCase();
    const force = Boolean(req.body?.force);

    // 1) If matches exist, don't allow team regeneration
    const matchesRes = await pool.query(
      `
      select 1
      from matches
      where tournament_id = $1
      limit 1;
      `,
      [tournamentId]
    );
    if (matchesRes.rowCount > 0) {
      return res.status(409).json({
        error:
          "Matches already exist for this tournament. Reset matches before generating teams.",
      });
    }

    // 2) See if tournament already has teams
    const existingTeamsRes = await pool.query(
      `select team_id from tournament_teams where tournament_id = $1;`,
      [tournamentId]
    );

    if (existingTeamsRes.rowCount > 0 && !force) {
      return res.status(409).json({
        error:
          "Teams already exist for this tournament. Delete teams (or use force:true) before generating.",
      });
    }

    // 3) Load players who are signed up for this tournament
    const playersRes = await pool.query(
      `
      select p.id, p.name, p.dupr_rating as "duprRating"
      from tournament_players tp
      join players p on p.id = tp.player_id
      where tp.tournament_id = $1
      order by p.id asc;
      `,
      [tournamentId]
    );

    const players = playersRes.rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      duprRating: r.duprRating,
    }));

    if (players.length < 2) {
      return res.status(400).json({
        error: "Need at least 2 players signed up to generate doubles teams.",
      });
    }

    // 4) Pair them
    let pairs, leftover;
    if (strategy === "random") {
      ({ pairs, leftover } = pairRandom(players));
    } else {
      ({ pairs, leftover } = pairByDupr(players));
    }

    if (pairs.length === 0) {
      return res.status(400).json({
        error: "Not enough players to form teams.",
      });
    }

    await pool.query("begin");
    try {
      // If force: delete existing tournament_teams and related team_players/teams
      // (matches already checked = none)
      if (existingTeamsRes.rowCount > 0 && force) {
        const teamIds = existingTeamsRes.rows.map((r) => r.team_id);

        await pool.query(
          `delete from tournament_teams where tournament_id = $1;`,
          [tournamentId]
        );

        await pool.query(
          `delete from team_players where team_id = any($1::bigint[]);`,
          [teamIds]
        );

        await pool.query(`delete from teams where id = any($1::bigint[]);`, [
          teamIds,
        ]);
      }

      const createdTeams = [];

      // Create teams for each pair
      for (let idx = 0; idx < pairs.length; idx++) {
        const [a, b] = pairs[idx];

        const teamName = makeTeamName(a.name, b.name);

        const teamIns = await pool.query(
          `insert into teams (name) values ($1) returning id, name;`,
          [teamName]
        );
        const teamId = teamIns.rows[0].id;

        await pool.query(
          `insert into team_players (team_id, player_id) values ($1,$2), ($1,$3);`,
          [teamId, a.id, b.id]
        );

        await pool.query(
          `insert into tournament_teams (tournament_id, team_id, seed) values ($1, $2, $3);`,
          [tournamentId, teamId, idx + 1]
        );

        createdTeams.push({
          id: String(teamId),
          name: teamIns.rows[0].name,
          seed: idx + 1,
          players: [
            { id: a.id, name: a.name, duprRating: a.duprRating },
            { id: b.id, name: b.name, duprRating: b.duprRating },
          ],
        });
      }

      await pool.query("commit");

      return res.status(201).json({
        tournamentId,
        strategy,
        teamsCreated: createdTeams.length,
        leftoverPlayer: leftover
          ? {
              id: leftover.id,
              name: leftover.name,
              duprRating: leftover.duprRating,
            }
          : null,
        teams: createdTeams,
      });
    } catch (e) {
      await pool.query("rollback");
      throw e;
    }
  } catch (err) {
    console.error("POST /api/teams/generate error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Failed to generate teams." });
  }
});

/* -----------------------------
   DELETE /api/teams/:id
   Deletes a team ONLY if it is not referenced by matches.
------------------------------ */
router.delete("/:id", async (req, res) => {
  try {
    const tournamentId = await resolveTournamentId(req);
    const teamId = Number(req.params.id);
    if (!Number.isInteger(teamId) || teamId <= 0) {
      return res.status(400).json({ error: "Invalid team id." });
    }

    // If referenced by matches, block
    const used = await pool.query(
      `
      select 1
      from matches
      where tournament_id = $1
        and (team_a_id = $2 or team_b_id = $2 or winner_id = $2)
      limit 1;
      `,
      [tournamentId, teamId]
    );
    if (used.rowCount > 0) {
      return res.status(409).json({
        error:
          "That team is used in matches. Reset matches before deleting the team.",
      });
    }

    await pool.query("begin");
    try {
      // remove tournament link first
      await pool.query(
        `delete from tournament_teams where tournament_id = $1 and team_id = $2;`,
        [tournamentId, teamId]
      );

      // remove team_players
      await pool.query(`delete from team_players where team_id = $1;`, [
        teamId,
      ]);

      // remove team
      const del = await pool.query(
        `delete from teams where id = $1 returning id;`,
        [teamId]
      );

      await pool.query("commit");

      if (del.rowCount === 0) {
        return res.status(404).json({ error: "Team not found." });
      }

      return res.json({ ok: true, id: teamId, tournamentId });
    } catch (e) {
      await pool.query("rollback");
      throw e;
    }
  } catch (err) {
    console.error("DELETE /api/teams/:id error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Failed to delete team." });
  }
});

module.exports = router;
