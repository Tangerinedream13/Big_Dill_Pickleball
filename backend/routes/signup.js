const express = require("express");

module.exports = (pool) => {
  const router = express.Router();

  const SELF_RATING_TO_DUPR = {
    beginner: 2.5,
    lower_intermediate: 3.0,
    intermediate: 3.5,
    advanced: 4.0,
    very_advanced: 4.5,
  };

  function parseDupr(v) {
    if (v === null || v === undefined || v === "") return null;
    const num = Number(v);
    if (!Number.isFinite(num)) return NaN;
    return Math.round(num * 100) / 100;
  }

  function validateDuprRange(dupr) {
    if (dupr === null) return null;
    if (Number.isNaN(dupr)) return "DUPR must be a number.";
    if (dupr < 2.0 || dupr > 6.99) {
      return "DUPR must be between 2.00 and 6.99 (or leave it blank).";
    }
    return null;
  }

  function normalizeSelfRating(v) {
    const s = (v ?? "").toString().trim().toLowerCase();
    return s || null;
  }

  function deriveSkillFields({ dupr, selfRating }) {
    if (dupr !== null) {
      return {
        duprRating: dupr,
        selfRating: null,
        skillSource: "dupr",
      };
    }

    const normalized = normalizeSelfRating(selfRating);
    if (!normalized || !(normalized in SELF_RATING_TO_DUPR)) {
      return {
        error:
          "If DUPR is blank, choose a self-rating: beginner, lower_intermediate, intermediate, advanced, or very_advanced.",
      };
    }

    return {
      duprRating: SELF_RATING_TO_DUPR[normalized],
      selfRating: normalized,
      skillSource: "self_rating",
    };
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
    const selfRating = req.body?.selfRating;

    if (!name) return res.status(400).json({ error: "Name is required." });

    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Valid email is required." });
    }

    const duprError = validateDuprRange(dupr);
    if (duprError) {
      return res.status(400).json({ error: duprError });
    }

    const skill = deriveSkillFields({ dupr, selfRating });
    if (skill.error) {
      return res.status(400).json({ error: skill.error });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const found = await client.query(
        `
        select
          id,
          name,
          email,
          dupr_rating as "duprRating",
          self_rating as "selfRating",
          skill_source as "skillSource"
        from players
        where lower(email) = $1
        limit 1;
        `,
        [email]
      );

      let player;

      if (found.rowCount > 0) {
        const updated = await client.query(
          `
          update players
          set
            name = $1,
            dupr_rating = $2,
            self_rating = $3,
            skill_source = $4
          where id = $5
          returning
            id,
            name,
            email,
            dupr_rating as "duprRating",
            self_rating as "selfRating",
            skill_source as "skillSource";
          `,
          [
            name,
            skill.duprRating,
            skill.selfRating,
            skill.skillSource,
            found.rows[0].id,
          ]
        );
        player = updated.rows[0];
      } else {
        const inserted = await client.query(
          `
          insert into players (name, email, dupr_rating, self_rating, skill_source)
          values ($1, $2, $3, $4, $5)
          returning
            id,
            name,
            email,
            dupr_rating as "duprRating",
            self_rating as "selfRating",
            skill_source as "skillSource";
          `,
          [name, email, skill.duprRating, skill.selfRating, skill.skillSource]
        );
        player = inserted.rows[0];
      }

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
  ------------------------------ */

  // POST /api/tournaments/:tid/players
  router.post("/tournaments/:tid/players", async (req, res) => {
    const tid = Number(req.params.tid);
    if (!Number.isInteger(tid) || tid <= 0) {
      return res.status(400).json({ error: "Invalid tournament id." });
    }

    const name = (req.body?.name ?? "").toString().trim();
    const emailRaw = (req.body?.email ?? "").toString().trim();
    const email = emailRaw ? emailRaw.toLowerCase() : null;
    const dupr = parseDupr(req.body?.duprRating);
    const selfRating = req.body?.selfRating;

    if (!name) return res.status(400).json({ error: "Name is required." });
    if (email && !email.includes("@")) {
      return res
        .status(400)
        .json({ error: "Valid email is required (or leave blank)." });
    }
    const duprError = validateDuprRange(dupr);
    if (duprError) {
      return res.status(400).json({ error: duprError });
    }

    const skill = deriveSkillFields({ dupr, selfRating });
    if (skill.error) {
      return res.status(400).json({ error: skill.error });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      let player;

      if (email) {
        const found = await client.query(
          `
          select
            id,
            name,
            email,
            dupr_rating as "duprRating",
            self_rating as "selfRating",
            skill_source as "skillSource"
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
            set
              name = $1,
              dupr_rating = $2,
              self_rating = $3,
              skill_source = $4
            where id = $5
            returning
              id,
              name,
              email,
              dupr_rating as "duprRating",
              self_rating as "selfRating",
              skill_source as "skillSource";
            `,
            [
              name,
              skill.duprRating,
              skill.selfRating,
              skill.skillSource,
              found.rows[0].id,
            ]
          );
          player = updated.rows[0];
        } else {
          const inserted = await client.query(
            `
            insert into players (name, email, dupr_rating, self_rating, skill_source)
            values ($1, $2, $3, $4, $5)
            returning
              id,
              name,
              email,
              dupr_rating as "duprRating",
              self_rating as "selfRating",
              skill_source as "skillSource";
            `,
            [name, email, skill.duprRating, skill.selfRating, skill.skillSource]
          );
          player = inserted.rows[0];
        }
      } else {
        const inserted = await client.query(
          `
          insert into players (name, email, dupr_rating, self_rating, skill_source)
          values ($1, null, $2, $3, $4)
          returning
            id,
            name,
            email,
            dupr_rating as "duprRating",
            self_rating as "selfRating",
            skill_source as "skillSource";
          `,
          [name, skill.duprRating, skill.selfRating, skill.skillSource]
        );
        player = inserted.rows[0];
      }

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
