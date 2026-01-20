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
    const trimmedEmail = String(email ?? "")
      .trim()
      .toLowerCase();
    const trimmedDupr = String(duprRating ?? "").trim();

    if (!trimmedName) {
      return res.status(400).json({ error: "Name is required." });
    }

    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      return res.status(400).json({ error: "Valid email is required." });
    }

    if (!Number.isInteger(tournamentId) || tournamentId <= 0) {
      return res
        .status(400)
        .json({ error: "Valid tournament id is required." });
    }

    // DUPR: allow blank, otherwise must be numeric
    const duprNum = trimmedDupr === "" ? null : Number(trimmedDupr);
    if (trimmedDupr !== "" && !Number.isFinite(duprNum)) {
      return res
        .status(400)
        .json({ error: "DUPR must be a number (or blank)." });
    }

    try {
      // 1) Ensure tournament exists
      const t = await pool.query("select id from tournaments where id = $1", [
        tournamentId,
      ]);
      if (t.rowCount === 0) {
        return res.status(404).json({ error: "Tournament not found." });
      }

      // 2) Upsert player by email
      // Prefer a unique constraint on players.email (recommended).
      // If your schema instead has a generated lower field (email_lower), see fallback below.
      let playerRow;

      try {
        const p = await pool.query(
          `
          insert into players (name, email, dupr_rating)
          values ($1, $2, $3)
          on conflict (email) do update
            set name = excluded.name,
                dupr_rating = excluded.dupr_rating
          returning id, name, email, dupr_rating as "duprRating";
          `,
          [trimmedName, trimmedEmail, duprNum]
        );
        playerRow = p.rows[0];
      } catch (err) {
        // Fallback: if your schema uses a unique index/constraint on email_lower instead of email
        // you can upsert via "email_lower" IF that constraint exists.
        // If neither exists, we do a safe "select then update/insert" fallback.
        if (err && (err.code === "42P10" || err.code === "42703")) {
          // 42P10 = invalid ON CONFLICT specification (no matching constraint)
          // 42703 = undefined_column (email_lower not present)
          const existing = await pool.query(
            `select id, name, email, dupr_rating as "duprRating" from players where lower(email) = $1 limit 1;`,
            [trimmedEmail]
          );

          if (existing.rowCount > 0) {
            const upd = await pool.query(
              `
              update players
              set name = $1,
                  dupr_rating = $2
              where id = $3
              returning id, name, email, dupr_rating as "duprRating";
              `,
              [trimmedName, duprNum, existing.rows[0].id]
            );
            playerRow = upd.rows[0];
          } else {
            const ins = await pool.query(
              `
              insert into players (name, email, dupr_rating)
              values ($1, $2, $3)
              returning id, name, email, dupr_rating as "duprRating";
              `,
              [trimmedName, trimmedEmail, duprNum]
            );
            playerRow = ins.rows[0];
          }
        } else {
          throw err;
        }
      }

      // 3) Attach player to tournament (join table)
      await pool.query(
        `
        insert into tournament_players (tournament_id, player_id)
        values ($1, $2)
        on conflict do nothing;
        `,
        [tournamentId, playerRow.id]
      );

      return res.json({
        tournamentId,
        player: playerRow,
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
