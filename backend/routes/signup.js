// backend/routes/signup.js
const express = require("express");

module.exports = (pool) => {
  const router = express.Router();

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
    if (dupr >= 2.0) return "Beginner (2.0–2.99)";
    return "New (under 2.0)";
  }

  /* -----------------------------
     Signup (public)
  ------------------------------ */

  // POST /api/tournaments/:tid/signup
  router.post("/tournaments/:tid/signup", async (req, res) => {
    const tid = Number(req.params.tid);
    if (!Number.isInteger(tid) || tid <= 0) {
      return res.status(400).json({ error: "Invalid tournament id." });
    }

    const name = (req.body?.name ?? "").toString().trim();
    const email = (req.body?.email ?? "").toString().trim().toLowerCase();
    const dupr = parseDupr(req.body?.duprRating);

    if (!name) return res.status(400).json({ error: "Name is required." });
    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Valid email is required." });
    }
    if (Number.isNaN(dupr)) {
      return res.status(400).json({ error: "DUPR must be a number." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1) Find existing player by email (case-insensitive)
      const found = await client.query(
        `
        select id, name, email, dupr_rating as "duprRating"
        from players
        where lower(email) = $1
        limit 1;
        `,
        [email]
      );

      let player;

      if (found.rowCount > 0) {
        // Optional: keep player info updated to latest signup values
        const updated = await client.query(
          `
          update players
          set
            name = $1,
            dupr_rating = $2
          where id = $3
          returning id, name, email, dupr_rating as "duprRating";
          `,
          [name, dupr, found.rows[0].id]
        );
        player = updated.rows[0];
      } else {
        const inserted = await client.query(
          `
          insert into players (name, email, dupr_rating)
          values ($1, $2, $3)
          returning id, name, email, dupr_rating as "duprRating";
          `,
          [name, email, dupr]
        );
        player = inserted.rows[0];
      }

      // 2) Link player to this tournament (idempotent)
      // Assumes a unique constraint on (tournament_id, player_id)
      await client.query(
        `
        insert into tournament_players (tournament_id, player_id)
        values ($1, $2)
        on conflict do nothing;
        `,
        [tid, player.id]
      );

      await client.query("COMMIT");

      return res.status(201).json({
        ...player,
        inTeam: false,
        duprTier: duprLabel(player.duprRating),
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("signup error:", err);
      return res.status(500).json({ error: err?.message ?? String(err) });
    } finally {
      client.release();
    }
  });

  /* -----------------------------
     Tournament-scoped Players (admin UI)
     These keep PlayersPage tournament-scoped and prevent "leakage"
  ------------------------------ */

  // POST /api/tournaments/:tid/players
  // Admin-add a player to a specific tournament (email optional)
  router.post("/tournaments/:tid/players", async (req, res) => {
    const tid = Number(req.params.tid);
    if (!Number.isInteger(tid) || tid <= 0) {
      return res.status(400).json({ error: "Invalid tournament id." });
    }

    const name = (req.body?.name ?? "").toString().trim();
    const emailRaw = (req.body?.email ?? "").toString().trim();
    const email = emailRaw ? emailRaw.toLowerCase() : null;
    const dupr = parseDupr(req.body?.duprRating);

    if (!name) return res.status(400).json({ error: "Name is required." });
    if (email && !email.includes("@")) {
      return res
        .status(400)
        .json({ error: "Valid email is required (or leave blank)." });
    }
    if (Number.isNaN(dupr)) {
      return res.status(400).json({ error: "DUPR must be a number." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      let player;

      if (email) {
        // De-dupe by email (same behavior as signup)
        const found = await client.query(
          `
          select id, name, email, dupr_rating as "duprRating"
          from players
          where lower(email) = $1
          limit 1;
          `,
          [email]
        );

        if (found.rowCount > 0) {
          const updated = await client.query(
            `
            update players
            set name = $1,
                dupr_rating = $2
            where id = $3
            returning id, name, email, dupr_rating as "duprRating";
            `,
            [name, dupr, found.rows[0].id]
          );
          player = updated.rows[0];
        } else {
          const inserted = await client.query(
            `
            insert into players (name, email, dupr_rating)
            values ($1, $2, $3)
            returning id, name, email, dupr_rating as "duprRating";
            `,
            [name, email, dupr]
          );
          player = inserted.rows[0];
        }
      } else {
        // No email -> create a new player record
        const inserted = await client.query(
          `
          insert into players (name, email, dupr_rating)
          values ($1, null, $2)
          returning id, name, email, dupr_rating as "duprRating";
          `,
          [name, dupr]
        );
        player = inserted.rows[0];
      }

      // Link to this tournament (idempotent)
      await client.query(
        `
        insert into tournament_players (tournament_id, player_id)
        values ($1, $2)
        on conflict do nothing;
        `,
        [tid, player.id]
      );

      await client.query("COMMIT");

      return res.status(201).json({
        ...player,
        inTeam: false,
        duprTier: duprLabel(player.duprRating),
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("POST /api/tournaments/:tid/players error:", err);
      return res.status(500).json({ error: err?.message ?? String(err) });
    } finally {
      client.release();
    }
  });

  // DELETE /api/tournaments/:tid/players/:pid
  // Removes a player from THIS tournament only (does NOT delete the global player record)
  router.delete("/tournaments/:tid/players/:pid", async (req, res) => {
    const tid = Number(req.params.tid);
    const pid = Number(req.params.pid);

    if (!Number.isInteger(tid) || tid <= 0) {
      return res.status(400).json({ error: "Invalid tournament id." });
    }
    if (!Number.isInteger(pid) || pid <= 0) {
      return res.status(400).json({ error: "Invalid player id." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Safety: block if player is currently on a team in this tournament
      const inTeam = await client.query(
        `
        select 1
        from team_players tp
        join tournament_teams tt on tt.team_id = tp.team_id
        where tt.tournament_id = $1
          and tp.player_id = $2
        limit 1;
        `,
        [tid, pid]
      );

      if (inTeam.rowCount > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error:
            "Player is on a team in this tournament. Remove them from the team first.",
        });
      }

      const del = await client.query(
        `
        delete from tournament_players
        where tournament_id = $1 and player_id = $2
        returning player_id;
        `,
        [tid, pid]
      );

      await client.query("COMMIT");

      if (del.rowCount === 0) {
        return res
          .status(404)
          .json({ error: "Player was not in this tournament." });
      }

      return res.json({
        ok: true,
        tournamentId: String(tid),
        playerId: String(pid),
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("DELETE /api/tournaments/:tid/players/:pid error:", err);
      return res.status(500).json({ error: err?.message ?? String(err) });
    } finally {
      client.release();
    }
  });

  return router;
};
