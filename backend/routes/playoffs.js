// backend/routes/playoffs.js
const express = require("express");

module.exports = function playoffsRoutes({ pool, engine, helpers }) {
  const router = express.Router();

  const {
    errToMessage,
    resolveTournamentId,
    getTeamsForTournament,
    getMatchesForTournamentByPhase,
    validatePickleballScore,
    computePlacementsFromMatches,
    decoratePlacementsWithTeamNames,
  } = helpers;

  router.post("/reset", async (req, res) => {
    try {
      const tournamentId = await resolveTournamentId(req);

      const result = await pool.query(
        `
        delete from matches
        where tournament_id = $1
          and phase in ('SF', 'FINAL', 'THIRD');
        `,
        [tournamentId]
      );

      return res.json({ ok: true, tournamentId, deleted: result.rowCount || 0 });
    } catch (err) {
      console.error("Playoffs reset error:", err);
      res.status(500).json({ error: errToMessage(err) });
    }
  });

  router.post("/generate", async (req, res) => {
    try {
      const tournamentId = await resolveTournamentId(req);

      const teams = await getTeamsForTournament(tournamentId);
      const rrMatches = await getMatchesForTournamentByPhase(tournamentId, ["RR"]);

      const missing = rrMatches.filter((m) => !m.winnerId).map((m) => m.id);
      if (missing.length > 0) {
        return res.status(409).json({
          error: `Round robin isn't complete yet. Missing winners for: ${missing.join(", ")}`
        });
      }

      const standings = engine.computeStandings(
        teams.map((t) => String(t.id)),
        rrMatches
      );

      const top4 = standings.slice(0, 4).map((s) => String(s.teamId));
      if (top4.length < 4) {
        return res.status(409).json({ error: "Need at least 4 teams for playoffs." });
      }

      const [seed1, seed2, seed3, seed4] = top4;

      await pool.query(
        `delete from matches where tournament_id = $1 and phase in ('SF','FINAL','THIRD');`,
        [tournamentId]
      );

      await pool.query(
        `
        insert into matches (tournament_id, code, phase, team_a_id, team_b_id)
        values
          ($1, 'SF1', 'SF', $2, $3),
          ($1, 'SF2', 'SF', $4, $5)
        `,
        [tournamentId, seed1, seed4, seed2, seed3]
      );

      const semis = await getMatchesForTournamentByPhase(tournamentId, ["SF"]);
      return res.json({ ok: true, tournamentId, semis });
    } catch (err) {
      console.error("Playoffs generate error:", err);
      res.status(500).json({ error: errToMessage(err) });
    }
  });

  router.post("/semis/:id/score", async (req, res) => {
    try {
      const tournamentId = await resolveTournamentId(req);
      const id = String(req.params.id || "").toUpperCase();

      if (id !== "SF1" && id !== "SF2") {
        return res.status(400).json({ error: "Invalid semifinal id. Use SF1 or SF2." });
      }

      const { scoreA, scoreB } = req.body;

      const mRes = await pool.query(
        `
        select team_a_id as "teamAId", team_b_id as "teamBId"
        from matches
        where tournament_id = $1 and phase = 'SF' and code = $2
        `,
        [tournamentId, id]
      );

      if (mRes.rowCount === 0) {
        return res.status(404).json({ error: `Semifinal not found: ${id}` });
      }

      const m = mRes.rows[0];

      const msg = validatePickleballScore(scoreA, scoreB, { playTo: 11, winBy: 2 });
      if (msg) return res.status(400).json({ error: msg });

      const winnerId = scoreA > scoreB ? m.teamAId : m.teamBId;

      await pool.query(
        `
        update matches
        set score_a = $1, score_b = $2, winner_id = $3
        where tournament_id = $4 and phase = 'SF' and code = $5
        `,
        [scoreA, scoreB, winnerId, tournamentId, id]
      );

      const teams = await getTeamsForTournament(tournamentId);
      const rrMatches = await getMatchesForTournamentByPhase(tournamentId, ["RR"]);
      const semis = await getMatchesForTournamentByPhase(tournamentId, ["SF"]);
      const finals = await getMatchesForTournamentByPhase(tournamentId, ["FINAL", "THIRD"]);
      const standings = engine.computeStandings(teams.map((t) => t.id), rrMatches);

      const placementsRaw = computePlacementsFromMatches({ semis, finals });
      const placements = decoratePlacementsWithTeamNames(placementsRaw, teams);

      return res.json({ ok: true, tournamentId, teams, rrMatches, standings, semis, finals, placements });
    } catch (err) {
      console.error("Semis score error:", err);
      res.status(500).json({ error: errToMessage(err) });
    }
  });

  return router;
};