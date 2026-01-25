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
    return "Beginner (2.0–2.99)";
  }

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

      // 2) Link player to this tournament
      // NOTE: This assumes tournament_players has a unique constraint on (tournament_id, player_id).
      // If it doesn't, remove "on conflict do nothing" and we can prevent duplicates another way.
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

  return router;
};