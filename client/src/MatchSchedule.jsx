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
  Trophy,
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
  // Expect shape: { players: [{name}, {name}] }
  const rawPlayers = team?.players ?? [];
  const names = Array.isArray(rawPlayers)
    ? rawPlayers
        .map((p) => (typeof p === "string" ? p : p?.name))
        .filter(Boolean)
    : [];

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

function validateScore(phase, a, b) {
  const scoreA = Number(a);
  const scoreB = Number(b);

  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB)) {
    return "Scores must be whole numbers.";
  }
  if (scoreA < 0 || scoreB < 0) return "Scores can’t be negative.";
  if (scoreA === scoreB) return "Ties not supported.";

  const diff = Math.abs(scoreA - scoreB);
  if (diff < 2) return "Team has to win by 2.";

  const min = phase === "RR" ? 11 : 15;
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

export default function MatchSchedule() {
  const navigate = useNavigate();

  const [status, setStatus] = useState("loading"); // loading | ok | error | no-tournament
  const [state, setState] = useState(null);

  // Important: teams that include players so we can show (HADD, HADD)
  const [teamsWithPlayers, setTeamsWithPlayers] = useState([]);

  const [phaseFilter, setPhaseFilter] = useState("ALL");
  const [query, setQuery] = useState("");

  // { [matchId]: { scoreA: string, scoreB: string, saving: boolean, error: string|null } }
  const [edits, setEdits] = useState({});

  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");

  const [resettingPlayoffs, setResettingPlayoffs] = useState(false);
  const [resetPlayoffsError, setResetPlayoffsError] = useState("");

  const [advancingSemis, setAdvancingSemis] = useState(false);
  const [advanceSemisError, setAdvanceSemisError] = useState("");

  const [advancingFinals, setAdvancingFinals] = useState(false);
  const [advanceFinalsError, setAdvanceFinalsError] = useState("");

  const tid = getCurrentTournamentId();

  function withTid(path) {
    const u = new URL(path, window.location.origin);
    if (tid) u.searchParams.set("tournamentId", tid);
    return u.pathname + u.search;
  }

  async function loadTeamsForDisplay(tournamentId) {
    if (!tournamentId) {
      setTeamsWithPlayers([]);
      return;
    }

    try {
      // Prefer the endpoint that returns team + players
      const res = await fetch(`/api/tournaments/${tournamentId}/teams`);
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      // Some backends return { teams: [...] }
      const teams = Array.isArray(data)
        ? data
        : Array.isArray(data?.teams)
        ? data.teams
        : [];
      setTeamsWithPlayers(teams);
    } catch (e) {
      console.warn("Could not load teams-with-players:", e);
      // fallback: state.teams may exist but often won’t include players
      setTeamsWithPlayers(Array.isArray(state?.teams) ? state.teams : []);
    }
  }

  async function loadState() {
    try {
      setStatus("loading");
      setResetError("");
      setResetPlayoffsError("");
      setAdvanceSemisError("");
      setAdvanceFinalsError("");

      if (!tid) {
        setState(null);
        setTeamsWithPlayers([]);
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

      // second fetch gives us player names so we can build (HADD, HADD)
      await loadTeamsForDisplay(tid);

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
    setTeamsWithPlayers([]);
    setEdits({});
    loadState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tid]);

  const teamsById = useMemo(() => {
    const map = new Map();
    const source = teamsWithPlayers?.length
      ? teamsWithPlayers
      : state?.teams ?? [];
    for (const t of source) map.set(String(t.id), t);
    return map;
  }, [teamsWithPlayers, state]);

  const teamDisplay = useMemo(() => {
    return (teamId) => {
      const t = teamsById.get(String(teamId));
      if (!t) return `Team ${teamId}`;
      return formatTeamDisplay(t);
    };
  }, [teamsById]);

  const standings = state?.standings ?? [];

  const seedByTeamId = useMemo(() => {
    const map = new Map();
    standings.slice(0, 4).forEach((s, idx) => {
      map.set(String(s.teamId), idx + 1); // 1..4
    });
    return map;
  }, [standings]);

  const rrMatches = useMemo(
    () => (state?.rrMatches ?? []).map((m) => ({ ...m, phase: "RR" })),
    [state]
  );
  const semis = useMemo(
    () => (state?.semis ?? []).map((m) => ({ ...m, phase: "SF" })),
    [state]
  );
  const finals = useMemo(
    () => (state?.finals ?? []).map((m) => ({ ...m })),
    [state]
  );

  const rrComplete = useMemo(() => {
    return rrMatches.length > 0 && rrMatches.every((m) => m.winnerId);
  }, [rrMatches]);

  const rrIncompleteMatches = useMemo(
    () => rrMatches.filter((m) => !m.winnerId),
    [rrMatches]
  );

  const semisExist = semis.length > 0;
  const semisComplete = semisExist && semis.every((m) => m.winnerId);

  const finalsExist = finals.length > 0;

  const finalMatch = useMemo(() => {
    return finals.find((m) => m.phase === "FINAL" || m.id === "FINAL") ?? null;
  }, [finals]);

  const thirdMatch = useMemo(() => {
    return finals.find((m) => m.phase === "THIRD" || m.id === "THIRD") ?? null;
  }, [finals]);

  const tournamentComplete = useMemo(() => {
    if (!finalMatch && !thirdMatch) return false;
    const finalDone = finalMatch ? !!finalMatch.winnerId : true;
    const thirdDone = thirdMatch ? !!thirdMatch.winnerId : true;
    return finalDone && thirdDone;
  }, [finalMatch, thirdMatch]);

  const championTeamId = finalMatch?.winnerId ?? null;
  const championName = championTeamId ? teamDisplay(championTeamId) : "";

  const tournamentInProgress = useMemo(() => {
    const count = rrMatches.length + semis.length + finals.length;
    return count > 0 && !tournamentComplete;
  }, [rrMatches, semis, finals, tournamentComplete]);

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
        [side]: String(value).replace(/[^\d]/g, ""),
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

    const err = validateScore(match.phase, scoreA, scoreB);
    if (err) {
      setEdits((prev) => ({
        ...prev,
        [matchId]: { ...prev[matchId], error: err },
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
    ) {
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
    if (
      !confirm(
        "Reset playoffs only? (Semis/Final/Third will be cleared, RR stays.)"
      )
    ) {
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

  async function advanceToSemis() {
    setAdvanceSemisError("");

    if (!tid) {
      setAdvanceSemisError("No tournament selected.");
      return;
    }

    if (!rrComplete) {
      const missing = rrIncompleteMatches.map((m) => m.id).join(", ");
      setAdvanceSemisError(
        `Round robin isn't complete yet. Score these matches first: ${missing}`
      );
      return;
    }

    if (semisExist) {
      setAdvanceSemisError(
        "Semifinals already exist. Use Reset Playoffs if you want to regenerate."
      );
      return;
    }

    setAdvancingSemis(true);
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
      setAdvanceSemisError(e?.message || "Could not generate semifinals.");
    } finally {
      setAdvancingSemis(false);
    }
  }

  async function advanceToFinals() {
    setAdvanceFinalsError("");

    if (!tid) {
      setAdvanceFinalsError("No tournament selected.");
      return;
    }

    if (finalsExist) {
      setPhaseFilter("FINAL");
      setQuery("");
      return;
    }

    if (!semisExist) {
      setAdvanceFinalsError(
        "Semifinals don't exist yet. Advance to Semis first."
      );
      return;
    }

    if (!semisComplete) {
      setAdvanceFinalsError(
        "Semifinals aren’t complete yet. Enter both semi scores first."
      );
      return;
    }

    setAdvancingFinals(true);
    try {
      await loadState();
      if (!(state?.finals ?? []).length) {
        setAdvanceFinalsError(
          "Finals should appear after both semis are scored. If they still don’t show up, your backend needs to create FINAL and THIRD matches when semis complete."
        );
      } else {
        setPhaseFilter("FINAL");
        setQuery("");
      }
    } finally {
      setAdvancingFinals(false);
    }
  }

  const allMatches = useMemo(() => {
    const list = [...rrMatches, ...semis, ...finals];
    list.sort((a, b) => {
      const aDone = !!a.winnerId;
      const bDone = !!b.winnerId;
      if (aDone !== bDone) return aDone ? 1 : -1;

      const order = { RR: 0, SF: 1, FINAL: 2, THIRD: 3 };
      const pa = order[a.phase] ?? 99;
      const pb = order[b.phase] ?? 99;
      if (pa !== pb) return pa - pb;
      return String(a.id ?? "").localeCompare(String(b.id ?? ""));
    });
    return list;
  }, [rrMatches, semis, finals]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return allMatches.filter((m) => {
      if (phaseFilter !== "ALL" && m.phase !== phaseFilter) return false;
      if (!q) return true;

      const a = teamDisplay(m.teamAId).toLowerCase();
      const b = teamDisplay(m.teamBId).toLowerCase();
      const id = String(m.id ?? "").toLowerCase();
      return a.includes(q) || b.includes(q) || id.includes(q);
    });
  }, [allMatches, phaseFilter, query, teamDisplay]);

  function winnerText(m) {
    if (!m.winnerId) return "—";
    const a = teamDisplay(m.teamAId);
    const b = teamDisplay(m.teamBId);
    return String(m.winnerId) === String(m.teamAId) ? a : b;
  }

  function displayTeamForMatch(m, teamId) {
    const base = teamDisplay(teamId);

    if (m.phase === "SF") {
      const seed = seedByTeamId.get(String(teamId));
      if (seed) return `${seed}. ${base}`;
    }

    return base;
  }

  // ✅ Nuclear option: force an opaque paint layer + kill any transparency
  // - backgroundColor uses CSS variable with fallback
  // - zIndex very high
  // - transform creates its own compositor layer (Safari fix)
  // - boxShadow + border helps visually separate
  const stickyStyle = {
    backgroundColor: "var(--chakra-colors-cream-50, #FFF7E6)",
    opacity: 1,
    transform: "translateZ(0)",
    WebkitTransform: "translateZ(0)",
    WebkitBackfaceVisibility: "hidden",
    backfaceVisibility: "hidden",
    WebkitBackdropFilter: "none",
    backdropFilter: "none",
  };

  return (
    <Box bg="cream.50" minH="calc(100vh - 64px)" pb={{ base: 10, md: 12 }}>
      {/* Sticky header wrapper (FORCED opaque) */}
      <Box
        position="sticky"
        top="0"
        zIndex={9999}
        borderBottom="1px solid"
        borderColor="border"
        boxShadow="md"
        isolation="isolate"
        overflow="hidden"
        style={stickyStyle}
      >
        {/* Also paint the inner container, in case the bleed is inside */}
        <Container maxW="6xl" py={{ base: 4, md: 5 }} style={stickyStyle}>
          <Stack gap={3}>
            <Flex
              align={{ base: "stretch", md: "center" }}
              justify="space-between"
              direction={{ base: "column", md: "row" }}
              gap={3}
            >
              <HStack gap={3} wrap="wrap">
                <IconButton
                  aria-label="Home"
                  variant="outline"
                  onClick={() => navigate("/")}
                >
                  <Home size={18} />
                </IconButton>

                <IconButton
                  aria-label="Calendar"
                  variant="ghost"
                  p={0}
                  minW="auto"
                  h="auto"
                  bg="transparent"
                  border="none"
                  _hover={{ bg: "transparent" }}
                  _active={{ bg: "transparent" }}
                  _focusVisible={{ boxShadow: "none" }}
                >
                  <CalendarDays size={18} />
                </IconButton>

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

                {tid && status === "ok" ? (
                  <>
                    <Badge variant={tournamentInProgress ? "pickle" : "club"}>
                      Tournament In Progress{" "}
                      <Box as="span" ml={2} color="green.500">
                        ●
                      </Box>
                    </Badge>

                    {tournamentComplete ? (
                      <Badge variant="pickle">Tournament Complete ✅</Badge>
                    ) : null}
                  </>
                ) : null}
              </HStack>

              <HStack
                gap={2}
                justify={{ base: "flex-start", md: "flex-end" }}
                wrap="wrap"
              >
                <Button
                  variant="outline"
                  onClick={advanceToSemis}
                  disabled={
                    !tid ||
                    advancingSemis ||
                    tournamentComplete ||
                    semisExist ||
                    !rrComplete
                  }
                >
                  <HStack gap={2}>
                    <ChevronsRight size={16} />
                    <Text>
                      {advancingSemis ? "Advancing…" : "Advance to Semis"}
                    </Text>
                  </HStack>
                </Button>

                <Button
                  variant="outline"
                  onClick={advanceToFinals}
                  disabled={!tid || advancingFinals || tournamentComplete}
                >
                  <HStack gap={2}>
                    <ChevronsRight size={16} />
                    <Text>
                      {advancingFinals ? "Advancing…" : "Advance to Finals"}
                    </Text>
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

            <Text opacity={0.85}>
              Enter scores for round robin and playoffs.
            </Text>

            {tournamentComplete ? (
              <Box
                border="1px solid"
                borderColor="green.200"
                bg="green.50"
                p={3}
                borderRadius="lg"
              >
                <HStack justify="space-between" wrap="wrap" gap={2}>
                  <HStack gap={2}>
                    <Trophy size={18} />
                    <Text fontWeight="800">
                      Tournament Complete{championName ? ": Winners" : ""}
                    </Text>
                    {championName ? (
                      <Text fontWeight="700">{championName}</Text>
                    ) : null}
                  </HStack>
                  <Text fontSize="sm" opacity={0.75}>
                    Scores are locked.
                  </Text>
                </HStack>
              </Box>
            ) : null}
          </Stack>
        </Container>
      </Box>

      {/* Give content enough clearance so it doesn't sit under the header */}
      <Container maxW="6xl" pt={{ base: 8, md: 10 }}>
        <Stack gap={6}>
          {advanceSemisError ? (
            <Box
              border="1px solid"
              borderColor="red.200"
              bg="red.50"
              p={3}
              borderRadius="lg"
            >
              <Text color="red.700" fontSize="sm">
                {advanceSemisError}
              </Text>
            </Box>
          ) : null}

          {advanceFinalsError ? (
            <Box
              border="1px solid"
              borderColor="red.200"
              bg="red.50"
              p={3}
              borderRadius="lg"
            >
              <Text color="red.700" fontSize="sm">
                {advanceFinalsError}
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
                      const played = s.gamesPlayed ?? s.played ?? null;
                      const losses =
                        played != null
                          ? Math.max(0, Number(played) - Number(s.wins ?? 0))
                          : "—";

                      return (
                        <Table.Row key={String(s.teamId)}>
                          <Table.Cell>{idx + 1}</Table.Cell>
                          <Table.Cell fontWeight="600">
                            {teamDisplay(s.teamId)}
                          </Table.Cell>
                          <Table.Cell>{s.wins}</Table.Cell>
                          <Table.Cell>{losses}</Table.Cell>
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

          {/* Matches table */}
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

                      const aName = displayTeamForMatch(m, m.teamAId);
                      const bName = displayTeamForMatch(m, m.teamBId);

                      const row = edits[m.id] ?? {
                        scoreA: "",
                        scoreB: "",
                        saving: false,
                        error: null,
                      };

                      const locked = tournamentComplete;

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
                              disabled={!tid || locked}
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
                              disabled={!tid || locked}
                            />
                          </Table.Cell>

                          <Table.Cell>
                            <Text fontWeight="600">{winnerText(m)}</Text>
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
                              disabled={!tid || !!row.saving || locked}
                            >
                              <HStack gap={2}>
                                <Save size={16} />
                                <Text>{locked ? "Locked" : "Save"}</Text>
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

          {/* Finals quick summary (improves finals section labeling/visibility) */}
          {tid && status === "ok" && finalsExist ? (
            <Card.Root>
              <Card.Body>
                <Heading size="sm" mb={3}>
                  Finals
                </Heading>

                <Stack gap={3}>
                  {finalMatch ? (
                    <Box
                      border="1px solid"
                      borderColor="border"
                      borderRadius="xl"
                      p={4}
                      bg="white"
                    >
                      <HStack justify="space-between" wrap="wrap">
                        <Badge variant="pickle">Final</Badge>
                        <Text fontSize="sm" opacity={0.7}>
                          {finalMatch.id}
                        </Text>
                      </HStack>
                      <Text mt={2} fontWeight="700">
                        {teamDisplay(finalMatch.teamAId)} vs{" "}
                        {teamDisplay(finalMatch.teamBId)}
                      </Text>
                      <Text mt={1} opacity={0.85}>
                        Winner: <b>{winnerText(finalMatch)}</b>
                      </Text>
                    </Box>
                  ) : null}

                  {thirdMatch ? (
                    <Box
                      border="1px solid"
                      borderColor="border"
                      borderRadius="xl"
                      p={4}
                      bg="white"
                    >
                      <HStack justify="space-between" wrap="wrap">
                        <Badge variant="club">Third Place</Badge>
                        <Text fontSize="sm" opacity={0.7}>
                          {thirdMatch.id}
                        </Text>
                      </HStack>
                      <Text mt={2} fontWeight="700">
                        {teamDisplay(thirdMatch.teamAId)} vs{" "}
                        {teamDisplay(thirdMatch.teamBId)}
                      </Text>
                      <Text mt={1} opacity={0.85}>
                        Winner: <b>{winnerText(thirdMatch)}</b>
                      </Text>
                    </Box>
                  ) : null}
                </Stack>
              </Card.Body>
            </Card.Root>
          ) : null}
        </Stack>
      </Container>
    </Box>
  );
}
