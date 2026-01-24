import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Badge,
  Box,
  Button,
  Card,
  Container,
  Flex,
  Heading,
  HStack,
  Input,
  Stack,
  Text,
  Select,
  Table,
} from "@chakra-ui/react";
import {
  ArrowLeft,
  Save,
  Search,
  CalendarDays,
  RotateCcw,
  Eraser,
} from "lucide-react";
import { getCurrentTournamentId } from "./tournamentStore";

function labelForPhase(phase) {
  if (phase === "RR") return { label: "Round Robin", variant: "club" };
  if (phase === "SF") return { label: "Semifinal", variant: "club" };
  if (phase === "FINAL") return { label: "Final", variant: "pickle" };
  if (phase === "THIRD") return { label: "Third Place", variant: "club" };
  return { label: phase, variant: "club" };
}

function normalizeScoreInput(v) {
  if (v === "" || v === null || v === undefined) return "";
  return String(v);
}

function isIntString(v) {
  if (typeof v !== "string") return false;
  const s = v.trim();
  if (s === "") return false;
  const n = Number(s);
  return Number.isInteger(n) && String(n) === s;
}

export default function MatchSchedule() {
  const navigate = useNavigate();

  // loading | ok | error | no-tournament
  const [status, setStatus] = useState("loading");
  const [state, setState] = useState(null);

  const [phaseFilter, setPhaseFilter] = useState("ALL"); // ALL | RR | SF | FINAL | THIRD
  const [query, setQuery] = useState("");

  // { [matchId]: { scoreA: string, scoreB: string, saving: boolean, error: string|null } }
  const [edits, setEdits] = useState({});

  // reset matches state
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");

  // reset playoffs state
  const [resettingPlayoffs, setResettingPlayoffs] = useState(false);
  const [resetPlayoffsError, setResetPlayoffsError] = useState("");

  const tid = getCurrentTournamentId();

  function withTid(path) {
    const u = new URL(path, window.location.origin);
    if (tid) u.searchParams.set("tournamentId", tid);
    return u.pathname + u.search;
  }

  async function loadState() {
    try {
      setStatus("loading");
      setResetError("");
      setResetPlayoffsError("");

      if (!tid) {
        setState(null);
        setEdits({});
        setStatus("no-tournament");
        return;
      }

      const res = await fetch(withTid("/api/tournament/state"));
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }

      setState(data);
      setStatus("ok");

      const all = [
        ...(data.rrMatches ?? []),
        ...(data.semis ?? []),
        ...(data.finals ?? []),
      ];

      const next = {};
      for (const m of all) {
        next[m.id] = {
          scoreA: normalizeScoreInput(m.scoreA),
          scoreB: normalizeScoreInput(m.scoreB),
          saving: false,
          error: null,
        };
      }
      setEdits(next);
    } catch (e) {
      console.error(e);
      setStatus("error");
    }
  }

  useEffect(() => {
    setState(null);
    setEdits({});
    loadState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tid]);

  const teamsById = useMemo(() => {
    const map = new Map();
    for (const t of state?.teams ?? []) map.set(String(t.id), t.name);
    return map;
  }, [state]);

  const allMatches = useMemo(() => {
    const rr = (state?.rrMatches ?? []).map((m) => ({ ...m, phase: "RR" }));
    const sf = (state?.semis ?? []).map((m) => ({ ...m, phase: "SF" }));
    const finals = (state?.finals ?? []).map((m) => ({ ...m })); // FINAL/THIRD already set
    return [...rr, ...sf, ...finals];
  }, [state]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return allMatches.filter((m) => {
      if (phaseFilter !== "ALL" && m.phase !== phaseFilter) return false;
      if (!q) return true;

      const a = (teamsById.get(String(m.teamAId)) ?? "").toLowerCase();
      const b = (teamsById.get(String(m.teamBId)) ?? "").toLowerCase();
      const id = String(m.id ?? "").toLowerCase();
      return a.includes(q) || b.includes(q) || id.includes(q);
    });
  }, [allMatches, phaseFilter, query, teamsById]);

  function setScore(matchId, side, value) {
    setEdits((prev) => ({
      ...prev,
      [matchId]: {
        ...(prev[matchId] ?? {
          scoreA: "",
          scoreB: "",
          saving: false,
          error: null,
        }),
        [side]: String(value).replace(/[^\d]/g, ""), // digits only
        error: null,
      },
    }));
  }

  function getSaveEndpoint(match) {
    if (match.phase === "RR") {
      return {
        method: "PATCH",
        url: `/api/roundrobin/matches/${match.id}/score`,
      };
    }
    if (match.phase === "SF") {
      return { method: "POST", url: `/api/playoffs/semis/${match.id}/score` };
    }
    if (match.phase === "FINAL" || match.phase === "THIRD") {
      return { method: "POST", url: `/api/playoffs/finals/${match.id}/score` };
    }
    return null;
  }

  async function saveMatch(match) {
    const matchId = match.id;
    const row = edits[matchId] ?? { scoreA: "", scoreB: "" };

    if (!tid) {
      setEdits((prev) => ({
        ...prev,
        [matchId]: { ...prev[matchId], error: "No tournament selected." },
      }));
      return;
    }

    const scoreA = row.scoreA;
    const scoreB = row.scoreB;

    if (!isIntString(scoreA) || !isIntString(scoreB)) {
      setEdits((prev) => ({
        ...prev,
        [matchId]: { ...prev[matchId], error: "Scores must be whole numbers." },
      }));
      return;
    }
    if (scoreA === scoreB) {
      setEdits((prev) => ({
        ...prev,
        [matchId]: { ...prev[matchId], error: "Ties not supported." },
      }));
      return;
    }

    const endpoint = getSaveEndpoint(match);
    if (!endpoint) return;

    setEdits((prev) => ({
      ...prev,
      [matchId]: { ...prev[matchId], saving: true, error: null },
    }));

    try {
      const res = await fetch(withTid(endpoint.url), {
        method: endpoint.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scoreA: Number(scoreA),
          scoreB: Number(scoreB),
        }),
      });

      if (!res.ok) {
        const msg = await res.json().catch(() => ({}));
        throw new Error(msg?.error ?? `HTTP ${res.status}`);
      }

      await loadState();
    } catch (e) {
      console.error(e);
      setEdits((prev) => ({
        ...prev,
        [matchId]: {
          ...prev[matchId],
          saving: false,
          error: e.message || "Save failed.",
        },
      }));
    }
  }

  async function resetMatches() {
    setResetError("");

    if (!tid) {
      setResetError("No tournament selected.");
      return;
    }
    if (!confirm("Reset ALL matches for this tournament? This cannot be undone.")) {
      return;
    }

    setResetting(true);
    try {
      const res = await fetch(withTid("/api/tournament/reset"), {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      await loadState();
    } catch (e) {
      console.error(e);
      setResetError(e.message || "Could not reset matches.");
    } finally {
      setResetting(false);
    }
  }

  async function resetPlayoffs() {
    setResetPlayoffsError("");

    if (!tid) {
      setResetPlayoffsError("No tournament selected.");
      return;
    }
    if (!confirm("Reset playoffs only? (Semis/Final/Third will be cleared, RR stays.)")) {
      return;
    }

    setResettingPlayoffs(true);
    try {
      const res = await fetch(withTid("/api/playoffs/reset"), {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      await loadState();
    } catch (e) {
      console.error(e);
      setResetPlayoffsError(e.message || "Could not reset playoffs.");
    } finally {
      setResettingPlayoffs(false);
    }
  }

  return (
    <Box bg="cream.50" minH="calc(100vh - 64px)" py={{ base: 8, md: 12 }}>
      <Container maxW="6xl">
        <Stack gap={6}>
          {/* Header */}
          <Flex
            align={{ base: "stretch", md: "center" }}
            justify="space-between"
            direction={{ base: "column", md: "row" }}
            gap={4}
          >
            <Stack gap={1}>
              <HStack gap={3}>
                <Box
                  w="36px"
                  h="36px"
                  borderRadius="12px"
                  bg="club.100"
                  display="grid"
                  placeItems="center"
                  border="1px solid"
                  borderColor="border"
                >
                  <CalendarDays size={18} />
                </Box>

                <Heading size="lg" letterSpacing="-0.02em">
                  Match Schedule
                </Heading>

                {status === "loading" && <Badge variant="club">Loading…</Badge>}
                {status === "no-tournament" && (
                  <Badge variant="club">No tournament selected</Badge>
                )}
                {status === "error" && (
                  <Badge variant="club">Backend issue</Badge>
                )}
                {status === "ok" && (
                  <Badge variant="pickle">{filtered.length} matches</Badge>
                )}
              </HStack>

              <Text opacity={0.85} maxW="70ch">
                Enter scores for round robin and playoffs. Tip: use{" "}
                <b>Reset Playoffs</b> if you want to redo semis/finals without
                wiping RR scores.
              </Text>
            </Stack>

            <HStack gap={2} justify={{ base: "flex-start", md: "flex-end" }}>
              <Button
                variant="outline"
                onClick={resetPlayoffs}
                disabled={!tid || resettingPlayoffs}
              >
                <HStack gap={2}>
                  <Eraser size={16} />
                  <Text>
                    {resettingPlayoffs ? "Resetting…" : "Reset Playoffs"}
                  </Text>
                </HStack>
              </Button>

              <Button
                variant="outline"
                onClick={resetMatches}
                disabled={!tid || resetting}
              >
                <HStack gap={2}>
                  <RotateCcw size={16} />
                  <Text>{resetting ? "Resetting…" : "Reset Matches"}</Text>
                </HStack>
              </Button>

              <Button variant="outline" onClick={() => navigate("/")}>
                <HStack gap={2}>
                  <ArrowLeft size={16} />
                  <Text>Back</Text>
                </HStack>
              </Button>
            </HStack>
          </Flex>

          {resetPlayoffsError ? (
            <Box
              border="1px solid"
              borderColor="red.200"
              bg="red.50"
              p={3}
              borderRadius="lg"
            >
              <Text color="red.700" fontSize="sm">
                {resetPlayoffsError}
              </Text>
            </Box>
          ) : null}

          {resetError ? (
            <Box
              border="1px solid"
              borderColor="red.200"
              bg="red.50"
              p={3}
              borderRadius="lg"
            >
              <Text color="red.700" fontSize="sm">
                {resetError}
              </Text>
            </Box>
          ) : null}

          {/* Controls */}
          <Card.Root>
            <Card.Body>
              <Flex
                direction={{ base: "column", md: "row" }}
                align={{ base: "stretch", md: "center" }}
                gap={3}
                justify="space-between"
              >
                <HStack gap={3} w={{ base: "100%", md: "auto" }}>
                  <Text fontWeight="700">Filter</Text>

                  <Select.Root
                    value={[phaseFilter]}
                    onValueChange={(details) =>
                      setPhaseFilter(details.value?.[0] ?? "ALL")
                    }
                    size="md"
                    disabled={!tid}
                  >
                    <Select.Trigger maxW="240px">
                      <Select.ValueText placeholder="All phases" />
                    </Select.Trigger>
                    <Select.Content>
                      <Select.Item item={{ value: "ALL" }}>
                        All phases
                      </Select.Item>
                      <Select.Item item={{ value: "RR" }}>
                        Round Robin
                      </Select.Item>
                      <Select.Item item={{ value: "SF" }}>
                        Semifinals
                      </Select.Item>
                      <Select.Item item={{ value: "FINAL" }}>Final</Select.Item>
                      <Select.Item item={{ value: "THIRD" }}>
                        Third Place
                      </Select.Item>
                    </Select.Content>
                  </Select.Root>
                </HStack>

                <Box position="relative" w={{ base: "100%", md: "360px" }}>
                  <Box
                    position="absolute"
                    left="12px"
                    top="50%"
                    transform="translateY(-50%)"
                    opacity={0.7}
                  >
                    <Search size={16} />
                  </Box>
                  <Input
                    pl="38px"
                    placeholder="Search team name or match id…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    disabled={!tid}
                  />
                </Box>
              </Flex>
            </Card.Body>
          </Card.Root>

          {/* Table */}
          <Card.Root>
            <Card.Body>
              {!tid ? (
                <Box
                  border="1px dashed"
                  borderColor="border"
                  borderRadius="2xl"
                  p={{ base: 6, md: 10 }}
                  textAlign="center"
                  bg="white"
                >
                  <Heading size="md" mb={2}>
                    No tournament selected
                  </Heading>
                  <Text opacity={0.8} mb={5}>
                    Create a tournament (or pick one) so we know which match
                    schedule to load.
                  </Text>
                  <Button
                    variant="pickle"
                    onClick={() => navigate("/tournaments/new")}
                  >
                    Create Tournament
                  </Button>
                </Box>
              ) : status === "loading" ? (
                <Text>Loading match schedule…</Text>
              ) : status === "error" ? (
                <Text>Could not load matches. Check backend logs.</Text>
              ) : filtered.length === 0 ? (
                <Box
                  border="1px dashed"
                  borderColor="border"
                  borderRadius="2xl"
                  p={{ base: 6, md: 10 }}
                  textAlign="center"
                  bg="white"
                >
                  <Heading size="md" mb={2}>
                    No matches found
                  </Heading>
                  <Text opacity={0.8} mb={5}>
                    Try a different search or phase filter.
                  </Text>
                  <Button variant="outline" onClick={loadState}>
                    Refresh
                  </Button>
                </Box>
              ) : (
                <Table.Root size="md" variant="outline">
                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeader>Phase</Table.ColumnHeader>
                      <Table.ColumnHeader>Match</Table.ColumnHeader>
                      <Table.ColumnHeader>Teams</Table.ColumnHeader>
                      <Table.ColumnHeader>Score A</Table.ColumnHeader>
                      <Table.ColumnHeader>Score B</Table.ColumnHeader>
                      <Table.ColumnHeader>Winner</Table.ColumnHeader>
                      <Table.ColumnHeader textAlign="end">
                        Save
                      </Table.ColumnHeader>
                    </Table.Row>
                  </Table.Header>

                  <Table.Body>
                    {filtered.map((m) => {
                      const phaseMeta = labelForPhase(m.phase);
                      const aName =
                        teamsById.get(String(m.teamAId)) ?? `Team ${m.teamAId}`;
                      const bName =
                        teamsById.get(String(m.teamBId)) ?? `Team ${m.teamBId}`;
                      const row = edits[m.id] ?? {
                        scoreA: "",
                        scoreB: "",
                        saving: false,
                        error: null,
                      };

                      const winner =
                        m.winnerId == null
                          ? "—"
                          : String(m.winnerId) === String(m.teamAId)
                          ? aName
                          : bName;

                      return (
                        <Table.Row key={`${m.phase}-${m.id}`}>
                          <Table.Cell>
                            <Badge variant={phaseMeta.variant}>
                              {phaseMeta.label}
                            </Badge>
                          </Table.Cell>

                          <Table.Cell fontWeight="700">{m.id}</Table.Cell>

                          <Table.Cell>
                            <Text fontWeight="600">{aName}</Text>
                            <Text opacity={0.7} fontSize="sm">
                              vs {bName}
                            </Text>
                          </Table.Cell>

                          <Table.Cell>
                            <Input
                              w="88px"
                              inputMode="numeric"
                              value={row.scoreA}
                              onChange={(e) =>
                                setScore(m.id, "scoreA", e.target.value)
                              }
                              disabled={!tid}
                            />
                          </Table.Cell>

                          <Table.Cell>
                            <Input
                              w="88px"
                              inputMode="numeric"
                              value={row.scoreB}
                              onChange={(e) =>
                                setScore(m.id, "scoreB", e.target.value)
                              }
                              disabled={!tid}
                            />
                          </Table.Cell>

                          <Table.Cell>
                            <Text fontWeight="600">{winner}</Text>
                            {row.error ? (
                              <Text fontSize="xs" color="red.600">
                                {row.error}
                              </Text>
                            ) : null}
                          </Table.Cell>

                          <Table.Cell textAlign="end">
                            <Button
                              variant="pickle"
                              onClick={() => saveMatch(m)}
                              disabled={!tid || !!row.saving}
                            >
                              <HStack gap={2}>
                                <Save size={16} />
                                <Text>Save</Text>
                              </HStack>
                            </Button>
                          </Table.Cell>
                        </Table.Row>
                      );
                    })}
                  </Table.Body>
                </Table.Root>
              )}
            </Card.Body>
          </Card.Root>
        </Stack>
      </Container>
    </Box>
  );
}