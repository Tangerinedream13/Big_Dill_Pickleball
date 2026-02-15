// client/src/MatchSchedule.jsx
console.log("MatchSchedule mounted");
import { API_BASE } from "./apiBase";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Badge,
  Box,
  Button,
  Card,
  Container,
  Dialog,
  Flex,
  Heading,
  HStack,
  IconButton,
  Input,
  Portal,
  Stack,
  Text,
  Select,
  Table,
  Tabs,
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
  Flag,
  X,
} from "lucide-react";
import { getCurrentTournamentId } from "./tournamentStore";
import StickyPageHeader from "./components/StickyPageHeader";

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

// Forfeit/scratch detection:
// winnerId exists but scores are null/undefined/"" -> scratched/forfeited
function isForfeitRR(match) {
  if (match?.phase !== "RR") return false;
  if (!match?.winnerId) return false;
  const aEmpty =
    match.scoreA === null || match.scoreA === undefined || match.scoreA === "";
  const bEmpty =
    match.scoreB === null || match.scoreB === undefined || match.scoreB === "";
  return aEmpty && bEmpty;
}

function hasAnyScoreOrForfeit(m) {
  const aHas =
    m?.scoreA !== null && m?.scoreA !== undefined && m?.scoreA !== "";
  const bHas =
    m?.scoreB !== null && m?.scoreB !== undefined && m?.scoreB !== "";
  return aHas || bHas || isForfeitRR(m);
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

function MatchesMiniList({ matches, teamDisplay }) {
  if (!matches?.length) return <Text opacity={0.7}>No matches to show.</Text>;

  return (
    <Table.Root size="sm" variant="outline">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeader>Match</Table.ColumnHeader>
          <Table.ColumnHeader>Teams</Table.ColumnHeader>
          <Table.ColumnHeader>Score</Table.ColumnHeader>
          <Table.ColumnHeader>Winner</Table.ColumnHeader>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {matches.map((m) => {
          const a = teamDisplay(m.teamAId);
          const b = teamDisplay(m.teamBId);
          const score =
            m.scoreA != null && m.scoreB != null
              ? `${m.scoreA}-${m.scoreB}`
              : "—";
          const winner = m.winnerId != null ? teamDisplay(m.winnerId) : "—";

          return (
            <Table.Row key={`${m.phase}-${m.id}`}>
              <Table.Cell fontWeight="700">{m.id}</Table.Cell>
              <Table.Cell>
                <Text fontWeight="600">{a}</Text>
                <Text opacity={0.7} fontSize="sm">
                  vs {b}
                </Text>
              </Table.Cell>
              <Table.Cell>{score}</Table.Cell>
              <Table.Cell fontWeight="600">{winner}</Table.Cell>
            </Table.Row>
          );
        })}
      </Table.Body>
    </Table.Root>
  );
}

export default function MatchSchedule() {
  const navigate = useNavigate();

  const [status, setStatus] = useState("loading"); // loading | ok | error | no-tournament
  const [state, setState] = useState(null);

  // teams that include players so we can show (HADD, HADD)
  const [teamsWithPlayers, setTeamsWithPlayers] = useState([]);

  const [phaseFilter, setPhaseFilter] = useState("ALL");
  const [query, setQuery] = useState("");

  // { [matchId]: { scoreA: string, scoreB: string, saving: boolean, error: string|null } }
  const [edits, setEdits] = useState({});

  // per-match edit mode (lets you re-enter after save)
  const [editMode, setEditMode] = useState({}); // { [matchId]: boolean }

  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");

  const [resettingPlayoffs, setResettingPlayoffs] = useState(false);
  const [resetPlayoffsError, setResetPlayoffsError] = useState("");

  const [advancingSemis, setAdvancingSemis] = useState(false);
  const [advanceSemisError, setAdvanceSemisError] = useState("");

  const [advancingFinals, setAdvancingFinals] = useState(false);
  const [advanceFinalsError, setAdvanceFinalsError] = useState("");
  const [savedMsg, setSavedMsg] = useState("");

  const tid = getCurrentTournamentId();

  function withTid(path) {
    const base = (API_BASE || "").replace(/\/$/, "");
    const p = String(path || "").startsWith("/") ? path : `/${path}`;
    const u = base
      ? new URL(`${base}${p}`)
      : new URL(p, window.location.origin);

    if (tid) u.searchParams.set("tournamentId", tid);
    return u.toString();
  }

  async function loadTeamsForDisplay(tournamentId) {
    if (!tournamentId) {
      setTeamsWithPlayers([]);
      return;
    }

    try {
      const res = await fetch(
        `${API_BASE}/api/tournaments/${tournamentId}/teams`
      );
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      const teams = Array.isArray(data)
        ? data
        : Array.isArray(data?.teams)
        ? data.teams
        : [];
      setTeamsWithPlayers(teams);
    } catch (e) {
      console.warn("Could not load teams-with-players:", e);
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
        setEditMode({});
        setStatus("no-tournament");
        return;
      }

      const res = await fetch(withTid("/api/tournament/state"));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);

      setState(data);
      setStatus("ok");

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

      // Keep editMode for still-existing matches
      setEditMode((prev) => {
        const keep = {};
        for (const m of all) {
          if (prev[m.id]) keep[m.id] = true;
        }
        return keep;
      });
    } catch (e) {
      console.error(e);
      setStatus("error");
    }
  }

  useEffect(() => {
    setState(null);
    setTeamsWithPlayers([]);
    setEdits({});
    setEditMode({});
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

  const scratchedTeamIds = useMemo(() => {
    const s = new Set();
    for (const m of rrMatches) {
      if (isForfeitRR(m)) {
        s.add(String(m.teamAId));
        s.add(String(m.teamBId));
      }
    }
    return s;
  }, [rrMatches]);
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

  // Tournament complete = BOTH winners set (final + third)
  const tournamentComplete = useMemo(() => {
    if (!finalMatch && !thirdMatch) return false;
    const finalDone = finalMatch ? !!finalMatch.winnerId : true;
    const thirdDone = thirdMatch ? !!thirdMatch.winnerId : true;
    return finalDone && thirdDone;
  }, [finalMatch, thirdMatch]);

  // Lock earlier matches once finals begin getting confirmed (Final OR Third has a winner)
  const finalsConfirmed = useMemo(() => {
    return !!finalMatch?.winnerId || !!thirdMatch?.winnerId;
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

  function beginEdit(match) {
    if (!match?.id) return;

    if (tournamentComplete) {
      alert("Scores are locked. Tournament is complete.");
      return;
    }

    // only lock earlier matches (RR/SF) once finals are confirmed
    const isFinalsMatch = match.phase === "FINAL" || match.phase === "THIRD";
    if (finalsConfirmed && !isFinalsMatch) {
      alert(
        "Editing locked: Finals have been confirmed. Earlier matches can’t be edited."
      );
      return;
    }

    // eslint-disable-next-line no-restricted-globals
    if (
      !confirm(
        "Edit this score? This will unlock the match so you can re-enter scores."
      )
    )
      return;

    // Unlock + clear inputs (forces re-entry, avoids accidental partial edits)
    setEditMode((prev) => ({ ...prev, [match.id]: true }));
    setEdits((prev) => ({
      ...prev,
      [match.id]: {
        ...(prev[match.id] ?? {
          scoreA: "",
          scoreB: "",
          saving: false,
          error: null,
        }),
        scoreA: "",
        scoreB: "",
        error: null,
      },
    }));
  }

  function cancelEdit(match) {
    if (!match?.id) return;

    setEditMode((prev) => {
      const next = { ...prev };
      delete next[match.id];
      return next;
    });

    // restore original values from match
    setEdits((prev) => ({
      ...prev,
      [match.id]: {
        ...(prev[match.id] ?? { saving: false, error: null }),
        scoreA: normalizeScoreInput(match.scoreA),
        scoreB: normalizeScoreInput(match.scoreB),
        error: null,
      },
    }));
  }

  function endEdit(matchId) {
    setEditMode((prev) => {
      const next = { ...prev };
      delete next[matchId];
      return next;
    });
  }

  async function saveMatch(match) {
    const matchId = match.id;
    const row = edits[matchId] ?? { scoreA: "", scoreB: "" };
    const isEditingThis = !!editMode[matchId];

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

    // lock earlier matches after finalsConfirmed (still allow editing FINAL/THIRD)
    const isFinalsMatch = match.phase === "FINAL" || match.phase === "THIRD";
    if (finalsConfirmed && !isFinalsMatch) {
      setEdits((prev) => ({
        ...prev,
        [matchId]: {
          ...prev[matchId],
          error: "Finals have been confirmed. Earlier matches can’t be edited.",
        },
      }));
      return;
    }

    // completed RR can only be saved if in edit mode
    if (match.phase === "RR" && match.winnerId && !isEditingThis) {
      setEdits((prev) => ({
        ...prev,
        [matchId]: {
          ...prev[matchId],
          error:
            "This RR match is complete. Hover + click the circle-arrow to edit.",
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

      const msg = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(msg?.error ?? `HTTP ${res.status}`);

      endEdit(matchId);
      setSavedMsg(`Saved ${match.phase} ${match.id} ✅`);
      setTimeout(() => setSavedMsg(""), 2500);
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

    if (!tid) return setResetError("No tournament selected.");
    // eslint-disable-next-line no-restricted-globals
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
      setEditMode({});
    } catch (e) {
      console.error(e);
      setResetError(e.message || "Could not reset matches.");
    } finally {
      setResetting(false);
    }
  }

  async function resetPlayoffs() {
    setResetPlayoffsError("");

    if (!tid) return setResetPlayoffsError("No tournament selected.");
    // eslint-disable-next-line no-restricted-globals
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
      if (typeof data?.deleted === "number") {
        if (data.deleted > 0) {
          setSavedMsg(`Playoffs reset ✅ (${data.deleted} deleted)`);
        } else {
          setSavedMsg(data?.message || "No playoffs to reset.");
        }
        setTimeout(() => setSavedMsg(""), 2500);
      }

      await loadState();
      setEditMode({});
    } catch (e) {
      console.error(e);
      setResetPlayoffsError(e?.message || "Could not reset playoffs.");
    } finally {
      setResettingPlayoffs(false);
    }
  }

  async function advanceToSemis() {
    setAdvanceSemisError("");

    if (!tid) return setAdvanceSemisError("No tournament selected.");

    if (!rrComplete) {
      const missing = rrIncompleteMatches.map((m) => m.id).join(", ");
      setAdvanceSemisError(
        `Round robin isn't complete yet. Score (or scratch) these matches first: ${missing}`
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

    if (!tid) return setAdvanceFinalsError("No tournament selected.");

    if (!semisExist) {
      setAdvanceFinalsError(
        "Finals come after Semifinals. Advance to Semis first."
      );
      return;
    }

    if (finalsExist) {
      setPhaseFilter("FINAL");
      setQuery("");
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

  // ------------------ SCRATCH / FORFEIT (Round Robin) ------------------
  const [scratchOpen, setScratchOpen] = useState(false);
  const [scratchMatch, setScratchMatch] = useState(null);
  const [scratchStatus, setScratchStatus] = useState("idle"); // idle | saving | error
  const [scratchError, setScratchError] = useState("");
  const [confirmScratchFor, setConfirmScratchFor] = useState(null);

  function openScratch(m) {
    if (tournamentComplete) return;

    if (finalsConfirmed) {
      alert(
        "Scratch locked: Finals have been confirmed. Earlier matches can’t be changed."
      );
      return;
    }

    setScratchError("");
    setScratchStatus("idle");
    setConfirmScratchFor(null);
    setScratchMatch(m);
    setScratchOpen(true);
  }

  async function submitScratch(winnerId) {
    if (!scratchMatch?.id) return;

    setScratchError("");
    setScratchStatus("saving");

    try {
      const res = await fetch(
        withTid(`/api/roundrobin/matches/${scratchMatch.id}/score`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            winnerId,
            scoreA: null,
            scoreB: null,
          }),
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not scratch match.");

      setScratchOpen(false);
      setScratchMatch(null);
      setScratchStatus("idle");

      alert("Match scratched ✅ Winner saved (no score).");
      await loadState();
    } catch (e) {
      console.error(e);
      setScratchStatus("error");
      setScratchError(e.message || "Could not scratch match.");
      alert(e.message || "Scratch failed.");
    }
  }

  // For standings tabs
  const finalsOnly = useMemo(() => {
    const m = finals.find((x) => x.phase === "FINAL" || x.id === "FINAL");
    return m ? [m] : [];
  }, [finals]);

  const thirdOnly = useMemo(() => {
    const m = finals.find((x) => x.phase === "THIRD" || x.id === "THIRD");
    return m ? [m] : [];
  }, [finals]);

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
            <HStack gap={3} wrap="wrap">
              <IconButton
                aria-label="Home"
                variant="outline"
                onClick={() => navigate("/")}
              >
                <Home size={18} />
              </IconButton>
              {savedMsg ? (
                <Box
                  border="1px solid"
                  borderColor="green.200"
                  bg="green.50"
                  p={3}
                  borderRadius="lg"
                >
                  <Text color="green.800" fontWeight="700" fontSize="sm">
                    {savedMsg}
                  </Text>
                </Box>
              ) : null}
              <IconButton
                aria-label="Calendar"
                variant="outline"
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
                disabled={
                  !tid || advancingFinals || tournamentComplete || !semisExist
                }
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
                disabled={
                  !tid ||
                  resettingPlayoffs ||
                  tournamentComplete ||
                  (!semisExist && !finalsExist)
                }
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
      </StickyPageHeader>

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

          {/* Standings tabs */}
          {tid && status === "ok" ? (
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
                    Switch phases
                  </Text>
                </Flex>

                <Tabs.Root defaultValue="rr" variant="enclosed">
                  <Tabs.List>
                    <Tabs.Trigger value="rr">Round Robin</Tabs.Trigger>
                    <Tabs.Trigger value="sf">Semis</Tabs.Trigger>
                    <Tabs.Trigger value="final">Final</Tabs.Trigger>
                    <Tabs.Trigger value="third">3rd Place</Tabs.Trigger>
                  </Tabs.List>

                  <Box mt={3}>
                    <Tabs.Content value="rr">
                      {standings.length > 0 ? (
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
                                  ? Math.max(
                                      0,
                                      Number(played) - Number(s.wins ?? 0)
                                    )
                                  : "—";
                              return (
                                <Table.Row key={String(s.teamId)}>
                                  <Table.Cell>{idx + 1}</Table.Cell>
                                  <Table.Cell fontWeight="600">
                                    <HStack gap={2}>
                                      <Text>{teamDisplay(s.teamId)}</Text>
                                      {scratchedTeamIds.has(
                                        String(s.teamId)
                                      ) ? (
                                        <Badge variant="outline" opacity={0.6}>
                                          Scratched
                                        </Badge>
                                      ) : null}
                                    </HStack>
                                  </Table.Cell>
                                  <Table.Cell>{s.wins}</Table.Cell>
                                  <Table.Cell>{losses}</Table.Cell>
                                  <Table.Cell>{s.pointDiff}</Table.Cell>
                                </Table.Row>
                              );
                            })}
                          </Table.Body>
                        </Table.Root>
                      ) : (
                        <Text opacity={0.7}>No round robin standings yet.</Text>
                      )}
                    </Tabs.Content>

                    <Tabs.Content value="sf">
                      {semisExist ? (
                        <MatchesMiniList
                          matches={semis}
                          teamDisplay={teamDisplay}
                        />
                      ) : (
                        <Text opacity={0.7}>
                          Semifinals haven’t been generated yet.
                        </Text>
                      )}
                    </Tabs.Content>

                    <Tabs.Content value="final">
                      {finalsOnly.length ? (
                        <MatchesMiniList
                          matches={finalsOnly}
                          teamDisplay={teamDisplay}
                        />
                      ) : (
                        <Text opacity={0.7}>
                          Final match not available yet.
                        </Text>
                      )}
                    </Tabs.Content>

                    <Tabs.Content value="third">
                      {thirdOnly.length ? (
                        <MatchesMiniList
                          matches={thirdOnly}
                          teamDisplay={teamDisplay}
                        />
                      ) : (
                        <Text opacity={0.7}>
                          Third place match not available yet.
                        </Text>
                      )}
                    </Tabs.Content>
                  </Box>
                </Tabs.Root>
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
                        Actions
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

                      const forfeited = isForfeitRR(m);
                      const isEditingThis = !!editMode[m.id];

                      const isFinalsMatch =
                        m.phase === "FINAL" || m.phase === "THIRD";
                      const lockedByFinals = finalsConfirmed && !isFinalsMatch;

                      // Lock completed matches unless user entered edit mode
                      const locked =
                        tournamentComplete ||
                        lockedByFinals ||
                        (!!m.winnerId && !isEditingThis);

                      // "Only show buttons when a score exists" => applies mainly to EDIT.
                      const showEdit =
                        !tournamentComplete &&
                        !lockedByFinals &&
                        !!m.winnerId &&
                        hasAnyScoreOrForfeit(m) &&
                        !isEditingThis;

                      // Scratch only RR + incomplete, and not locked by finals
                      const showScratch =
                        m.phase === "RR" &&
                        !tournamentComplete &&
                        !finalsConfirmed;

                      // Save only when editing OR user has typed something in
                      const hasTypedSomething =
                        (row.scoreA ?? "") !== "" || (row.scoreB ?? "") !== "";
                      const showSave =
                        !tournamentComplete &&
                        !locked &&
                        (isEditingThis || hasTypedSomething);

                      const showCancel = isEditingThis;

                      const showAnyActions =
                        showEdit || showScratch || showSave || showCancel;

                      return (
                        <Table.Row
                          key={`${m.phase}-${m.id}`}
                          role="group"
                          bg={forfeited ? "gray.50" : undefined}
                        >
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

                            {forfeited ? (
                              <HStack mt={1} gap={1.5} opacity={0.85}>
                                <Flag size={14} />
                                <Text fontSize="xs">Forfeit</Text>
                              </HStack>
                            ) : null}

                            {row.error ? (
                              <Text fontSize="xs" color="red.600">
                                {row.error}
                              </Text>
                            ) : null}
                          </Table.Cell>

                          {/* Actions: icon-only, fade in on hover */}
                          <Table.Cell textAlign="end">
                            {showAnyActions ? (
                              <HStack justify="flex-end" gap={1}>
                                {showEdit ? (
                                  <IconButton
                                    aria-label="Edit score"
                                    variant="outline"
                                    size="sm"
                                    borderRadius="full"
                                    onClick={() => beginEdit(m)}
                                    disabled={!tid || row.saving}
                                    _hover={{ bg: "cream.100" }}
                                  >
                                    <RotateCcw size={16} />
                                  </IconButton>
                                ) : null}

                                {showCancel ? (
                                  <IconButton
                                    aria-label="Cancel edit"
                                    variant="outline"
                                    size="sm"
                                    borderRadius="full"
                                    onClick={() => cancelEdit(m)}
                                    disabled={!tid || row.saving}
                                    _hover={{ bg: "gray.100" }}
                                  >
                                    <X size={16} />
                                  </IconButton>
                                ) : null}

                                {showSave ? (
                                  <IconButton
                                    aria-label="Save score"
                                    variant="outline"
                                    size="sm"
                                    borderRadius="full"
                                    onClick={() => saveMatch(m)}
                                    disabled={!tid || row.saving}
                                    _hover={{ bg: "green.50" }}
                                  >
                                    <Save size={16} />
                                  </IconButton>
                                ) : null}

                                {showScratch ? (
                                  <IconButton
                                    aria-label="Scratch match"
                                    title="Forfeit (clears score)"
                                    variant="ghost"
                                    size="sm"
                                    borderRadius="full"
                                    onClick={() => openScratch(m)}
                                    disabled={!tid}
                                    _hover={{ bg: "orange.50" }}
                                  >
                                    <Flag size={16} />
                                  </IconButton>
                                ) : null}
                              </HStack>
                            ) : (
                              <Text opacity={0.5}>—</Text>
                            )}
                          </Table.Cell>
                        </Table.Row>
                      );
                    })}
                  </Table.Body>
                </Table.Root>
              )}
            </Card.Body>
          </Card.Root>

          {/* Finals quick summary */}
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

      {/* ------------------ SCRATCH DIALOG ------------------ */}
      <Dialog.Root
        open={scratchOpen}
        onOpenChange={(e) => setScratchOpen(e.open)}
      >
        <Portal>
          <Dialog.Backdrop zIndex={20000} />
          <Dialog.Positioner zIndex={20001}>
            <Dialog.Content zIndex={20002}>
              <Dialog.Header>
                <Dialog.Title>Scratch / Forfeit (Round Robin)</Dialog.Title>
              </Dialog.Header>

              <Dialog.Body>
                <Stack gap={3}>
                  {scratchError ? (
                    <Box
                      border="1px solid"
                      borderColor="red.200"
                      bg="red.50"
                      p={3}
                      borderRadius="lg"
                    >
                      <Text color="red.700" fontSize="sm">
                        {scratchError}
                      </Text>
                    </Box>
                  ) : null}

                  <Text opacity={0.85}>
                    Choose who advances as the winner for{" "}
                    <b>{scratchMatch?.id ?? "this match"}</b>. This will mark
                    the match as a <b>forfeit</b> (no score).
                  </Text>

                  {scratchMatch && hasAnyScoreOrForfeit(scratchMatch) ? (
                    <Box
                      mt={2}
                      border="1px solid"
                      borderColor="orange.300"
                      bg="orange.50"
                      p={3}
                      borderRadius="lg"
                    >
                      <Text fontSize="sm" fontWeight="800">
                        Heads up
                      </Text>
                      <Text fontSize="sm" opacity={0.85}>
                        This match already has a saved result. Confirming will
                        overwrite it and clear any scores.
                      </Text>
                    </Box>
                  ) : null}

                  {scratchMatch ? (
                    <Box
                      border="1px solid"
                      borderColor="border"
                      borderRadius="lg"
                      p={3}
                      bg="cream.50"
                    >
                      <Text fontWeight="700">
                        {teamDisplay(scratchMatch.teamAId)}
                      </Text>
                      <Text opacity={0.7} fontSize="sm">
                        vs {teamDisplay(scratchMatch.teamBId)}
                      </Text>
                    </Box>
                  ) : null}

                  {confirmScratchFor ? (
                    <Box
                      border="1px solid"
                      borderColor="orange.300"
                      bg="orange.50"
                      p={3}
                      borderRadius="lg"
                    >
                      <Text fontSize="sm" fontWeight="800">
                        Confirm scratch/forfeit
                      </Text>
                      <Text fontSize="sm" opacity={0.85}>
                        This will permanently mark this match as a forfeit (no
                        score). Continue?
                      </Text>
                    </Box>
                  ) : null}
                </Stack>
              </Dialog.Body>

              <Dialog.Footer>
                <HStack gap={2} justify="flex-end" wrap="wrap" w="100%">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setScratchOpen(false);
                      setScratchMatch(null);
                      setScratchError("");
                      setScratchStatus("idle");
                      setConfirmScratchFor(null);
                    }}
                    disabled={scratchStatus === "saving"}
                  >
                    Cancel
                  </Button>

                  {confirmScratchFor ? (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => setConfirmScratchFor(null)}
                        disabled={scratchStatus === "saving"}
                      >
                        Go back
                      </Button>

                      <Button
                        variant="pickle"
                        onClick={() =>
                          submitScratch(
                            confirmScratchFor === "A"
                              ? Number(scratchMatch?.teamAId)
                              : Number(scratchMatch?.teamBId)
                          )
                        }
                        disabled={scratchStatus === "saving"}
                      >
                        Yes, confirm forfeit
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => setConfirmScratchFor("A")}
                        disabled={
                          scratchStatus === "saving" || !scratchMatch?.teamAId
                        }
                        borderColor={
                          confirmScratchFor === "A" ? "orange.400" : "border"
                        }
                        bg={
                          confirmScratchFor === "A"
                            ? "orange.50"
                            : "transparent"
                        }
                      >
                        Winner: Team A — {teamDisplay(scratchMatch?.teamAId)}
                      </Button>

                      <Button
                        variant="outline"
                        onClick={() => setConfirmScratchFor("B")}
                        disabled={
                          scratchStatus === "saving" || !scratchMatch?.teamBId
                        }
                        borderColor={
                          confirmScratchFor === "B" ? "orange.400" : "border"
                        }
                        bg={
                          confirmScratchFor === "B"
                            ? "orange.50"
                            : "transparent"
                        }
                      >
                        Winner: Team B — {teamDisplay(scratchMatch?.teamBId)}
                      </Button>
                    </>
                  )}
                </HStack>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </Box>
  );
}
