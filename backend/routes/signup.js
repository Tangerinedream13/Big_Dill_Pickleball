// backend/routes/signup.js
const express = require("express");

module.exports = function signupRoutes(pool) {
  const router = express.Router();

  // POST /api/tournaments/:id/signup
  // Body: { name, email, duprRating }
  router.post("/tournaments/:id/signup", async (req, res) => {
    const tournamentId = Number(req.params.id);
    const { name, email, duprRating } = req.body ?? {};

    const trimmedName = String(name ?? "").trim();
    const trimmedEmail = String(email ?? "").trim().toLowerCase();
    const trimmedDupr = String(duprRating ?? "").trim();

    if (!trimmedName) {
      return res.status(400).json({ error: "Name is required." });
    }

    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      return res.status(400).json({ error: "Valid email is required." });
    }

    if (!Number.isInteger(tournamentId)) {
      return res.status(400).json({ error: "Valid tournament id is required." });
    }

    // DUPR: allow blank, otherwise must be numeric
    const duprNum =
      trimmedDupr === "" ? null : Number(trimmedDupr);

    if (trimmedDupr !== "" && !Number.isFinite(duprNum)) {
      return res
        .status(400)
        .json({ error: "DUPR must be a number (or blank)." });
    }

    try {
      // 1️⃣ Ensure tournament exists
      const t = await pool.query(
        "select id from tournaments where id = $1",
        [tournamentId]
      );

      if (t.rowCount === 0) {
        return res.status(404).json({ error: "Tournament not found." });
      }

      // 2️⃣ Upsert player by email (GLOBAL player record)
      const p = await pool.query(
        `
        insert into players (name, email, dupr_rating)
        values ($1, $2, $3)
        on conflict (email_lower) do update
          set name = excluded.name,
              dupr_rating = excluded.dupr_rating
        returning id, name, email, dupr_rating;
        `,
        [trimmedName, trimmedEmail, duprNum]
      );

      const player = p.rows[0];

      // 3️⃣ Attach player to tournament (JOIN TABLE)
      await pool.query(
        `
        insert into tournament_players (tournament_id, player_id)
        values ($1, $2)
        on conflict do nothing;
        `,
        [tournamentId, player.id]
      );

      return res.json({
        tournamentId,
        player: {
          id: player.id,
          name: player.name,
          email: player.email,
          duprRating: player.dupr_rating,
        },
      });
    } catch (e) {
      console.error("Signup failed:", e);

      const msg =
        process.env.NODE_ENV === "production"
          ? "Signup failed."
          : e?.message || e?.detail || "Signup failed.";

      return res.status(500).json({ error: msg });
    }
  });

  return router;
};