// client/src/components/championResults.js

const DIVISION_ORDER = ["ADVANCED", "BEGINNER_INTERMEDIATE"];

function otherTeam(match) {
  if (!match?.winnerId) return null;
  return String(match.winnerId) === String(match.teamAId)
    ? match.teamBId
    : match.teamAId;
}

/**
 * Turn FINAL/THIRD matches into one result per division whose Final has a
 * winner. `labelFor(teamId)` must return a display string.
 */
export function buildChampionResults(finals, labelFor) {
  const divisionOf = (m) => m?.division ?? "BEGINNER_INTERMEDIATE";

  return DIVISION_ORDER.map((division) => {
    const finalMatch = finals.find(
      (m) => m.phase === "FINAL" && divisionOf(m) === division
    );
    if (!finalMatch?.winnerId) return null;

    const thirdMatch = finals.find(
      (m) => m.phase === "THIRD" && divisionOf(m) === division
    );
    const runnerUpId = otherTeam(finalMatch);

    return {
      division,
      champion: labelFor(finalMatch.winnerId),
      runnerUp: runnerUpId ? labelFor(runnerUpId) : null,
      third: thirdMatch?.winnerId ? labelFor(thirdMatch.winnerId) : null,
    };
  }).filter(Boolean);
}
