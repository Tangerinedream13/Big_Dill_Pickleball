import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { ArrowLeft } from "lucide-react";

import { getCurrentTournamentId } from "../tournamentStore";

function teamNameById(teams, id) {
  return teams.find((t) => t.id === id)?.name ?? `Team ${id}`;
}

export default function BracketPage() {
  const navigate = useNavigate();

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
  const [scoreDraft, setScoreDraft] = useState({}); // matchId -> { a, b }

  const tid = getCurrentTournamentId();

  function withTid(path) {
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

  useEffect(() => {
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

      const endpoint =
        phase === "RR"
          ? `/api/roundrobin/matches/${matchId}/score`
          : phase === "SF"
          ? `/api/playoffs/semis/${matchId}/score`
          : `/api/playoffs/finals/${matchId}/score`;

      const method = phase === "RR" ? "PATCH" : "POST";

      const res = await fetch(withTid(endpoint), {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scoreA, scoreB }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data?.error || "Failed to submit score");
    });
  }

  const teams = state.teams;

  return (
    <Container maxW="6xl" py={8}>
      {/* HEADER */}
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

          {/* ✅ BACK BUTTON */}
          <Button variant="outline" onClick={() => navigate("/")}>
            <HStack gap={2}>
              <ArrowLeft size={16} />
              <Text>Back</Text>
            </HStack>
          </Button>
        </HStack>
      </HStack>

      {error && (
        <Box mb={4} p={3} borderWidth="1px" rounded="md">
          <Text>{error}</Text>
        </Box>
      )}

      {loading && state.teams.length === 0 && <Text>Loading…</Text>}

      <Tabs.Root defaultValue="rr">
        <Tabs.List>
          <Tabs.Trigger value="rr">Round Robin</Tabs.Trigger>
          <Tabs.Trigger value="standings">Standings</Tabs.Trigger>
          <Tabs.Trigger value="playoffs">Playoffs</Tabs.Trigger>
        </Tabs.List>

        {/* RR */}
        <Tabs.Content value="rr">
          <Stack mt={4} gap={3}>
            {state.rrMatches.length === 0 ? (
              <Text color="gray.500">No RR matches yet.</Text>
            ) : (
              state.rrMatches.map((m) => {
                const draft = scoreDraft[m.id] || { a: "", b: "" };
                return (
                  <Box key={m.id} borderWidth="1px" rounded="md" p={3}>
                    <Text mb={2}>
                      <b>{teamNameById(teams, m.teamAId)}</b> vs{" "}
                      <b>{teamNameById(teams, m.teamBId)}</b>
                    </Text>
                    <HStack>
                      <Input
                        placeholder="Score A"
                        value={draft.a}
                        onChange={(e) =>
                          setDraft(m.id, "a", e.target.value)
                        }
                        width="120px"
                      />
                      <Input
                        placeholder="Score B"
                        value={draft.b}
                        onChange={(e) =>
                          setDraft(m.id, "b", e.target.value)
                        }
                        width="120px"
                      />
                      <Button
                        size="sm"
                        onClick={() => submitScore("RR", m.id)}
                      >
                        Save
                      </Button>
                    </HStack>
                  </Box>
                );
              })
            )}
          </Stack>
        </Tabs.Content>

        {/* STANDINGS */}
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

        {/* PLAYOFFS */}
        <Tabs.Content value="playoffs">
          <Stack mt={4} gap={4}>
            {[...state.semis, ...state.finals].map((m) => {
              const draft = scoreDraft[m.id] || { a: "", b: "" };
              return (
                <Box key={m.id} borderWidth="1px" rounded="md" p={3}>
                  <Text mb={2}>
                    <b>{teamNameById(teams, m.teamAId)}</b> vs{" "}
                    <b>{teamNameById(teams, m.teamBId)}</b>
                  </Text>
                  <HStack>
                    <Input
                      placeholder="Score A"
                      value={draft.a}
                      onChange={(e) =>
                        setDraft(m.id, "a", e.target.value)
                      }
                      width="120px"
                    />
                    <Input
                      placeholder="Score B"
                      value={draft.b}
                      onChange={(e) =>
                        setDraft(m.id, "b", e.target.value)
                      }
                      width="120px"
                    />
                    <Button
                      size="sm"
                      onClick={() =>
                        submitScore(
                          state.semis.includes(m) ? "SF" : "FINAL",
                          m.id
                        )
                      }
                    >
                      Save
                    </Button>
                  </HStack>
                </Box>
              );
            })}
          </Stack>
        </Tabs.Content>
      </Tabs.Root>
    </Container>
  );
}