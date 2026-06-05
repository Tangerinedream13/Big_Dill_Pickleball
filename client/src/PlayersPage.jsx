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
  useBreakpointValue,
} from "@chakra-ui/react";
import {
  Plus,
  Search,
  Trash2,
  ArrowLeft,
  Users,
  User,
  CalendarDays,
  Home,
  CheckCircle2,
  Circle,
  EyeOff,
  Eye,
} from "lucide-react";

import { consumeOptimisticPlayer } from "./optimisticPlayerStore";
import { getCurrentTournamentId } from "./tournamentStore";
import StickyPageHeader from "./components/StickyPageHeader";
import { API_BASE } from "./apiBase";
import usePageTitle from "./hooks/usePageTitle";

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

function playerDivision(player) {
  const duprVal =
    player.duprRating ?? player.dupr_rating ?? player.dupr ?? null;
  const selfRating = (player.selfRating ?? player.self_rating ?? "")
    .toString()
    .toLowerCase();

  const n = Number(duprVal);

  if (Number.isFinite(n) && n >= 4.0) return "ADVANCED";
  if (selfRating === "advanced") return "ADVANCED";

  return "BEGINNER_INTERMEDIATE";
}

function teamDivision(team) {
  return (
    team.division ??
    team.teamDivision ??
    team.tournament_team_division ??
    "BEGINNER_INTERMEDIATE"
  );
}

function divisionLabel(division) {
  if (division === "ADVANCED") return "Advanced Division";
  return "Beginner / Intermediate Division";
}

function divisionDescription(division) {
  if (division === "ADVANCED") {
    return "Players with a DUPR rating of 4.0 or higher, or self-rated advanced.";
  }

  return "Players below 4.0 DUPR, beginner players, and intermediate players.";
}

function formatSelfRating(value) {
  if (!value) return "";
  const map = {
    beginner: "Beginner",
    lower_intermediate: "Lower Intermediate",
    intermediate: "Intermediate",
    advanced: "Advanced",
    very_advanced: "Very Advanced",
  };
  return map[value] || value;
}

const selfRatingCollection = createListCollection({
  items: [
    { label: "Beginner / New to pickleball", value: "beginner" },
    { label: "Lower Intermediate", value: "lower_intermediate" },
    { label: "Intermediate", value: "intermediate" },
    { label: "Advanced", value: "advanced" },
    { label: "Very Advanced / Tournament player", value: "very_advanced" },
  ],
});

function CheckInIcon({ checked, loading }) {
  return (
    <Box
      color={checked ? "green.500" : "gray.300"}
      style={{ opacity: loading ? 0.4 : 1, display: "flex", alignItems: "center" }}
    >
      {checked ? <CheckCircle2 size={20} /> : <Circle size={20} />}
    </Box>
  );
}

function teamCheckinLabel(checkinCount, total) {
  if (total === 0) return null;
  if (checkinCount === total) return { text: "Both In", ready: true };
  if (checkinCount === 1) return { text: "1 / 2 In", ready: false, partial: true };
  return { text: "Not In", ready: false, partial: false };
}

function PlayersCardList({ players, onDelete, playerTeamMap, onToggleCheckIn, checkingInId }) {
  return (
    <Stack gap={3}>
      {players.map((p) => {
        const duprVal = p.duprRating ?? p.dupr_rating ?? p.dupr ?? null;
        const tier = p.duprTier ?? duprTierFromNumber(duprVal);
        const teamName = playerTeamMap?.get(String(p.id)) ?? "";
        const selfRating = p.selfRating ?? p.self_rating ?? "";
        const skillSource = p.skillSource ?? p.skill_source ?? "";
        const isCheckedIn = p.checkedIn ?? false;
        const isLoading = checkingInId === p.id;

        return (
          <Box
            key={p.id ?? p.email ?? p.name}
            border="1px solid"
            borderColor={isCheckedIn ? "green.300" : "border"}
            borderRadius="2xl"
            p={4}
            bg={isCheckedIn ? "green.50" : p._optimistic ? "green.50" : "white"}
            transition="background 0.15s, border-color 0.15s"
          >
            <HStack justify="space-between" align="start" gap={3}>
              <HStack gap={3} align="start" flex={1}>
                {!p._optimistic ? (
                  <Box
                    as="button"
                    onClick={() => onToggleCheckIn(p.id, isCheckedIn)}
                    disabled={isLoading}
                    flexShrink={0}
                    mt="2px"
                    style={{ cursor: isLoading ? "wait" : "pointer", background: "none", border: "none", padding: 0 }}
                  >
                    <CheckInIcon checked={isCheckedIn} loading={isLoading} />
                  </Box>
                ) : null}

                <Box>
                  <HStack gap={2} wrap="wrap">
                    <Text fontWeight="800">
                      {p.name ?? "Unnamed"}
                    </Text>
                    {p._optimistic ? (
                      <Badge variant="pickle">Just joined</Badge>
                    ) : null}
                    {isCheckedIn ? (
                      <Badge variant="pickle">Checked In</Badge>
                    ) : null}
                  </HStack>

                  <HStack mt={2} gap={2} wrap="wrap">
                    <Badge variant="club">DUPR: {formatDupr(duprVal)}</Badge>
                    <Badge variant="club">{tier}</Badge>
                    {skillSource === "self_rating" && selfRating ? (
                      <Badge variant="outline">
                        Self-rated: {formatSelfRating(selfRating)}
                      </Badge>
                    ) : null}
                    {teamName ? <Badge variant="pickle">{teamName}</Badge> : null}
                  </HStack>
                </Box>
              </HStack>

              {!p._optimistic ? (
                <IconButton
                  aria-label="Delete player"
                  variant="outline"
                  onClick={() => onDelete(p.id)}
                >
                  <Trash2 size={16} />
                </IconButton>
              ) : null}
            </HStack>
          </Box>
        );
      })}
    </Stack>
  );
}

function TeamsCardList({ teams, onRename, onDelete, deletingTeamId, tid, teamCheckinMap }) {
  return (
    <Stack gap={3}>
      {teams.map((t) => {
        const checkin = teamCheckinMap?.get(String(t.id));
        const checkinCount = checkin?.checkedInCount ?? 0;
        const total = checkin?.total ?? 0;
        const label = teamCheckinLabel(checkinCount, total);
        const isReady = label?.ready ?? false;
        const isPartial = label?.partial ?? false;

        return (
          <Box
            key={t.id}
            border="1px solid"
            borderColor={isReady ? "green.300" : isPartial ? "orange.200" : "border"}
            borderRadius="2xl"
            p={4}
            bg={isReady ? "green.50" : "white"}
            transition="background 0.15s, border-color 0.15s"
          >
            <HStack justify="space-between" align="start" gap={3}>
              <Box flex={1}>
                <HStack gap={2} wrap="wrap" align="center">
                  <Box color={isReady ? "green.500" : "gray.300"} display="flex" alignItems="center">
                    {isReady ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                  </Box>
                  <Text fontWeight="800">{t.name}</Text>
                  {label ? (
                    <Badge variant={isReady ? "pickle" : "outline"}>
                      {label.text}
                    </Badge>
                  ) : null}
                </HStack>
                <Text mt={2} fontWeight="600" opacity={0.9} pl={7}>
                  {(t.players ?? [])
                    .map((p) => p.name)
                    .filter(Boolean)
                    .join(" / ") || "—"}
                </Text>
              </Box>

              <HStack gap={2} wrap="wrap" justify="flex-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRename(t)}
                  disabled={!tid}
                >
                  Rename
                </Button>

                <IconButton
                  aria-label="Delete team"
                  variant="outline"
                  onClick={() => onDelete(t.id)}
                  disabled={!tid || deletingTeamId === t.id}
                >
                  <Trash2 size={16} />
                </IconButton>
              </HStack>
            </HStack>
          </Box>
        );
      })}
    </Stack>
  );
}

export default function PlayersPage() {
  usePageTitle("Players");

  const navigate = useNavigate();
  const tid = getCurrentTournamentId();

  function apiUrl(path) {
    const base = (API_BASE || "").replace(/\/$/, "");
    const p = path.startsWith("/") ? path : `/${path}`;
    if (!base) return p;
    return `${base}${p}`;
  }

  function withTid(path) {
    const u = new URL(apiUrl(path), window.location.origin);
    if (tid) u.searchParams.set("tournamentId", tid);
    return u.toString();
  }

  const [players, setPlayers] = useState([]);
  const [status, setStatus] = useState("loading");
  const [query, setQuery] = useState("");
  const [hideCheckedIn, setHideCheckedIn] = useState(false);
  const [checkingInId, setCheckingInId] = useState(null);
  const isMobile = useBreakpointValue({ base: true, md: false });

  // Create player modal
  const [openPlayer, setOpenPlayer] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDupr, setNewDupr] = useState("");
  const [newSelfRating, setNewSelfRating] = useState("");

  // Teams section
  const [teamsStatus, setTeamsStatus] = useState("idle");
  const [teamsError, setTeamsError] = useState("");
  const [teams, setTeams] = useState([]);

  // Create team modal
  const [openTeam, setOpenTeam] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamAId, setTeamAId] = useState("");
  const [teamBId, setTeamBId] = useState("");
  const [createTeamStatus, setCreateTeamStatus] = useState("idle");
  const [createTeamError, setCreateTeamError] = useState("");

  // Delete team state
  const [deletingTeamId, setDeletingTeamId] = useState(null);

  // Rename team modal
  const [openRename, setOpenRename] = useState(false);
  const [renameTeamId, setRenameTeamId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameStatus, setRenameStatus] = useState("idle");
  const [renameError, setRenameError] = useState("");

  // Generate matches
  const [generateStatus, setGenerateStatus] = useState("idle");
  const [generateError, setGenerateError] = useState("");

  const needsSelfRating = newDupr.trim() === "";

  async function loadPlayers() {
    try {
      if (!tid) {
        setPlayers([]);
        setStatus("ok");
        return;
      }

      setStatus("loading");
      const res = await fetch(apiUrl(`/api/tournaments/${tid}/players`));
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

      const res = await fetch(apiUrl(`/api/tournaments/${tid}/teams`));
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
          division: t.division ?? t.teamDivision ?? t.tournament_team_division,
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
  }, [tid]);

  async function toggleCheckIn(playerId, currentCheckedIn) {
    if (checkingInId === playerId) return;
    setCheckingInId(playerId);

    // Optimistic update
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === playerId ? { ...p, checkedIn: !currentCheckedIn } : p
      )
    );

    try {
      const res = await fetch(
        apiUrl(`/api/tournaments/${tid}/players/${playerId}/checkin`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checkedIn: !currentCheckedIn }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to update check-in.");

      setPlayers((prev) =>
        prev.map((p) =>
          p.id === playerId
            ? {
                ...p,
                checkedIn: data.player.checkedIn,
                checkedInAt: data.player.checkedInAt,
              }
            : p
        )
      );
    } catch (e) {
      // Revert on error
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === playerId ? { ...p, checkedIn: currentCheckedIn } : p
        )
      );
      console.error(e);
      alert(e.message || "Could not update check-in status.");
    } finally {
      setCheckingInId(null);
    }
  }

  const checkedInCount = useMemo(
    () => players.filter((p) => p.checkedIn).length,
    [players]
  );

  const teamCheckinMap = useMemo(() => {
    const playerCheckinById = new Map(
      players.map((p) => [String(p.id), p.checkedIn ?? false])
    );
    const m = new Map();
    for (const t of teams) {
      const teamPlayers = t.players ?? [];
      const count = teamPlayers.filter((p) =>
        playerCheckinById.get(String(p.id))
      ).length;
      m.set(String(t.id), { checkedInCount: count, total: teamPlayers.length });
    }
    return m;
  }, [players, teams]);

  const fullyCheckedTeamsCount = useMemo(() => {
    let count = 0;
    for (const v of teamCheckinMap.values()) {
      if (v.total > 0 && v.checkedInCount === v.total) count++;
    }
    return count;
  }, [teamCheckinMap]);

  const filteredPlayers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players.filter((p) => {
      if (hideCheckedIn && (p.checkedIn ?? false)) return false;
      if (!q) return true;
      const name = (p.name ?? "").toLowerCase();
      const duprVal = p.duprRating ?? p.dupr_rating ?? p.dupr ?? "";
      const selfRating = (p.selfRating ?? p.self_rating ?? "").toLowerCase();
      return (
        name.includes(q) ||
        String(duprVal).toLowerCase().includes(q) ||
        selfRating.includes(q)
      );
    });
  }, [players, query, hideCheckedIn]);

  const beginnerIntermediatePlayers = useMemo(() => {
    return filteredPlayers.filter(
      (p) => playerDivision(p) === "BEGINNER_INTERMEDIATE"
    );
  }, [filteredPlayers]);

  const advancedPlayers = useMemo(() => {
    return filteredPlayers.filter((p) => playerDivision(p) === "ADVANCED");
  }, [filteredPlayers]);

  const beginnerIntermediateTeams = useMemo(() => {
    return teams.filter((t) => teamDivision(t) === "BEGINNER_INTERMEDIATE");
  }, [teams]);

  const advancedTeams = useMemo(() => {
    return teams.filter((t) => teamDivision(t) === "ADVANCED");
  }, [teams]);

  const playerTeamMap = useMemo(() => {
    const m = new Map();
    for (const t of teams ?? []) {
      const teamName = t?.name ?? "";
      for (const pl of t.players ?? []) {
        if (pl?.id == null) continue;
        m.set(String(pl.id), teamName);
      }
    }
    return m;
  }, [teams]);

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
        alert("DUPR must be a number.");
        return;
      }

      if (n < 2.0 || n > 6.99) {
        alert("DUPR must be between 2.00 and 6.99, or leave it blank.");
        return;
      }

      duprRating = Math.round(n * 100) / 100;
    }

    if (duprRating === null && !newSelfRating) {
      alert("If DUPR is blank, choose a skill level.");
      return;
    }

    try {
      if (!tid) {
        alert("Select a tournament first.");
        return;
      }

      const res = await fetch(apiUrl(`/api/tournaments/${tid}/players`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          duprRating,
          selfRating: duprRating === null ? newSelfRating : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);

      setNewName("");
      setNewDupr("");
      setNewSelfRating("");
      setOpenPlayer(false);
      await loadPlayers();
    } catch (e) {
      console.error(e);
      alert(e.message || "Could not create player.");
    }
  }

  async function deletePlayer(id) {
    if (!confirm("Delete this player?")) return;

    try {
      const res = await fetch(apiUrl(`/api/tournaments/${tid}/players/${id}`), {
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
      const res = await fetch(apiUrl(`/api/tournaments/${tid}/teams`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
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
        credentials: "include",
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

    if (!confirm("Delete this doubles team?")) return;

    setDeletingTeamId(teamId);
    setTeamsError("");

    try {
      const res = await fetch(withTid(`/api/teams/${teamId}`), {
        method: "DELETE",
        credentials: "include",
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
              <User size={18} />

              <Heading size="lg" letterSpacing="-0.02em">
                Players
              </Heading>

              <Badge variant="pickle">{players?.length ?? 0} total</Badge>

              {status === "ok" && players.length > 0 ? (
                <>
                  <Badge variant={checkedInCount === players.length && players.length > 0 ? "pickle" : "club"}>
                    {checkedInCount} / {players.length} checked in
                  </Badge>
                  {teams.length > 0 ? (
                    <Badge variant={fullyCheckedTeamsCount === teams.length && teams.length > 0 ? "pickle" : "club"}>
                      {fullyCheckedTeamsCount} / {teams.length} teams ready
                    </Badge>
                  ) : null}
                </>
              ) : null}

              {status === "loading" && <Badge variant="club">Loading…</Badge>}
              {status === "error" && (
                <Badge variant="club">Backend issue</Badge>
              )}
            </HStack>
            <Box />
          </Flex>

          <Text opacity={0.85}>
            Search by <b>name</b>, <b>DUPR</b>, or <b>skill level</b>. Click
            the circle next to a player to check them in. Then create doubles
            teams below.
          </Text>
        </Stack>
      </StickyPageHeader>

      <Container maxW="6xl" pt={{ base: 8, md: 10 }} px={{ base: 4, md: 6 }}>
        <Stack gap={6}>
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
                placeholder="Search name, DUPR, or skill level…"
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
                variant={hideCheckedIn ? "pickle" : "outline"}
                onClick={() => setHideCheckedIn((v) => !v)}
                size="md"
              >
                <HStack gap={2}>
                  {hideCheckedIn ? <EyeOff size={15} /> : <Eye size={15} />}
                  <Text>{hideCheckedIn ? "Showing Unchecked" : "Hide Checked-In"}</Text>
                </HStack>
              </Button>

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

          <Box
            bg="white"
            border="1px solid"
            borderColor="border"
            borderRadius="2xl"
            boxShadow="soft"
            overflow="hidden"
          >
            <Box p={{ base: 3, md: 5 }}>
              {filteredPlayers.length === 0 ? (
                <Box
                  border="1px dashed"
                  borderColor="border"
                  borderRadius="2xl"
                  p={{ base: 5, md: 10 }}
                  textAlign="center"
                  bg="cream.50"
                >
                  <Heading size="md" mb={2}>
                    {hideCheckedIn && players.length > 0
                      ? "All players checked in!"
                      : "No players found"}
                  </Heading>
                  <Text opacity={0.8} mb={5}>
                    {hideCheckedIn && players.length > 0
                      ? "Everyone has arrived. You're ready to go!"
                      : tid
                      ? "Try a different search, or add your first player."
                      : "Select a tournament first on the Home page."}
                  </Text>
                  {!(hideCheckedIn && players.length > 0) ? (
                    <Button
                      variant="pickle"
                      onClick={() => setOpenPlayer(true)}
                      isDisabled={!tid}
                    >
                      Add Player
                    </Button>
                  ) : null}
                </Box>
              ) : (
                <Stack gap={5}>
                  {[
                    {
                      division: "BEGINNER_INTERMEDIATE",
                      players: beginnerIntermediatePlayers,
                    },
                    {
                      division: "ADVANCED",
                      players: advancedPlayers,
                    },
                  ].map(({ division, players }) => (
                    <Box
                      key={division}
                      border="1px solid"
                      borderColor="border"
                      borderRadius="2xl"
                      bg="cream.50"
                      p={{ base: 3, md: 4 }}
                      overflow="hidden"
                    >
                      <Flex
                        justify="space-between"
                        align={{ base: "start", md: "center" }}
                        direction={{ base: "column", md: "row" }}
                        gap={2}
                        mb={4}
                      >
                        <Box>
                          <Heading size="sm">{divisionLabel(division)}</Heading>
                          <Text fontSize="sm" opacity={0.75} mt={1}>
                            {divisionDescription(division)}
                          </Text>
                        </Box>

                        <Badge
                          variant={division === "ADVANCED" ? "pickle" : "club"}
                        >
                          {players.length} players
                        </Badge>
                      </Flex>

                      {players.length === 0 ? (
                        <Box
                          border="1px dashed"
                          borderColor="border"
                          borderRadius="xl"
                          p={5}
                          bg="white"
                          textAlign="center"
                        >
                          <Text opacity={0.7}>
                            No players in this division yet.
                          </Text>
                        </Box>
                      ) : isMobile ? (
                        <PlayersCardList
                          players={players}
                          onDelete={deletePlayer}
                          playerTeamMap={playerTeamMap}
                          onToggleCheckIn={toggleCheckIn}
                          checkingInId={checkingInId}
                        />
                      ) : (
                        <Box
                          overflowX="auto"
                          borderRadius="xl"
                          overflow="hidden"
                        >
                          <Table.Root size="md" variant="outline">
                            <Table.Header>
                              <Table.Row>
                                <Table.ColumnHeader w="44px" />
                                <Table.ColumnHeader>Name</Table.ColumnHeader>
                                <Table.ColumnHeader>DUPR</Table.ColumnHeader>
                                <Table.ColumnHeader>Tier</Table.ColumnHeader>
                                <Table.ColumnHeader>
                                  Skill Input
                                </Table.ColumnHeader>
                                <Table.ColumnHeader>Team</Table.ColumnHeader>
                                <Table.ColumnHeader textAlign="end">
                                  Actions
                                </Table.ColumnHeader>
                              </Table.Row>
                            </Table.Header>

                            <Table.Body>
                              {players.map((p) => {
                                const duprVal =
                                  p.duprRating ??
                                  p.dupr_rating ??
                                  p.dupr ??
                                  null;
                                const tier =
                                  p.duprTier ?? duprTierFromNumber(duprVal);
                                const teamName =
                                  playerTeamMap.get(String(p.id)) ?? "";
                                const selfRating =
                                  p.selfRating ?? p.self_rating ?? "";
                                const skillSource =
                                  p.skillSource ?? p.skill_source ?? "";
                                const isCheckedIn = p.checkedIn ?? false;
                                const isLoading = checkingInId === p.id;

                                return (
                                  <Table.Row
                                    key={p.id ?? p.email ?? p.name}
                                    bg={isCheckedIn ? "green.50" : undefined}
                                  >
                                    <Table.Cell>
                                      {!p._optimistic ? (
                                        <Box
                                          as="button"
                                          onClick={() => toggleCheckIn(p.id, isCheckedIn)}
                                          disabled={isLoading}
                                          style={{
                                            cursor: isLoading ? "wait" : "pointer",
                                            background: "none",
                                            border: "none",
                                            padding: 0,
                                            display: "flex",
                                            alignItems: "center",
                                          }}
                                        >
                                          <CheckInIcon checked={isCheckedIn} loading={isLoading} />
                                        </Box>
                                      ) : null}
                                    </Table.Cell>

                                    <Table.Cell fontWeight="600">
                                      {p.name ?? "Unnamed"}
                                      {isCheckedIn ? (
                                        <Badge ml={2} variant="pickle" size="sm">In</Badge>
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

                                    <Table.Cell>
                                      {skillSource === "self_rating" &&
                                      selfRating ? (
                                        <Badge variant="outline">
                                          {formatSelfRating(selfRating)}
                                        </Badge>
                                      ) : (
                                        <Text opacity={0.6}>
                                          Official / entered DUPR
                                        </Text>
                                      )}
                                    </Table.Cell>

                                    <Table.Cell>
                                      {teamName ? (
                                        <Badge variant="pickle">
                                          {teamName}
                                        </Badge>
                                      ) : (
                                        <Text opacity={0.6}>—</Text>
                                      )}
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
                  ))}
                </Stack>
              )}
            </Box>
          </Box>

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

                  {teams.length > 0 ? (
                    <Badge variant={fullyCheckedTeamsCount === teams.length ? "pickle" : "club"}>
                      {fullyCheckedTeamsCount} / {teams.length} ready
                    </Badge>
                  ) : null}

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
              <Box mt={4}>
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
                  <Stack gap={5}>
                    {[
                      {
                        division: "BEGINNER_INTERMEDIATE",
                        teams: beginnerIntermediateTeams,
                      },
                      {
                        division: "ADVANCED",
                        teams: advancedTeams,
                      },
                    ].map(({ division, teams }) => (
                      <Box
                        key={division}
                        border="1px solid"
                        borderColor="border"
                        borderRadius="2xl"
                        bg="cream.50"
                        p={{ base: 3, md: 4 }}
                        overflow="hidden"
                      >
                        <Flex
                          justify="space-between"
                          align={{ base: "start", md: "center" }}
                          direction={{ base: "column", md: "row" }}
                          gap={2}
                          mb={4}
                        >
                          <Box>
                            <Heading size="sm">
                              {divisionLabel(division)} Teams
                            </Heading>
                            <Text fontSize="sm" opacity={0.75} mt={1}>
                              Teams stay within their division when matches are
                              generated.
                            </Text>
                          </Box>

                          <Badge
                            variant={
                              division === "ADVANCED" ? "pickle" : "club"
                            }
                          >
                            {teams.length} teams
                          </Badge>
                        </Flex>

                        {teams.length === 0 ? (
                          <Box
                            border="1px dashed"
                            borderColor="border"
                            borderRadius="xl"
                            p={5}
                            bg="white"
                            textAlign="center"
                          >
                            <Text opacity={0.7}>
                              No teams in this division yet.
                            </Text>
                          </Box>
                        ) : isMobile ? (
                          <TeamsCardList
                            teams={teams}
                            onRename={openRenameModal}
                            onDelete={deleteTeam}
                            deletingTeamId={deletingTeamId}
                            tid={tid}
                            teamCheckinMap={teamCheckinMap}
                          />
                        ) : (
                          <Box
                            overflowX="auto"
                            borderRadius="xl"
                            overflow="hidden"
                          >
                            <Table.Root size="md" variant="outline">
                              <Table.Header>
                                <Table.Row>
                                  <Table.ColumnHeader w="44px" />
                                  <Table.ColumnHeader>Team</Table.ColumnHeader>
                                  <Table.ColumnHeader>
                                    Players
                                  </Table.ColumnHeader>
                                  <Table.ColumnHeader>
                                    Division
                                  </Table.ColumnHeader>
                                  <Table.ColumnHeader>
                                    Check-In
                                  </Table.ColumnHeader>
                                  <Table.ColumnHeader textAlign="end">
                                    Actions
                                  </Table.ColumnHeader>
                                </Table.Row>
                              </Table.Header>

                              <Table.Body>
                                {teams.map((t) => {
                                  const checkin = teamCheckinMap.get(String(t.id));
                                  const checkinCount = checkin?.checkedInCount ?? 0;
                                  const total = checkin?.total ?? 0;
                                  const label = teamCheckinLabel(checkinCount, total);
                                  const isReady = label?.ready ?? false;

                                  return (
                                    <Table.Row
                                      key={t.id}
                                      bg={isReady ? "green.50" : undefined}
                                    >
                                      <Table.Cell>
                                        <Box color={isReady ? "green.500" : "gray.300"} display="flex" alignItems="center">
                                          {isReady ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                                        </Box>
                                      </Table.Cell>

                                      <Table.Cell fontWeight="700">
                                        {t.name}
                                      </Table.Cell>

                                      <Table.Cell>
                                        <Text fontWeight="600">
                                          {(t.players ?? [])
                                            .map((p) => p.name)
                                            .filter(Boolean)
                                            .join(" / ") || "—"}
                                        </Text>
                                      </Table.Cell>

                                      <Table.Cell>
                                        <Badge
                                          variant={
                                            division === "ADVANCED"
                                              ? "pickle"
                                              : "club"
                                          }
                                        >
                                          {divisionLabel(division)}
                                        </Badge>
                                      </Table.Cell>

                                      <Table.Cell>
                                        {label ? (
                                          <Badge variant={isReady ? "pickle" : "outline"}>
                                            {label.text}
                                          </Badge>
                                        ) : (
                                          <Text opacity={0.5}>—</Text>
                                        )}
                                      </Table.Cell>

                                      <Table.Cell textAlign="end">
                                        <HStack
                                          justify="flex-end"
                                          gap={2}
                                          wrap="wrap"
                                        >
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => openRenameModal(t)}
                                            isDisabled={!tid}
                                          >
                                            Rename
                                          </Button>

                                          <IconButton
                                            aria-label="Delete team"
                                            variant="outline"
                                            onClick={() => deleteTeam(t.id)}
                                            isDisabled={
                                              !tid || deletingTeamId === t.id
                                            }
                                          >
                                            <Trash2 size={16} />
                                          </IconButton>
                                        </HStack>
                                      </Table.Cell>
                                    </Table.Row>
                                  );
                                })}
                              </Table.Body>
                            </Table.Root>
                          </Box>
                        )}
                      </Box>
                    ))}
                  </Stack>
                )}
              </Box>
            </Card.Body>
          </Card.Root>

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
                    <Stack gap={4}>
                      <Input
                        placeholder="Player name"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                      />

                      <Stack gap={2}>
                        <Input
                          placeholder="DUPR 2.00–6.99 (optional)"
                          value={newDupr}
                          onChange={(e) => setNewDupr(e.target.value)}
                          inputMode="decimal"
                        />
                        <Text fontSize="xs" opacity={0.7}>
                          If DUPR is blank, choose a skill level below.
                        </Text>
                      </Stack>

                      <Stack gap={2}>
                        <Text fontSize="sm" fontWeight="700">
                          Skill level{" "}
                          {needsSelfRating
                            ? "(required if DUPR is blank)"
                            : "(optional)"}
                        </Text>

                        <Select.Root
                          collection={selfRatingCollection}
                          value={newSelfRating ? [newSelfRating] : []}
                          onValueChange={(d) =>
                            setNewSelfRating(d.value?.[0] ?? "")
                          }
                        >
                          <Select.Trigger>
                            <Select.ValueText placeholder="Choose a skill level" />
                          </Select.Trigger>
                          <Select.Content>
                            {selfRatingCollection.items.map((item) => (
                              <Select.Item key={item.value} item={item}>
                                {item.label}
                              </Select.Item>
                            ))}
                          </Select.Content>
                        </Select.Root>

                        <Text fontSize="xs" opacity={0.7}>
                          This helps create fairer matchups when official DUPR
                          is unknown.
                        </Text>
                      </Stack>
                    </Stack>
                  </Dialog.Body>

                  <Dialog.Footer>
                    <HStack gap={2}>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setOpenPlayer(false);
                          setNewName("");
                          setNewDupr("");
                          setNewSelfRating("");
                        }}
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
