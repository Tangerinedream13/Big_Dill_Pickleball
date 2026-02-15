// client/src/PlayersPage.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Badge,
  Box,
  Button,
  Container,
  Flex,
  Heading,
  HStack,
  Input,
  Stack,
  Text,
  IconButton,
  Dialog,
  Portal,
  Table,
  Select,
  Card,
  createListCollection,
} from "@chakra-ui/react";
import {
  Plus,
  Search,
  Trash2,
  UserRound,
  ArrowLeft,
  Users,
  User,
  CalendarDays,
  Home,
} from "lucide-react";

import { consumeOptimisticPlayer } from "./optimisticPlayerStore";
import { getCurrentTournamentId } from "./tournamentStore";
import StickyPageHeader from "./components/StickyPageHeader";
import { API_BASE } from "./apiBase";

/* -----------------------------
   DUPR helpers
------------------------------ */

function duprTierFromNumber(dupr) {
  const n = Number(dupr);
  if (!Number.isFinite(n)) return "Unrated";
  if (n >= 5.0) return "Elite (5.0+)";
  if (n >= 4.0) return "Advanced (4.0–4.99)";
  if (n >= 3.0) return "Intermediate (3.0–3.99)";
  if (n >= 2.0) return "Beginner (2.0–2.99)";
  return "< 2.0";
}

function formatDupr(dupr) {
  if (dupr === null || dupr === undefined || dupr === "") return "—";
  const n = Number(dupr);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(2);
}

export default function PlayersPage() {
  const navigate = useNavigate();
  const tid = getCurrentTournamentId();

  function withTid(path) {
    const base = (API_BASE || "").replace(/\/$/, "");
    const p = path.startsWith("/") ? path : `/${path}`;
    const u = new URL(`${base}${p}`, window.location.origin);
    if (tid) u.searchParams.set("tournamentId", tid);
    return u.toString();
  }

  const [players, setPlayers] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ok | error
  const [query, setQuery] = useState("");

  // Create player modal
  const [openPlayer, setOpenPlayer] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDupr, setNewDupr] = useState("");

  // Teams section
  const [teamsStatus, setTeamsStatus] = useState("idle"); // idle | loading | ok | error
  const [teamsError, setTeamsError] = useState("");
  const [teams, setTeams] = useState([]);

  // Create team modal
  const [openTeam, setOpenTeam] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamAId, setTeamAId] = useState("");
  const [teamBId, setTeamBId] = useState("");
  const [createTeamStatus, setCreateTeamStatus] = useState("idle"); // idle | saving | error
  const [createTeamError, setCreateTeamError] = useState("");

  // Delete team state
  const [deletingTeamId, setDeletingTeamId] = useState(null);

  // Rename team modal
  const [openRename, setOpenRename] = useState(false);
  const [renameTeamId, setRenameTeamId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameStatus, setRenameStatus] = useState("idle"); // idle | saving | error
  const [renameError, setRenameError] = useState("");

  // Generate matches
  const [generateStatus, setGenerateStatus] = useState("idle"); // idle | saving | ok | error
  const [generateError, setGenerateError] = useState("");

  async function loadPlayers() {
    try {
      if (!tid) {
        setPlayers([]);
        setStatus("ok");
        return;
      }

      setStatus("loading");
      const res = await fetch(`${API_BASE}/api/tournaments/${tid}/players`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const serverPlayers = await res.json();

      const optimistic = consumeOptimisticPlayer();
      const optimisticMatchesTid =
        optimistic && String(optimistic.tournamentId ?? "") === String(tid);

      if (optimisticMatchesTid) {
        setPlayers([
          { ...optimistic, _optimistic: true },
          ...serverPlayers.filter(
            (p) =>
              (p.email ?? "").toLowerCase() !==
              (optimistic.email ?? "").toLowerCase()
          ),
        ]);
      } else {
        setPlayers(serverPlayers);
      }

      setStatus("ok");
    } catch (e) {
      console.error(e);
      setStatus("error");
    }
  }

  async function loadTeams() {
    setTeamsError("");
    setTeamsStatus("loading");

    try {
      if (!tid) {
        setTeams([]);
        setTeamsStatus("ok");
        return;
      }

      const res = await fetch(`${API_BASE}/api/tournaments/${tid}/teams`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      const rawTeams = Array.isArray(data?.teams)
        ? data.teams
        : Array.isArray(data)
        ? data
        : [];

      const normalized = rawTeams
        .map((t) => ({
          id: String(t.id ?? t.teamId ?? ""),
          name: t.name ?? t.teamName ?? "",
          players: Array.isArray(t.players) ? t.players : [],
        }))
        .filter((t) => t.id);

      setTeams(normalized);
      setTeamsStatus("ok");
    } catch (e) {
      console.error(e);
      setTeamsStatus("error");
      setTeamsError(e.message || "Could not load teams.");
    }
  }

  useEffect(() => {
    loadPlayers();
    loadTeams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tid]);

  const filteredPlayers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return players;

    return players.filter((p) => {
      const name = (p.name ?? "").toLowerCase();
      const duprVal = p.duprRating ?? p.dupr_rating ?? p.dupr ?? "";
      return name.includes(q) || String(duprVal).toLowerCase().includes(q);
    });
  }, [players, query]);

  const assignedPlayerIds = useMemo(() => {
    const s = new Set();
    for (const t of teams ?? []) {
      for (const p of t.players ?? []) {
        if (p?.id != null) s.add(String(p.id));
      }
    }
    return s;
  }, [teams]);

  const playerOptionsBase = useMemo(() => {
    const items = [...players]
      .filter((p) => !p._optimistic)
      .filter((p) => !assignedPlayerIds.has(String(p.id)))
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
      .map((p) => ({
        value: String(p.id),
        label: `${p.name ?? "Unnamed"}${
          p.duprRating != null ? ` (${formatDupr(p.duprRating)})` : ""
        }`,
      }));

    return createListCollection({ items });
  }, [players, assignedPlayerIds]);

  const playerOptionsA = playerOptionsBase;

  const playerOptionsB = useMemo(() => {
    const items = playerOptionsBase.items.filter(
      (opt) => opt.value !== teamAId
    );
    return createListCollection({ items });
  }, [playerOptionsBase, teamAId]);

  useEffect(() => {
    if (teamAId && teamBId && teamAId === teamBId) setTeamBId("");
  }, [teamAId, teamBId]);

  const canCreateTeam =
    tid &&
    teamAId &&
    teamBId &&
    teamAId !== teamBId &&
    createTeamStatus !== "saving";

  async function createPlayer() {
    const name = newName.trim();
    if (!name) return;

    let duprRating = null;
    if (newDupr.trim() !== "") {
      const n = Number(newDupr);
      if (!Number.isFinite(n)) {
        alert("DUPR must be a number (ex: 3.25).");
        return;
      }
      duprRating = Math.round(n * 100) / 100;
    }

    try {
      if (!tid) {
        alert("Select a tournament first.");
        return;
      }

      const res = await fetch(withTid("/api/players"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, duprRating }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);

      setNewName("");
      setNewDupr("");
      setOpenPlayer(false);
      await loadPlayers();
    } catch (e) {
      console.error(e);
      alert(e.message || "Could not create player.");
    }
  }

  async function deletePlayer(id) {
    // eslint-disable-next-line no-restricted-globals
    if (!confirm("Delete this player?")) return;

    try {
      const res = await fetch(withTid(`/api/players/${id}`), {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);
      await loadPlayers();
      await loadTeams();
    } catch (e) {
      console.error(e);
      alert(e.message || "Could not delete player.");
    }
  }

  async function createTeam() {
    setCreateTeamError("");

    if (!tid) {
      setCreateTeamError("No tournament selected.");
      setCreateTeamStatus("error");
      return;
    }
    if (!teamAId || !teamBId || teamAId === teamBId) {
      setCreateTeamError("Pick two different players.");
      setCreateTeamStatus("error");
      return;
    }

    setCreateTeamStatus("saving");

    try {
      const res = await fetch(`${API_BASE}/api/tournaments/${tid}/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerAId: Number(teamAId),
          playerBId: Number(teamBId),
          teamName: teamName.trim() || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to create team.");

      setTeamName("");
      setTeamAId("");
      setTeamBId("");
      setOpenTeam(false);
      setCreateTeamStatus("idle");

      await loadTeams();
    } catch (e) {
      console.error(e);
      setCreateTeamStatus("error");
      setCreateTeamError(e.message || "Could not create team.");
    }
  }

  function openRenameModal(team) {
    setRenameError("");
    setRenameStatus("idle");
    setRenameTeamId(team?.id ?? null);
    setRenameValue(team?.name ?? "");
    setOpenRename(true);
  }

  async function saveRename() {
    setRenameError("");

    if (!tid) {
      setRenameError("No tournament selected.");
      setRenameStatus("error");
      return;
    }

    const teamId = renameTeamId;
    const name = renameValue.trim();
    if (!teamId) return;

    if (!name) {
      setRenameError("Team name is required.");
      setRenameStatus("error");
      return;
    }

    setRenameStatus("saving");
    try {
      const res = await fetch(withTid(`/api/teams/${teamId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, tournamentId: Number(tid) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to rename team.");

      setOpenRename(false);
      setRenameStatus("idle");
      await loadTeams();
    } catch (e) {
      console.error(e);
      setRenameStatus("error");
      setRenameError(e.message || "Could not rename team.");
    }
  }

  async function deleteTeam(teamId) {
    if (!tid) {
      alert("No tournament selected.");
      return;
    }
    // eslint-disable-next-line no-restricted-globals
    if (!confirm("Delete this doubles team?")) return;

    setDeletingTeamId(teamId);
    setTeamsError("");

    try {
      const res = await fetch(withTid(`/api/teams/${teamId}`), {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not delete team.");

      await loadTeams();
    } catch (e) {
      console.error(e);
      setTeamsError(e.message || "Could not delete team.");
    } finally {
      setDeletingTeamId(null);
    }
  }

  async function generateMatches() {
    setGenerateError("");

    if (!tid) {
      setGenerateError("No tournament selected.");
      setGenerateStatus("error");
      return;
    }
    if (teams.length < 2) {
      setGenerateError("Create at least 2 teams first.");
      setGenerateStatus("error");
      return;
    }

    setGenerateStatus("saving");

    try {
      const res = await fetch(withTid("/api/roundrobin/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gamesPerTeam: 4 }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data?.error || "Failed to generate matches.");

      setGenerateStatus("ok");
      navigate("/matches");
    } catch (e) {
      console.error(e);
      setGenerateStatus("error");
      setGenerateError(e.message || "Could not generate matches.");
    }
  }

  return (
    <Box bg="cream.50" minH="calc(100vh - 64px)" pb={{ base: 10, md: 12 }}>
      {/* Sticky header via shared component (matches MatchSchedule) */}
      <StickyPageHeader>
        <Stack gap={3} w="100%">
          <Flex
            align={{ base: "stretch", md: "center" }}
            justify="space-between"
            direction={{ base: "column", md: "row" }}
            gap={3}
          >
            <HStack gap={3} wrap="wrap" align="center">
              <IconButton
                aria-label="Home"
                variant="outline"
                size="md"
                onClick={() => navigate("/")}
              >
                <Home size={18} />
              </IconButton>

              {/* Page icon – no box */}
              <User size={18} />

              <Heading size="lg" letterSpacing="-0.02em">
                Players
              </Heading>

              <Badge variant="pickle">{players?.length ?? 0} total</Badge>

              {status === "loading" && <Badge variant="club">Loading…</Badge>}
              {status === "error" && (
                <Badge variant="club">Backend issue</Badge>
              )}
            </HStack>
            {/* keep empty to mirror MatchSchedule header spacing */}
            <Box />
          </Flex>

          {/* Second line helps match banner height/feel */}
          <Text opacity={0.85}>
            Search by <b>name</b> or <b>DUPR</b>. Then create doubles teams
            below.
          </Text>
        </Stack>
      </StickyPageHeader>

      <Container maxW="6xl" pt={{ base: 8, md: 10 }}>
        <Stack gap={6}>
          {/* Actions row (search + buttons) */}
          <Flex
            align={{ base: "stretch", md: "center" }}
            justify="space-between"
            direction={{ base: "column", md: "row" }}
            gap={4}
          >
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
                placeholder="Search name or DUPR…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </Box>

            <HStack
              gap={2}
              justify={{ base: "flex-start", md: "flex-end" }}
              wrap="wrap"
            >
              <Button
                variant="pickle"
                onClick={() => setOpenPlayer(true)}
                disabled={!tid}
              >
                <HStack gap={2}>
                  <Plus size={16} />
                  <Text>New Player</Text>
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

          {/* Players Table */}
          <Box
            bg="white"
            border="1px solid"
            borderColor="border"
            borderRadius="2xl"
            boxShadow="soft"
            overflow="hidden"
          >
            <Box p={{ base: 4, md: 5 }}>
              {filteredPlayers.length === 0 ? (
                <Box
                  border="1px dashed"
                  borderColor="border"
                  borderRadius="2xl"
                  p={{ base: 6, md: 10 }}
                  textAlign="center"
                  bg="cream.50"
                >
                  <Heading size="md" mb={2}>
                    No players found
                  </Heading>
                  <Text opacity={0.8} mb={5}>
                    {tid
                      ? "Try a different search, or add your first player."
                      : "Select a tournament first on the Home page."}
                  </Text>
                  <Button
                    variant="pickle"
                    onClick={() => setOpenPlayer(true)}
                    disabled={!tid}
                  >
                    Add Player
                  </Button>
                </Box>
              ) : (
                <Box overflowX="auto">
                  <Table.Root size="md" variant="outline">
                    <Table.Header>
                      <Table.Row>
                        <Table.ColumnHeader>Name</Table.ColumnHeader>
                        <Table.ColumnHeader>DUPR</Table.ColumnHeader>
                        <Table.ColumnHeader>Tier</Table.ColumnHeader>
                        <Table.ColumnHeader textAlign="end">
                          Actions
                        </Table.ColumnHeader>
                      </Table.Row>
                    </Table.Header>

                    <Table.Body>
                      {filteredPlayers.map((p) => {
                        const duprVal =
                          p.duprRating ?? p.dupr_rating ?? p.dupr ?? null;
                        const tier = p.duprTier ?? duprTierFromNumber(duprVal);

                        return (
                          <Table.Row
                            key={p.id ?? p.email ?? p.name}
                            bg={p._optimistic ? "green.50" : undefined}
                          >
                            <Table.Cell fontWeight="600">
                              {p.name ?? "Unnamed"}
                              {p._optimistic ? (
                                <Badge ml={2} variant="pickle">
                                  Just joined
                                </Badge>
                              ) : null}
                            </Table.Cell>

                            <Table.Cell>
                              <Badge variant="club">
                                {formatDupr(duprVal)}
                              </Badge>
                            </Table.Cell>

                            <Table.Cell>
                              <Badge variant="club">{tier}</Badge>
                            </Table.Cell>

                            <Table.Cell textAlign="end">
                              {!p._optimistic ? (
                                <IconButton
                                  aria-label="Delete player"
                                  variant="outline"
                                  onClick={() => deletePlayer(p.id)}
                                >
                                  <Trash2 size={16} />
                                </IconButton>
                              ) : null}
                            </Table.Cell>
                          </Table.Row>
                        );
                      })}
                    </Table.Body>
                  </Table.Root>
                </Box>
              )}
            </Box>
          </Box>

          {/* Doubles Teams Section */}
          <Card.Root>
            <Card.Body>
              <Flex
                align={{ base: "stretch", md: "center" }}
                justify="space-between"
                direction={{ base: "column", md: "row" }}
                gap={3}
              >
                <HStack gap={3} wrap="wrap">
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
                    <Users size={18} />
                  </Box>

                  <Heading size="md">Doubles Teams</Heading>

                  {teamsStatus === "loading" ? (
                    <Badge variant="club">Loading…</Badge>
                  ) : (
                    <Badge variant="pickle">{teams.length} teams</Badge>
                  )}

                  {teamsError ? <Badge variant="club">Issue</Badge> : null}
                </HStack>

                <HStack
                  gap={2}
                  justify={{ base: "flex-start", md: "flex-end" }}
                  wrap="wrap"
                >
                  <Button
                    variant="outline"
                    onClick={loadTeams}
                    disabled={!tid || teamsStatus === "loading"}
                  >
                    Refresh
                  </Button>

                  <Button
                    variant="pickle"
                    onClick={() => setOpenTeam(true)}
                    disabled={!tid}
                  >
                    <HStack gap={2}>
                      <Plus size={16} />
                      <Text>Create Team</Text>
                    </HStack>
                  </Button>

                  <Button
                    variant="outline"
                    onClick={generateMatches}
                    disabled={!tid || generateStatus === "saving"}
                  >
                    <HStack gap={2}>
                      <CalendarDays size={16} />
                      <Text>
                        {generateStatus === "saving"
                          ? "Generating…"
                          : "Generate Matches"}
                      </Text>
                    </HStack>
                  </Button>
                </HStack>
              </Flex>

              {generateError ? (
                <Box
                  mt={3}
                  border="1px solid"
                  borderColor="red.200"
                  bg="red.50"
                  p={3}
                  borderRadius="lg"
                >
                  <Text color="red.700" fontSize="sm">
                    {generateError}
                  </Text>
                </Box>
              ) : null}

              {teamsError ? (
                <Text mt={3} fontSize="sm" color="red.600">
                  {teamsError}
                </Text>
              ) : null}

              <Box mt={4} overflowX="auto">
                {teams.length === 0 ? (
                  <Box
                    border="1px dashed"
                    borderColor="border"
                    borderRadius="2xl"
                    p={{ base: 6, md: 10 }}
                    textAlign="center"
                    bg="cream.50"
                  >
                    <Heading size="sm" mb={2}>
                      No teams yet
                    </Heading>
                    <Text opacity={0.8} mb={4}>
                      Create doubles teams (2 players per team) to generate
                      matches.
                    </Text>
                    <Button
                      variant="pickle"
                      onClick={() => setOpenTeam(true)}
                      disabled={!tid}
                    >
                      Create Team
                    </Button>
                  </Box>
                ) : (
                  <Table.Root size="md" variant="outline">
                    <Table.Header>
                      <Table.Row>
                        <Table.ColumnHeader>Team</Table.ColumnHeader>
                        <Table.ColumnHeader>Players</Table.ColumnHeader>
                        <Table.ColumnHeader textAlign="end">
                          Actions
                        </Table.ColumnHeader>
                      </Table.Row>
                    </Table.Header>

                    <Table.Body>
                      {teams.map((t) => (
                        <Table.Row key={t.id}>
                          <Table.Cell fontWeight="700">{t.name}</Table.Cell>

                          <Table.Cell>
                            <Text fontWeight="600">
                              {(t.players ?? [])
                                .map((p) => p.name)
                                .filter(Boolean)
                                .join(" / ") || "—"}
                            </Text>
                          </Table.Cell>

                          <Table.Cell textAlign="end">
                            <HStack justify="flex-end" gap={2} wrap="wrap">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openRenameModal(t)}
                                disabled={!tid}
                              >
                                Rename
                              </Button>

                              <IconButton
                                aria-label="Delete team"
                                variant="outline"
                                onClick={() => deleteTeam(t.id)}
                                disabled={!tid || deletingTeamId === t.id}
                              >
                                <Trash2 size={16} />
                              </IconButton>
                            </HStack>
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Root>
                )}
              </Box>
            </Card.Body>
          </Card.Root>

          {/* Create Player Modal */}
          <Dialog.Root
            open={openPlayer}
            onOpenChange={(e) => setOpenPlayer(e.open)}
          >
            <Portal>
              <Dialog.Backdrop />
              <Dialog.Positioner>
                <Dialog.Content>
                  <Dialog.Header>
                    <Dialog.Title>Add Player</Dialog.Title>
                  </Dialog.Header>

                  <Dialog.Body>
                    <Stack gap={3}>
                      <Input
                        placeholder="Player name"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                      />
                      <Input
                        placeholder="DUPR (optional)"
                        value={newDupr}
                        onChange={(e) => setNewDupr(e.target.value)}
                        inputMode="decimal"
                      />
                    </Stack>
                  </Dialog.Body>

                  <Dialog.Footer>
                    <HStack gap={2}>
                      <Button
                        variant="outline"
                        onClick={() => setOpenPlayer(false)}
                      >
                        Cancel
                      </Button>
                      <Button variant="pickle" onClick={createPlayer}>
                        Create
                      </Button>
                    </HStack>
                  </Dialog.Footer>
                </Dialog.Content>
              </Dialog.Positioner>
            </Portal>
          </Dialog.Root>

          {/* Create Team Modal */}
          <Dialog.Root
            open={openTeam}
            onOpenChange={(e) => setOpenTeam(e.open)}
          >
            <Portal>
              <Dialog.Backdrop />
              <Dialog.Positioner>
                <Dialog.Content>
                  <Dialog.Header>
                    <Dialog.Title>Create Doubles Team</Dialog.Title>
                  </Dialog.Header>

                  <Dialog.Body>
                    <Stack gap={4}>
                      {createTeamError ? (
                        <Box
                          border="1px solid"
                          borderColor="red.200"
                          bg="red.50"
                          borderRadius="lg"
                          p={3}
                        >
                          <Text color="red.700" fontSize="sm">
                            {createTeamError}
                          </Text>
                        </Box>
                      ) : null}

                      <Stack gap={2}>
                        <Text fontSize="sm" fontWeight="700">
                          Team name (optional)
                        </Text>
                        <Input
                          placeholder="ex: Dill Dealers"
                          value={teamName}
                          onChange={(e) => setTeamName(e.target.value)}
                          disabled={!tid || createTeamStatus === "saving"}
                        />
                        <Text fontSize="xs" opacity={0.7}>
                          Leave blank to auto-name.
                        </Text>
                      </Stack>

                      <Stack gap={2}>
                        <Text fontSize="sm" fontWeight="700">
                          Player 1 (only unassigned players)
                        </Text>
                        <Select.Root
                          collection={playerOptionsA}
                          value={teamAId ? [teamAId] : []}
                          onValueChange={(d) => setTeamAId(d.value?.[0] ?? "")}
                          disabled={!tid || createTeamStatus === "saving"}
                        >
                          <Select.Trigger>
                            <Select.ValueText placeholder="Select player 1" />
                          </Select.Trigger>
                          <Select.Content>
                            {playerOptionsA.items.map((opt) => (
                              <Select.Item key={opt.value} item={opt}>
                                {opt.label}
                              </Select.Item>
                            ))}
                          </Select.Content>
                        </Select.Root>
                      </Stack>

                      <Stack gap={2}>
                        <Text fontSize="sm" fontWeight="700">
                          Player 2 (only unassigned players)
                        </Text>
                        <Select.Root
                          collection={playerOptionsB}
                          value={teamBId ? [teamBId] : []}
                          onValueChange={(d) => setTeamBId(d.value?.[0] ?? "")}
                          disabled={!tid || createTeamStatus === "saving"}
                        >
                          <Select.Trigger>
                            <Select.ValueText placeholder="Select player 2" />
                          </Select.Trigger>
                          <Select.Content>
                            {playerOptionsB.items.map((opt) => (
                              <Select.Item key={opt.value} item={opt}>
                                {opt.label}
                              </Select.Item>
                            ))}
                          </Select.Content>
                        </Select.Root>

                        {teamAId && teamBId && teamAId === teamBId ? (
                          <Text fontSize="sm" color="red.600">
                            Pick two different players.
                          </Text>
                        ) : null}

                        {playerOptionsBase.items.length === 0 ? (
                          <Text fontSize="sm" opacity={0.7}>
                            All players are already assigned to teams.
                          </Text>
                        ) : null}
                      </Stack>
                    </Stack>
                  </Dialog.Body>

                  <Dialog.Footer>
                    <HStack gap={2}>
                      <Button
                        variant="outline"
                        onClick={() => setOpenTeam(false)}
                        disabled={createTeamStatus === "saving"}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="pickle"
                        onClick={createTeam}
                        disabled={!canCreateTeam}
                      >
                        {createTeamStatus === "saving"
                          ? "Creating…"
                          : "Create Team"}
                      </Button>
                    </HStack>
                  </Dialog.Footer>
                </Dialog.Content>
              </Dialog.Positioner>
            </Portal>
          </Dialog.Root>

          {/* Rename Team Modal */}
          <Dialog.Root
            open={openRename}
            onOpenChange={(e) => setOpenRename(e.open)}
          >
            <Portal>
              <Dialog.Backdrop />
              <Dialog.Positioner>
                <Dialog.Content>
                  <Dialog.Header>
                    <Dialog.Title>Rename Team</Dialog.Title>
                  </Dialog.Header>

                  <Dialog.Body>
                    <Stack gap={3}>
                      {renameError ? (
                        <Box
                          border="1px solid"
                          borderColor="red.200"
                          bg="red.50"
                          borderRadius="lg"
                          p={3}
                        >
                          <Text color="red.700" fontSize="sm">
                            {renameError}
                          </Text>
                        </Box>
                      ) : null}

                      <Input
                        placeholder="New team name"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        disabled={renameStatus === "saving"}
                      />
                      <Text fontSize="sm" opacity={0.75}>
                        Renaming is safe even after matches are generated.
                      </Text>
                    </Stack>
                  </Dialog.Body>

                  <Dialog.Footer>
                    <HStack gap={2}>
                      <Button
                        variant="outline"
                        onClick={() => setOpenRename(false)}
                        disabled={renameStatus === "saving"}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="pickle"
                        onClick={saveRename}
                        disabled={!tid || renameStatus === "saving"}
                      >
                        {renameStatus === "saving" ? "Saving…" : "Save"}
                      </Button>
                    </HStack>
                  </Dialog.Footer>
                </Dialog.Content>
              </Dialog.Positioner>
            </Portal>
          </Dialog.Root>
        </Stack>
      </Container>
    </Box>
  );
}
