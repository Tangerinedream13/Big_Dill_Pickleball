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

function sanitizePublicPlayer(row, idx = null) {
  let name = "Player";

  if (row.useAliasesPublic && row.publicAlias) {
    name = row.publicAlias;
  } else if (row.showPlayerNamesPublic) {
    name = row.name;
  } else if (idx != null) {
    name = `Player ${idx + 1}`;
  }

  const out = {
    id: row.id,
    name,
  };

  if (row.showDuprPublic) {
    out.duprRating = row.duprRating;
    out.selfRating = row.selfRating;
    out.skillSource = row.skillSource;
  }

  return out;
}

async function getTournamentVisibilitySettings(tournamentId) {
  const r = await pool.query(
    `
    select
      id,
      name,
      is_public as "isPublic",
      show_player_names_public as "showPlayerNamesPublic",
      show_dupr_public as "showDuprPublic",
      use_aliases_public as "useAliasesPublic"
    from tournaments
    where id = $1
    limit 1;
    `,
    [tournamentId]
  );

  return r.rows[0] || null;
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

// GET /api/tournaments/:id/info
router.get("/:id/info", async (req, res) => {
  const tournamentId = parseId(req.params.id);
  if (!tournamentId) {
    return res.status(400).json({ error: "Invalid tournament id." });
  }

  try {
    const r = await pool.query(
      `
      select
        id,
        name,
        event_date as "eventDate",
        start_time as "startTime",
        end_time as "endTime",
        location_name as "locationName",
        address,
        details,
        parking_info as "parkingInfo",
        check_in_info as "checkInInfo",
        contact_email as "contactEmail",
        is_public as "isPublic",
        show_player_names_public as "showPlayerNamesPublic",
        show_dupr_public as "showDuprPublic",
        use_aliases_public as "useAliasesPublic"
      from tournaments
      where id = $1
      limit 1;
      `,
      [tournamentId]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ error: "Tournament not found." });
    }

    return res.json(r.rows[0]);
  } catch (err) {
    console.error("GET /api/tournaments/:id/info error:", err);
    return res.status(500).json({ error: errToMessage(err) });
  }
});

// GET /api/tournaments/:id/public-info
router.get("/:id/public-info", async (req, res) => {
  const tournamentId = parseId(req.params.id);
  if (!tournamentId) {
    return res.status(400).json({ error: "Invalid tournament id." });
  }

  try {
    const r = await pool.query(
      `
      select
        id,
        name,
        event_date as "eventDate",
        start_time as "startTime",
        end_time as "endTime",
        location_name as "locationName",
        address,
        details,
        parking_info as "parkingInfo",
        check_in_info as "checkInInfo",
        contact_email as "contactEmail",
        is_public as "isPublic"
      from tournaments
      where id = $1
      limit 1;
      `,
      [tournamentId]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ error: "Tournament not found." });
    }

    if (!r.rows[0].isPublic) {
      return res.status(403).json({ error: "This tournament is private." });
    }

    return res.json(r.rows[0]);
  } catch (err) {
    console.error("GET /api/tournaments/:id/public-info error:", err);
    return res.status(500).json({ error: errToMessage(err) });
  }
});

// PATCH /api/tournaments/:id/info
router.patch("/:id/info", async (req, res) => {
  const tournamentId = parseId(req.params.id);
  if (!tournamentId) {
    return res.status(400).json({ error: "Invalid tournament id." });
  }

  try {
    const {
      name,
      eventDate,
      startTime,
      endTime,
      locationName,
      address,
      details,
      parkingInfo,
      checkInInfo,
      contactEmail,
      isPublic,
      showPlayerNamesPublic,
      showDuprPublic,
      useAliasesPublic,
    } = req.body ?? {};

    const updated = await pool.query(
      `
      update tournaments
      set
        name = coalesce($1, name),
        event_date = coalesce($2, event_date),
        start_time = coalesce($3, start_time),
        end_time = coalesce($4, end_time),
        location_name = coalesce($5, location_name),
        address = coalesce($6, address),
        details = coalesce($7, details),
        parking_info = coalesce($8, parking_info),
        check_in_info = coalesce($9, check_in_info),
        contact_email = coalesce($10, contact_email),
        is_public = coalesce($11, is_public),
        show_player_names_public = coalesce($12, show_player_names_public),
        show_dupr_public = coalesce($13, show_dupr_public),
        use_aliases_public = coalesce($14, use_aliases_public)
      where id = $15
      returning
        id,
        name,
        event_date as "eventDate",
        start_time as "startTime",
        end_time as "endTime",
        location_name as "locationName",
        address,
        details,
        parking_info as "parkingInfo",
        check_in_info as "checkInInfo",
        contact_email as "contactEmail",
        is_public as "isPublic",
        show_player_names_public as "showPlayerNamesPublic",
        show_dupr_public as "showDuprPublic",
        use_aliases_public as "useAliasesPublic";
      `,
      [
        name ?? null,
        eventDate ?? null,
        startTime ?? null,
        endTime ?? null,
        locationName ?? null,
        address ?? null,
        details ?? null,
        parkingInfo ?? null,
        checkInInfo ?? null,
        contactEmail ?? null,
        isPublic ?? null,
        showPlayerNamesPublic ?? null,
        showDuprPublic ?? null,
        useAliasesPublic ?? null,
        tournamentId,
      ]
    );

    if (updated.rowCount === 0) {
      return res.status(404).json({ error: "Tournament not found." });
    }

    return res.json(updated.rows[0]);
  } catch (err) {
    console.error("PATCH /api/tournaments/:id/info error:", err);
    return res.status(500).json({ error: errToMessage(err) });
  }
});

// DELETE /api/tournaments/:id
router.delete("/:id", async (req, res) => {
  const tournamentId = parseId(req.params.id);
  if (!tournamentId) {
    return res.status(400).json({ error: "Invalid tournament id." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

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

    await client.query(`delete from matches where tournament_id = $1;`, [
      tournamentId,
    ]);

    const teamIdsRes = await client.query(
      `select team_id from tournament_teams where tournament_id = $1;`,
      [tournamentId]
    );
    const teamIds = teamIdsRes.rows.map((r) => r.team_id);

    await client.query(
      `delete from tournament_teams where tournament_id = $1;`,
      [tournamentId]
    );

    if (teamIds.length) {
      await client.query(
        `delete from team_players where team_id = any($1::int[]);`,
        [teamIds]
      );
      await client.query(`delete from teams where id = any($1::int[]);`, [
        teamIds,
      ]);
    }

    await client.query(
      `delete from tournament_players where tournament_id = $1;`,
      [tournamentId]
    );

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

/* ------------------ PUBLIC VIEWS ------------------ */

// GET /api/tournaments/:id/public-players
router.get("/:id/public-players", async (req, res) => {
  const tournamentId = parseId(req.params.id);
  if (!tournamentId) {
    return res.status(400).json({ error: "Invalid tournament id." });
  }

  try {
    const settings = await getTournamentVisibilitySettings(tournamentId);

    if (!settings) {
      return res.status(404).json({ error: "Tournament not found." });
    }

    if (!settings.isPublic) {
      return res.status(403).json({ error: "This tournament is private." });
    }

    const r = await pool.query(
      `
      select
        p.id,
        p.name,
        p.public_alias as "publicAlias",
        p.dupr_rating as "duprRating",
        p.self_rating as "selfRating",
        p.skill_source as "skillSource",
        $2::boolean as "showPlayerNamesPublic",
        $3::boolean as "showDuprPublic",
        $4::boolean as "useAliasesPublic"
      from tournament_players tp
      join players p on p.id = tp.player_id
      where tp.tournament_id = $1
      order by p.id desc;
      `,
      [
        tournamentId,
        settings.showPlayerNamesPublic,
        settings.showDuprPublic,
        settings.useAliasesPublic,
      ]
    );

    return res.json(r.rows.map((row, idx) => sanitizePublicPlayer(row, idx)));
  } catch (err) {
    console.error("GET /api/tournaments/:id/public-players error:", err);
    return res.status(500).json({ error: errToMessage(err) });
  }
});

// GET /api/tournaments/:id/public-matches
router.get("/:id/public-matches", async (req, res) => {
  const tournamentId = parseId(req.params.id);
  if (!tournamentId) {
    return res.status(400).json({ error: "Invalid tournament id." });
  }

  try {
    const settings = await getTournamentVisibilitySettings(tournamentId);

    if (!settings) {
      return res.status(404).json({ error: "Tournament not found." });
    }

    if (!settings.isPublic) {
      return res.status(403).json({ error: "This tournament is private." });
    }

    const matchesRes = await pool.query(
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
        court,
        status
      from matches
      where tournament_id = $1
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
      [tournamentId]
    );

    return res.json({
      tournamentId,
      isPublic: settings.isPublic,
      matches: matchesRes.rows.map((m) => ({
        ...m,
        status: m.status || (m.winnerId ? "completed" : "pending"),
      })),
    });
  } catch (err) {
    console.error("GET /api/tournaments/:id/public-matches error:", err);
    return res.status(500).json({ error: errToMessage(err) });
  }
});

/* ------------------ TOURNAMENT DOUBLES TEAMS ------------------ */

// GET /api/tournaments/:id/teams
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
              'duprRating', p.dupr_rating,
              'selfRating', p.self_rating,
              'skillSource', p.skill_source,
              'publicAlias', p.public_alias
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

// POST /api/tournaments/:id/teams
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

    let finalName = requestedName;
    if (!finalName) {
      const n = await client.query(
        `select count(*)::int as c from tournament_teams where tournament_id = $1;`,
        [tournamentId]
      );
      finalName = `T-${tournamentId}-Team-${(n.rows?.[0]?.c ?? 0) + 1}`;
    }

    const teamRow = await client.query(
      `insert into teams(name) values ($1) returning id, name;`,
      [finalName]
    );
    const teamId = teamRow.rows[0].id;

    await client.query(
      `insert into team_players(team_id, player_id) values ($1, $2), ($1, $3);`,
      [teamId, playerAId, playerBId]
    );

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
router.delete("/:id/teams/:teamId", async (req, res) => {
  const tournamentId = parseId(req.params.id);
  const teamId = parseId(req.params.teamId);
  if (!tournamentId)
    return res.status(400).json({ error: "Invalid tournament id." });
  if (!teamId) return res.status(400).json({ error: "Invalid team id." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `delete from tournament_teams where tournament_id = $1 and team_id = $2;`,
      [tournamentId, teamId]
    );

    await client.query(`delete from team_players where team_id = $1;`, [
      teamId,
    ]);

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
