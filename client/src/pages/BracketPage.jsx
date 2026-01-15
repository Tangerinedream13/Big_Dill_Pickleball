import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Container,
  Heading,
  HStack,
  Spacer,
  Stack,
  Tabs,
  Text,
  Input,
} from "@chakra-ui/react";

import { getCurrentTournamentId } from "../tournamentStore";

function teamNameById(teams, id) {
  return teams.find((t) => t.id === id)?.name ?? `Team ${id}`;
}

export default function BracketPage() {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState({
    teams: [],
    rrMatches: [],
    standings: [],
    semis: [],
    finals: [],
  });
  const [error, setError] = useState("");

  // quick inline scoring UI
  const [scoreDraft, setScoreDraft] = useState({}); // key: matchId -> {a,b}

  const tid = getCurrentTournamentId();

  function withTid(path) {
    // Always build from origin so relative paths work consistently
    const u = new URL(path, window.location.origin);
    if (tid) u.searchParams.set("tournamentId", tid);
    return u.pathname + u.search;
  }

  async function fetchState() {
    setError("");
    setLoading(true);

    try {
      if (!tid) {
        throw new Error(
          "No tournament selected. Create a tournament first (or select one)."
        );
      }

      const res = await fetch(withTid("/api/tournament/state"));
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || "Failed to load tournament state");
      }

      setState(data);
    } catch (e) {
      setError(e?.message || "Error connecting to backend");
    } finally {
      setLoading(false);
    }
  }

  // Re-fetch when tournament changes
  useEffect(() => {
    // When switching tournaments, clear score drafts so you don’t carry old inputs over
    setScoreDraft({});
    fetchState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tid]);

  async function runAction(fn) {
    setError("");
    setLoading(true);
    try {
      await fn();
      await fetchState();
    } catch (e) {
      setError(e?.message || "Action failed");
      setLoading(false);
    }
  }

  function setDraft(matchId, which, value) {
    setScoreDraft((prev) => ({
      ...prev,
      [matchId]: { ...(prev[matchId] || { a: "", b: "" }), [which]: value },
    }));
  }

  async function submitScore(phase, matchId) {
    const draft = scoreDraft[matchId] || {};
    const scoreA = Number(draft.a);
    const scoreB = Number(draft.b);

    if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB)) {
      setError("Scores must be whole numbers.");
      return;
    }

    await runAction(async () => {
      if (!tid) throw new Error("No tournament selected.");

      if (phase === "RR") {
        const res = await fetch(
          withTid(`/api/roundrobin/matches/${matchId}/score`),
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scoreA, scoreB }),
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok)
          throw new Error(data?.error || "Failed to submit RR score");
      } else if (phase === "SF") {
        const res = await fetch(
          withTid(`/api/playoffs/semis/${matchId}/score`),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scoreA, scoreB }),
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok)
          throw new Error(data?.error || "Failed to submit SF score");
      } else {
        const res = await fetch(
          withTid(`/api/playoffs/finals/${matchId}/score`),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scoreA, scoreB }),
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok)
          throw new Error(data?.error || "Failed to submit finals score");
      }
    });
  }

  const teams = state.teams;

  return (
    <Container maxW="6xl" py={8}>
      <HStack mb={6}>
        <Heading size="lg">Tournament Brackets</Heading>
        <Spacer />
        <HStack>
          <Button
            onClick={() =>
              runAction(async () => {
                if (!tid) throw new Error("No tournament selected.");

                const res = await fetch(withTid("/api/roundrobin/generate"), {
                  method: "POST",
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok)
                  throw new Error(data?.error || "Failed to generate RR");
              })
            }
          >
            Generate RR
          </Button>

          <Button
            variant="outline"
            onClick={() =>
              runAction(async () => {
                if (!tid) throw new Error("No tournament selected.");

                const res = await fetch(withTid("/api/playoffs/generate"), {
                  method: "POST",
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok)
                  throw new Error(data?.error || "Failed to generate playoffs");
              })
            }
          >
            Generate Playoffs
          </Button>

          <Button
            variant="ghost"
            onClick={() =>
              runAction(async () => {
                if (!tid) throw new Error("No tournament selected.");

                const res = await fetch(withTid("/api/tournament/reset"), {
                  method: "POST",
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data?.error || "Failed to reset");
              })
            }
          >
            Reset
          </Button>
        </HStack>
      </HStack>

      {error ? (
        <Box mb={4} p={3} borderWidth="1px" rounded="md">
          <Text>{error}</Text>
        </Box>
      ) : null}

      {loading && state.teams.length === 0 ? <Text>Loading…</Text> : null}

      <Tabs.Root defaultValue="rr">
        <Tabs.List>
          <Tabs.Trigger value="rr">Round Robin</Tabs.Trigger>
          <Tabs.Trigger value="standings">Standings</Tabs.Trigger>
          <Tabs.Trigger value="playoffs">Playoffs</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="rr">
          <Stack mt={4} gap={3}>
            {state.rrMatches.length === 0 ? (
              <Text color="gray.500">
                No RR matches yet. Click “Generate RR”.
              </Text>
            ) : (
              state.rrMatches.map((m) => {
                const draft = scoreDraft[m.id] || { a: "", b: "" };
                return (
                  <Box key={m.id} borderWidth="1px" rounded="md" p={3}>
                    <Text mb={2}>
                      <b>{teamNameById(teams, m.teamAId)}</b> vs{" "}
                      <b>{teamNameById(teams, m.teamBId)}</b>{" "}
                      {m.scoreA != null && m.scoreB != null
                        ? `— ${m.scoreA}:${m.scoreB}`
                        : ""}
                    </Text>

                    <HStack>
                      <Input
                        placeholder="Score A"
                        value={draft.a}
                        onChange={(e) => setDraft(m.id, "a", e.target.value)}
                        width="120px"
                      />
                      <Input
                        placeholder="Score B"
                        value={draft.b}
                        onChange={(e) => setDraft(m.id, "b", e.target.value)}
                        width="120px"
                      />
                      <Button size="sm" onClick={() => submitScore("RR", m.id)}>
                        Save
                      </Button>
                    </HStack>
                  </Box>
                );
              })
            )}
          </Stack>
        </Tabs.Content>

        <Tabs.Content value="standings">
          <Stack mt={4} gap={2}>
            {state.standings.map((s, idx) => (
              <Box key={s.teamId} borderWidth="1px" rounded="md" p={3}>
                <Text>
                  #{idx + 1} <b>{teamNameById(teams, s.teamId)}</b> — Wins:{" "}
                  {s.wins} | PD: {s.pointDiff}
                </Text>
              </Box>
            ))}
          </Stack>
        </Tabs.Content>

        <Tabs.Content value="playoffs">
          <Stack mt={4} gap={4}>
            <Box>
              <Heading size="md" mb={2}>
                Semifinals
              </Heading>

              {state.semis.length === 0 ? (
                <Text color="gray.500">Generate playoffs after RR.</Text>
              ) : (
                state.semis.map((m) => {
                  const draft = scoreDraft[m.id] || { a: "", b: "" };
                  return (
                    <Box key={m.id} borderWidth="1px" rounded="md" p={3}>
                      <Text mb={2}>
                        <b>{teamNameById(teams, m.teamAId)}</b> vs{" "}
                        <b>{teamNameById(teams, m.teamBId)}</b>{" "}
                        {m.scoreA != null && m.scoreB != null
                          ? `— ${m.scoreA}:${m.scoreB}`
                          : ""}
                      </Text>

                      <HStack>
                        <Input
                          placeholder="Score A"
                          value={draft.a}
                          onChange={(e) => setDraft(m.id, "a", e.target.value)}
                          width="120px"
                        />
                        <Input
                          placeholder="Score B"
                          value={draft.b}
                          onChange={(e) => setDraft(m.id, "b", e.target.value)}
                          width="120px"
                        />
                        <Button
                          size="sm"
                          onClick={() => submitScore("SF", m.id)}
                        >
                          Save
                        </Button>
                      </HStack>
                    </Box>
                  );
                })
              )}
            </Box>

            <Box>
              <Heading size="md" mb={2}>
                Finals / Third
              </Heading>

              {state.finals.length === 0 ? (
                <Text color="gray.500">
                  Finals appear after both semis are scored.
                </Text>
              ) : (
                state.finals.map((m) => {
                  const draft = scoreDraft[m.id] || { a: "", b: "" };
                  return (
                    <Box key={m.id} borderWidth="1px" rounded="md" p={3}>
                      <Text mb={2}>
                        <b>{teamNameById(teams, m.teamAId)}</b> vs{" "}
                        <b>{teamNameById(teams, m.teamBId)}</b>{" "}
                        {m.scoreA != null && m.scoreB != null
                          ? `— ${m.scoreA}:${m.scoreB}`
                          : ""}
                      </Text>

                      <HStack>
                        <Input
                          placeholder="Score A"
                          value={draft.a}
                          onChange={(e) => setDraft(m.id, "a", e.target.value)}
                          width="120px"
                        />
                        <Input
                          placeholder="Score B"
                          value={draft.b}
                          onChange={(e) => setDraft(m.id, "b", e.target.value)}
                          width="120px"
                        />
                        <Button
                          size="sm"
                          onClick={() => submitScore("FINAL", m.id)}
                        >
                          Save
                        </Button>
                      </HStack>
                    </Box>
                  );
                })
              )}
            </Box>
          </Stack>
        </Tabs.Content>
      </Tabs.Root>
    </Container>
  );
}