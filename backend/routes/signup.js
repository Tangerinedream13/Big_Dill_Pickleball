// backend/routes/signup.js  (CommonJS to match server.js)

const express = require("express");

module.exports = function signupRoutes(pool) {
  const router = express.Router();

  // POST /api/tournaments/:id/signup
  // Body: { name, email, duprRating }
  router.post("/tournaments/:id/signup", async (req, res) => {
    const tournamentId = String(req.params.id);
    const { name, email, duprRating } = req.body ?? {};

    const trimmedName = String(name ?? "").trim();
    const trimmedEmail = String(email ?? "").trim().toLowerCase();

    // allow blank dupr => null
    const duprRaw = String(duprRating ?? "").trim();
    const duprNum = duprRaw === "" ? null : Number(duprRaw);

    if (!trimmedName) {
      return res.status(400).json({ error: "Name is required." });
    }
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      return res.status(400).json({ error: "Valid email is required." });
    }
    if (!tournamentId) {
      return res.status(400).json({ error: "Tournament id is required." });
    }
    if (duprNum !== null && (!Number.isFinite(duprNum) || duprNum < 2.0 || duprNum > 6.99)) {
      return res
        .status(400)
        .json({ error: "DUPR must be between 2.00 and 6.99 (or blank)." });
    }

    try {
      // Ensure tournament exists
      const t = await pool.query("select id from tournaments where id = $1", [
        tournamentId,
      ]);
      if (t.rowCount === 0) {
        return res.status(404).json({ error: "Tournament not found." });
      }

      // Insert player INTO THIS tournament's player list
      // (this matches your existing players routes which scope by tournament_id)
      const p = await pool.query(
        `
        insert into players (tournament_id, name, email, dupr_rating)
        values ($1, $2, $3, $4)
        on conflict (tournament_id, email_lower)
        do update set
          name = excluded.name,
          email = excluded.email,
          dupr_rating = excluded.dupr_rating
        returning id, name, email, dupr_rating as "duprRating";
        `,
        [tournamentId, trimmedName, trimmedEmail, duprNum]
      );

      return res.json({ tournamentId, player: p.rows[0] });
    } catch (e) {
      console.error("Signup failed:", e);
      return res.status(500).json({ error: "Signup failed." });
    }
  });

  return router;
};