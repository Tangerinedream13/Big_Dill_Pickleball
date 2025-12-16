/**
 * Big Dill Pickleball Round Robin + Playoffs Engine (pure JS)
 *
 * Assumptions:
 * - No ties (scoreA !== scoreB). If ties are possible, handle that separately.
 * - Teams are doubles pairs; represented by { id, name } at minimum.
 */

function shuffle(array, rng = Math.random) {
    const a = [...array];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  
  function pairKey(aId, bId) {
    return aId < bId ? `${aId}-${bId}` : `${bId}-${aId}`;
  }
  
  /**
   * Generate RR matchups so each team plays `gamesPerTeam` matches.
   * Greedy + shuffle. Works well for league-night scheduling.
   *
   * @param {Array<{id: number|string, name: string}>} teams
   * @param {number} gamesPerTeam (default 4)
   * @param {object} [options]
   * @param {number} [options.maxAttempts=200] - retries with reshuffle if stuck
   * @returns {Array<{id: string, phase:'RR', teamAId, teamBId, scoreA:null, scoreB:null, winnerId:null}>}
   */
  function generateRoundRobinSchedule(teams, gamesPerTeam = 4, options = {}) {
    const maxAttempts = options.maxAttempts ?? 200;
  
    if (teams.length < 2) throw new Error("Need at least 2 teams.");
    if (gamesPerTeam < 1) throw new Error("gamesPerTeam must be >= 1");
    if (gamesPerTeam > teams.length - 1) {
      throw new Error(
        `gamesPerTeam=${gamesPerTeam} is too large for ${teams.length} teams (max is ${teams.length - 1}).`
      );
    }
  
    const teamIds = teams.map((t) => t.id);
  
    // All possible unique pairings
    const allPairs = [];
    for (let i = 0; i < teamIds.length; i++) {
      for (let j = i + 1; j < teamIds.length; j++) {
        allPairs.push([teamIds[i], teamIds[j]]);
      }
    }
  
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const gamesPlayed = new Map(teamIds.map((id) => [id, 0]));
      const usedPairs = new Set();
      const schedule = [];
  
      const pairs = shuffle(allPairs);
  
      for (const [aId, bId] of pairs) {
        if (gamesPlayed.get(aId) >= gamesPerTeam) continue;
        if (gamesPlayed.get(bId) >= gamesPerTeam) continue;
  
        const key = pairKey(aId, bId);
        if (usedPairs.has(key)) continue;
  
        usedPairs.add(key);
        gamesPlayed.set(aId, gamesPlayed.get(aId) + 1);
        gamesPlayed.set(bId, gamesPlayed.get(bId) + 1);
  
        schedule.push({
          id: `RR-${schedule.length + 1}`,
          phase: "RR",
          teamAId: aId,
          teamBId: bId,
          scoreA: null,
          scoreB: null,
          winnerId: null,
        });
  
        // Early exit if everyone is full
        const done = teamIds.every((id) => gamesPlayed.get(id) === gamesPerTeam);
        if (done) break;
      }
  
      const complete = teamIds.every((id) => gamesPlayed.get(id) === gamesPerTeam);
      if (complete) return schedule;
      // else: retry with different shuffle
    }
  
    throw new Error(
      `Could not generate a schedule where each team plays ${gamesPerTeam} games after many attempts.
  Try reducing gamesPerTeam or increasing team count.`
    );
  }
  
  /**
   * Record a match result (mutates match object in array).
   */
  function scoreMatch(matches, matchId, scoreA, scoreB) {
    const match = matches.find((m) => m.id === matchId);
    if (!match) throw new Error(`Match not found: ${matchId}`);
    if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB)) {
      throw new Error("Scores must be integers.");
    }
    if (scoreA === scoreB) throw new Error("Ties not supported for bracket logic.");
  
    match.scoreA = scoreA;
    match.scoreB = scoreB;
    match.winnerId = scoreA > scoreB ? match.teamAId : match.teamBId;
  
    return match;
  }
  
  /**
   * Compute standings from RR matches.
   * Returns array of { teamId, wins, pointDiff } sorted by wins desc, pointDiff desc.
   */
  function computeStandings(teamIds, rrMatches) {
    const stats = new Map(
      teamIds.map((id) => [id, { teamId: id, wins: 0, pointDiff: 0 }])
    );
  
    for (const m of rrMatches) {
      if (m.phase !== "RR") continue;
      if (m.scoreA == null || m.scoreB == null) continue;
  
      const a = stats.get(m.teamAId);
      const b = stats.get(m.teamBId);
  
      // wins
      if (m.scoreA > m.scoreB) a.wins += 1;
      else b.wins += 1;
  
      // point differential
      a.pointDiff += (m.scoreA - m.scoreB);
      b.pointDiff += (m.scoreB - m.scoreA);
    }
  
    return Array.from(stats.values()).sort((x, y) => {
      if (y.wins !== x.wins) return y.wins - x.wins;
      return y.pointDiff - x.pointDiff;
    });
  }
  
  /**
   * Generate semifinal matches from standings.
   * Requires at least 4 teams.
   */
  function generatePlayoffsFromStandings(standings) {
    if (standings.length < 4) throw new Error("Need at least 4 teams for playoffs.");
  
    const seed1 = standings[0].teamId;
    const seed2 = standings[1].teamId;
    const seed3 = standings[2].teamId;
    const seed4 = standings[3].teamId;
  
    return [
      { id: "SF1", phase: "SF", teamAId: seed1, teamBId: seed4, scoreA: null, scoreB: null, winnerId: null },
      { id: "SF2", phase: "SF", teamAId: seed2, teamBId: seed3, scoreA: null, scoreB: null, winnerId: null },
    ];
  }
  
  /**
   * After semis are scored, generate Final + ThirdPlace.
   */
  function generateFinalsFromSemis(semis) {
    const sf1 = semis.find((m) => m.id === "SF1");
    const sf2 = semis.find((m) => m.id === "SF2");
    if (!sf1 || !sf2) throw new Error("Need SF1 and SF2.");
  
    if (!sf1.winnerId || !sf2.winnerId) {
      throw new Error("Both semifinals must be completed before generating finals.");
    }
  
    const sf1Loser = sf1.winnerId === sf1.teamAId ? sf1.teamBId : sf1.teamAId;
    const sf2Loser = sf2.winnerId === sf2.teamAId ? sf2.teamBId : sf2.teamAId;
  
    return [
      { id: "FINAL", phase: "FINAL", teamAId: sf1.winnerId, teamBId: sf2.winnerId, scoreA: null, scoreB: null, winnerId: null },
      { id: "THIRD", phase: "THIRD", teamAId: sf1Loser, teamBId: sf2Loser, scoreA: null, scoreB: null, winnerId: null },
    ];
  }
  
  /**
   * Convenience: run the whole flow (schedule -> standings -> playoffs skeleton)
   */
  function buildTournament(teams, gamesPerTeam = 4) {
    const rr = generateRoundRobinSchedule(teams, gamesPerTeam);
    const teamIds = teams.map((t) => t.id);
    const standings = computeStandings(teamIds, rr);
    const semis = generatePlayoffsFromStandings(standings);
    return { rr, standings, semis };
  }
  
  module.exports = {
    generateRoundRobinSchedule,
    scoreMatch,
    computeStandings,
    generatePlayoffsFromStandings,
    generateFinalsFromSemis,
    buildTournament,
  };