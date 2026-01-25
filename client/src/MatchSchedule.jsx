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
  IconButton,
  Input,
  Stack,
  Text,
  Select,
  Table,
  createListCollection,
} from "@chakra-ui/react";
import {
  Home,
  Save,
  Search,
  CalendarDays,
  RotateCcw,
  Eraser,
  ChevronsRight,
} from "lucide-react";
import { getCurrentTournamentId } from "./tournamentStore";

/* -----------------------------
   Helpers
------------------------------ */

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

function last4(name) {
  const s = (name ?? "").trim();
  if (!s) return "";
  const parts = s.split(/\s+/);
  const last = parts[parts.length - 1] || "";
  return last.slice(0, 4).toUpperCase();
}

function playersCodeFromTeam(team) {
  const players = team?.players ?? [];
  const names = players
    .map((p) => (typeof p === "string" ? p : p?.name))
    .filter(Boolean);

  if (names.length === 0) return "";

  const a = last4(names[0]);
  const b = last4(names[1]);

  if (a && b) return `(${a}, ${b})`;
  if (a) return `(${a})`;
  return "";
}

function formatTeamDisplay(team) {
  const teamName = team?.name ?? "Team";
  const code = playersCodeFromTeam(team);
  return code ? `${teamName} ${code}` : teamName;
}

// Local score rules (mirrors your backend intent)
function validateScore(matchPhase, a, b) {
  const scoreA = Number(a);
  const scoreB = Number(b);

  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB)) {
    return "Scores must be whole numbers.";
  }
  if (scoreA < 0 || scoreB < 0) return "Scores can’t be negative.";
  if (scoreA === scoreB) return "Ties not supported.";

  const diff = Math.abs(scoreA - scoreB);
  if (diff < 2) return "Team must win by 2.";

  const min = matchPhase === "RR" ? 11 : 15;
  if (Math.max(scoreA, scoreB) < min) {
    return `Game must be played to at least ${min}.`;
  }

  return null;
}

const phaseCollection = createListCollection({
  items: [
    { label: "All phases", value: "ALL" },
    { label: "Round Robin", value: "RR" },
    { label: "Semifinals", value: "SF" },
    { label: "Final", value: "FINAL" },
    { label: "Third Place", value: "THIRD" },
  ],
});

/* -----------------------------
   Component
------------------------------ */

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

  // advance to semis state
  const [advancing, setAdvancing] = useState(false);
  const [advanceError, setAdvanceError] = useState("");

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
      setAdvanceError("");

      if (!tid) {
        setState(null);
        setEdits({});
        setStatus("no-tournament");
        return;
      }

      const res = await fetch(withTid("/api/tournament/state"));
      const data = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);

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

  // teamsById now stores the whole team object so we can read players
  const teamsById = useMemo(() => {
    const map = new Map();
    for (const t of state?.teams ?? []) map.set(String(t.id), t);
    return map;
  }, [state]);

  const teamNameDisplay = useMemo(() => {
    return (teamId) => {
      const team = teamsById.get(String(teamId)) ?? null;
      if (!team) return `Team ${String(teamId)}`;
      return formatTeamDisplay(team);
    };
  }, [teamsById]);

  // Seed map (from RR standings top-4)
  const seedByTeamId = useMemo(() => {
    const map = new Map();
    const top = (state?.standings ?? []).slice(0, 4);
    top.forEach((s, idx) => map.set(String(s.teamId), idx + 1));
    return map;
  }, [state]);

  const rrIncompleteMatches = useMemo(() => {
    const rr = state?.rrMatches ?? [];
    return rr.filter((m) => !m.winnerId);
  }, [state]);

  const rrComplete = useMemo(() => {
    const rr = state?.rrMatches ?? [];
    return rr.length > 0 && rr.every((m) => m.winnerId);
  }, [state]);

  const semisExist = useMemo(() => (state?.semis ?? []).length > 0, [state]);
  const finalsExist = useMemo(() => (state?.finals ?? []).length > 0, [state]);

  const tournamentComplete = useMemo(() => {
    const finals = state?.finals ?? [];
    const finalMatch = finals.find(
      (m) => m.phase === "FINAL" || m.id === "FINAL"
    );
    const thirdMatch = finals.find(
      (m) => m.phase === "THIRD" || m.id === "THIRD"
    );
    if (!finalMatch && !thirdMatch) return false;

    const finalDone = finalMatch ? !!finalMatch.winnerId : true;
    const thirdDone = thirdMatch ? !!thirdMatch.winnerId : true;
    return finalDone && thirdDone;
  }, [state]);

  const tournamentInProgress = useMemo(() => {
    const rr = state?.rrMatches?.length ?? 0;
    const sf = state?.semis?.length ?? 0;
    const fin = state?.finals?.length ?? 0;
    return rr + sf + fin > 0 && !tournamentComplete;
  }, [state, tournamentComplete]);

  const canAdvanceToSemis = useMemo(() => {
    return (
      !!tid && rrComplete && !semisExist && !advancing && !tournamentComplete
    );
  }, [tid, rrComplete, semisExist, advancing, tournamentComplete]);

  // Compute RR wins/losses for standings table
  const rrRecordByTeamId = useMemo(() => {
    const rr = state?.rrMatches ?? [];
    const map = new Map(); // teamId -> { wins, losses }
    for (const m of rr) {
      const a = String(m.teamAId);
      const b = String(m.teamBId);
      if (!map.has(a)) map.set(a, { wins: 0, losses: 0 });
      if (!map.has(b)) map.set(b, { wins: 0, losses: 0 });

      if (!m.winnerId) continue;

      const w = String(m.winnerId);
      const loser = w === a ? b : a;
      map.get(w).wins += 1;
      map.get(loser).losses += 1;
    }
    return map;
  }, [state]);

  const allMatches = useMemo(() => {
    const rr = (state?.rrMatches ?? []).map((m) => ({ ...m, phase: "RR" }));
    const sf = (state?.semis ?? []).map((m) => ({ ...m, phase: "SF" }));
    const finals = (state?.finals ?? []).map((m) => ({ ...m })); // FINAL/THIRD already set
    return [...rr, ...sf, ...finals];
  }, [state]);

  // Sort: in-progress first, then by phase order, then id
  const sortedMatches = useMemo(() => {
    const phaseOrder = { RR: 0, SF: 1, FINAL: 2, THIRD: 3 };
    const copy = [...allMatches];

    copy.sort((x, y) => {
      const xDone = !!x.winnerId;
      const yDone = !!y.winnerId;
      if (xDone !== yDone) return xDone ? 1 : -1; // completed at bottom

      const px = phaseOrder[x.phase] ?? 99;
      const py = phaseOrder[y.phase] ?? 99;
      if (px !== py) return px - py;

      return String(x.id ?? "").localeCompare(String(y.id ?? ""));
    });

    return copy;
  }, [allMatches]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return sortedMatches.filter((m) => {
      if (phaseFilter !== "ALL" && m.phase !== phaseFilter) return false;
      if (!q) return true;

      const a = teamNameDisplay(m.teamAId).toLowerCase();
      const b = teamNameDisplay(m.teamBId).toLowerCase();
      const id = String(m.id ?? "").toLowerCase();
      return a.includes(q) || b.includes(q) || id.includes(q);
    });
  }, [sortedMatches, phaseFilter, query, teamNameDisplay]);

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

    if (tournamentComplete) {
      setEdits((prev) => ({
        ...prev,
        [matchId]: {
          ...prev[matchId],
          error: "Tournament is complete. Scores are locked.",
        },
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

    const localError = validateScore(match.phase, scoreA, scoreB);
    if (localError) {
      setEdits((prev) => ({
        ...prev,
        [matchId]: { ...prev[matchId], error: localError },
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
    if (
      !confirm("Reset ALL matches for this tournament? This cannot be undone.")
    )
      return;

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
    if (
      !confirm(
        "Reset playoffs only? (Semis/Final/Third will be cleared, RR stays.)"
      )
    )
      return;

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

  async function advanceToSemis() {
    setAdvanceError("");

    if (!tid) {
      setAdvanceError("No tournament selected.");
      return;
    }
    if (tournamentComplete) {
      setAdvanceError("Tournament is complete.");
      return;
    }

    if (!rrComplete) {
      const missing = rrIncompleteMatches.map((m) => m.id).join(", ");
      setAdvanceError(
        `Round robin isn't complete yet. Score these matches first: ${missing}`
      );
      return;
    }

    if (semisExist) {
      setAdvanceError(
        "Semifinals already exist. Use Reset Playoffs if you want to regenerate."
      );
      return;
    }

    setAdvancing(true);
    try {
      const res = await fetch(withTid("/api/playoffs/generate"), {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      await loadState();
      setPhaseFilter("SF");
      setQuery("");
    } catch (e) {
      console.error(e);
      setAdvanceError(e?.message || "Could not generate semifinals.");
    } finally {
      setAdvancing(false);
    }
  }

  const standings = state?.standings ?? [];

  return (
    <Box bg="cream.50" minH="calc(100vh - 64px)" py={{ base: 8, md: 12 }}>
      <Container maxW="6xl">
        <Stack gap={6}>
          {/* Sticky Header / Banner */}
          <Box
            position="sticky"
            top="0"
            zIndex={10}
            bg="cream.50"
            pt={1}
            pb={3}
          >
            <Flex
              align={{ base: "stretch", md: "center" }}
              justify="space-between"
              direction={{ base: "column", md: "row" }}
              gap={4}
            >
              <Stack gap={1}>
                <HStack gap={3} wrap="wrap">
                  {/* Home icon (no extra component needed) */}
                  <IconButton
                    aria-label="Home"
                    variant="outline"
                    onClick={() => navigate("/")}
                  >
                    <Home size={18} />
                  </IconButton>

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

                  {status === "loading" && (
                    <Badge variant="club">Loading…</Badge>
                  )}
                  {status === "no-tournament" && (
                    <Badge variant="club">No tournament selected</Badge>
                  )}
                  {status === "error" && (
                    <Badge variant="club">Backend issue</Badge>
                  )}
                  {status === "ok" && (
                    <Badge variant="pickle">{filtered.length} matches</Badge>
                  )}

                  {/* Lifecycle badges */}
                  {tid && status === "ok" ? (
                    <>
                      <Badge variant={rrComplete ? "pickle" : "club"}>
                        RR {rrComplete ? "Complete" : "In Progress"}
                      </Badge>
                      <Badge variant={semisExist ? "pickle" : "club"}>
                        Semis {semisExist ? "Ready" : "—"}
                      </Badge>
                      <Badge variant={finalsExist ? "pickle" : "club"}>
                        Finals {finalsExist ? "Ready" : "—"}
                      </Badge>

                      {tournamentInProgress ? (
                        <Badge variant="club">Tournament In Progress 🟢</Badge>
                      ) : null}

                      {tournamentComplete ? (
                        <Badge variant="pickle">Tournament Complete ✅</Badge>
                      ) : null}
                    </>
                  ) : null}
                </HStack>

                <Text opacity={0.85} maxW="70ch">
                  Enter scores for round robin and playoffs.
                  {tournamentComplete ? " (Scores are locked.)" : ""}
                </Text>
              </Stack>

              <HStack
                gap={2}
                justify={{ base: "flex-start", md: "flex-end" }}
                wrap="wrap"
              >
                <Button
                  variant="outline"
                  onClick={advanceToSemis}
                  disabled={!canAdvanceToSemis}
                >
                  <HStack gap={2}>
                    <ChevronsRight size={16} />
                    <Text>{advancing ? "Advancing…" : "Advance to Semis"}</Text>
                  </HStack>
                </Button>

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
              </HStack>
            </Flex>

            {/* Errors under banner */}
            <Stack mt={3} gap={2}>
              {advanceError ? (
                <Box
                  border="1px solid"
                  borderColor="red.200"
                  bg="red.50"
                  p={3}
                  borderRadius="lg"
                >
                  <Text color="red.700" fontSize="sm">
                    {advanceError}
                  </Text>
                </Box>
              ) : null}

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
            </Stack>
          </Box>

          {/* Standings */}
          {tid && status === "ok" && standings.length > 0 ? (
            <Card.Root>
              <Card.Body>
                <Flex
                  justify="space-between"
                  align="center"
                  mb={3}
                  wrap="wrap"
                  gap={2}
                >
                  <Heading size="sm">Standings</Heading>
                  <Text fontSize="sm" opacity={0.7}>
                    (RR-based)
                  </Text>
                </Flex>

                <Table.Root size="sm" variant="outline">
                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeader>#</Table.ColumnHeader>
                      <Table.ColumnHeader>Team</Table.ColumnHeader>
                      <Table.ColumnHeader>Wins</Table.ColumnHeader>
                      <Table.ColumnHeader>Losses</Table.ColumnHeader>
                      <Table.ColumnHeader>PD</Table.ColumnHeader>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {standings.map((s, idx) => {
                      const name = teamNameDisplay(s.teamId);
                      const rec = rrRecordByTeamId.get(String(s.teamId)) ?? {
                        wins: s.wins ?? 0,
                        losses: 0,
                      };
                      return (
                        <Table.Row key={String(s.teamId)}>
                          <Table.Cell>{idx + 1}</Table.Cell>
                          <Table.Cell fontWeight="600">{name}</Table.Cell>
                          <Table.Cell>{rec.wins}</Table.Cell>
                          <Table.Cell>{rec.losses}</Table.Cell>
                          <Table.Cell>{s.pointDiff}</Table.Cell>
                        </Table.Row>
                      );
                    })}
                  </Table.Body>
                </Table.Root>
              </Card.Body>
            </Card.Root>
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
                    collection={phaseCollection}
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
                      {phaseCollection.items.map((item) => (
                        <Select.Item key={item.value} item={item}>
                          {item.label}
                        </Select.Item>
                      ))}
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

                      const aSeed = seedByTeamId.get(String(m.teamAId));
                      const bSeed = seedByTeamId.get(String(m.teamBId));

                      const aNameBase = teamNameDisplay(m.teamAId);
                      const bNameBase = teamNameDisplay(m.teamBId);

                      const aName =
                        m.phase === "SF" && aSeed
                          ? `(${aSeed}) ${aNameBase}`
                          : aNameBase;
                      const bName =
                        m.phase === "SF" && bSeed
                          ? `(${bSeed}) ${bNameBase}`
                          : bNameBase;

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
                          ? aNameBase
                          : bNameBase;

                      const inputsDisabled = !tid || tournamentComplete;

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
                              disabled={inputsDisabled}
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
                              disabled={inputsDisabled}
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
                              disabled={inputsDisabled || !!row.saving}
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
