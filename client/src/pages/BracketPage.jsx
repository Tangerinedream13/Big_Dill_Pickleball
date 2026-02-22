// client/src/pages/BracketPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Container,
  Heading,
  HStack,
  IconButton,
  Spacer,
  Text,
  Table,
  Stack,
  SimpleGrid,
  useBreakpointValue,
  Badge,
  Portal,
} from "@chakra-ui/react";
import { ArrowLeft, Home, Printer, RotateCcw } from "lucide-react";
import { getCurrentTournamentId } from "../tournamentStore";
import { API_BASE } from "../apiBase";
import usePageTitle from "../hooks/usePageTitle";

/**
 * Important: this file guards against “Objects are not valid as a React child”
 * by ALWAYS returning a string for team labels.
 */
function safeTeamLabel(team, fallback) {
  if (!team) return fallback;

  // Common: { id, name: "Haddon Girls" }
  if (typeof team.name === "string") return team.name;

  // Sometimes: { id, name: { id, name } }
  if (team.name && typeof team.name === "object") {
    if (typeof team.name.name === "string") return team.name.name;
  }

  // Alternate keys
  if (typeof team.teamName === "string") return team.teamName;
  if (typeof team.title === "string") return team.title;

  return fallback;
}

function teamLabelById(teams, id) {
  const t = teams.find((x) => String(x.id) === String(id));
  return safeTeamLabel(t, `Team ${id}`);
}

function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderScoreOrBox(score) {
  const s =
    score === null || score === undefined || score === "" ? "" : String(score);
  if (!s) return <div className="score-box" />;
  return (
    <div
      style={{
        border: "1px solid #222",
        height: 22,
        borderRadius: 6,
        display: "grid",
        placeItems: "center",
        fontWeight: 800,
        fontSize: 12,
      }}
    >
      {s}
    </div>
  );
}

function ScorePill({ value }) {
  const s =
    value === null || value === undefined || value === "" ? "—" : String(value);
  return (
    <Box
      minW="44px"
      textAlign="center"
      border="1px solid"
      borderColor="border"
      borderRadius="md"
      px={2}
      py={1}
      fontWeight="800"
      bg="white"
    >
      {s}
    </Box>
  );
}

function MatchCard({ title, aLabel, bLabel, scoreA, scoreB, winnerLabel }) {
  return (
    <Box
      border="1px solid"
      borderColor="border"
      borderRadius="2xl"
      p={4}
      bg="white"
    >
      <HStack justify="space-between" mb={2} flexWrap="wrap">
        <Heading size="sm">{title}</Heading>
        {winnerLabel ? (
          <Badge variant="pickle">Winner: {winnerLabel}</Badge>
        ) : null}
      </HStack>

      <Stack gap={2}>
        <HStack justify="space-between" align="center" gap={3}>
          <Text fontWeight="700" noOfLines={1} flex="1" minW={0}>
            {aLabel}
          </Text>
          <ScorePill value={scoreA} />
        </HStack>

        <HStack justify="space-between" align="center" gap={3}>
          <Text fontWeight="700" noOfLines={1} flex="1" minW={0}>
            {bLabel}
          </Text>
          <ScorePill value={scoreB} />
        </HStack>
      </Stack>
    </Box>
  );
}

export default function BracketPage() {
  usePageTitle("Bracket");
  const navigate = useNavigate();
  const tid = getCurrentTournamentId();
  const [showRR, setShowRR] = useState(false);

  const [loading, setLoading] = useState(true);
  const [state, setState] = useState({
    teams: [],
    rrMatches: [],
    standings: [],
    semis: [],
    finals: [],
    placements: null,
    tournamentId: "",
  });
  const [error, setError] = useState("");
  const isMobile = useBreakpointValue({ base: true, md: false }) ?? true;

  // --- Mobile rotate hint (portrait-only) ---
  const [showRotateHint, setShowRotateHint] = useState(false);
  const dismissedRotateHintRef = useRef(false);

  useEffect(() => {
    function updateHint() {
      if (!isMobile) {
        setShowRotateHint(false);
        return;
      }
      if (dismissedRotateHintRef.current) {
        setShowRotateHint(false);
        return;
      }

      const portrait =
        window.matchMedia?.("(orientation: portrait)")?.matches ??
        window.innerHeight > window.innerWidth;

      setShowRotateHint(portrait);
    }

    updateHint();
    window.addEventListener("resize", updateHint);
    window.addEventListener("orientationchange", updateHint);

    return () => {
      window.removeEventListener("resize", updateHint);
      window.removeEventListener("orientationchange", updateHint);
    };
  }, [isMobile]);

  function withTid(path) {
    const base = (API_BASE || "").replace(/\/$/, "");
    const p = String(path || "").startsWith("/") ? path : `/${path}`;

    const u = base
      ? new URL(`${base}${p}`)
      : new URL(p, window.location.origin);

    if (tid) u.searchParams.set("tournamentId", tid);
    return u.toString();
  }

  async function fetchState() {
    setError("");
    setLoading(true);
    try {
      if (!tid) throw new Error("No tournament selected.");
      const res = await fetch(withTid("/api/tournament/state"));
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data?.error || "Failed to load tournament state");
      setState(data);
    } catch (e) {
      setError(e?.message || "Error connecting to backend");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tid]);

  const teams = state.teams || [];
  const semis = state.semis || [];
  const finals = state.finals || [];

  const finalMatch = useMemo(
    () => finals.find((m) => m.id === "FINAL") || null,
    [finals]
  );
  const thirdMatch = useMemo(
    () => finals.find((m) => m.id === "THIRD") || null,
    [finals]
  );

  // Seed map from RR standings: first = seed 1, etc.
  const seedByTeamId = useMemo(() => {
    const map = new Map();
    (state.standings || []).forEach((s, idx) => {
      map.set(String(s.teamId), idx + 1);
    });
    return map;
  }, [state.standings]);

  function seededTeamLabel(teamId) {
    if (!teamId) return "TBD";
    const seed = seedByTeamId.get(String(teamId));
    const name = teamLabelById(teams, teamId);
    return seed ? `#${seed} ${name}` : name;
  }

  // Print-friendly RR ordering:
  // - scheduled matches first (by time)
  // - then by court
  // - then by id
  const rrForPrint = useMemo(() => {
    const rr = [...(state.rrMatches || [])];
    rr.sort((a, b) => {
      const at = a.startTime
        ? new Date(a.startTime).getTime()
        : Number.POSITIVE_INFINITY;
      const bt = b.startTime
        ? new Date(b.startTime).getTime()
        : Number.POSITIVE_INFINITY;
      if (at !== bt) return at - bt;

      const ac = a.court ?? Number.POSITIVE_INFINITY;
      const bc = b.court ?? Number.POSITIVE_INFINITY;
      if (ac !== bc) return ac - bc;

      return String(a.id).localeCompare(String(b.id));
    });
    return rr;
  }, [state.rrMatches]);

  useEffect(() => {
    if (isMobile) setShowRR(rrForPrint.length <= 8);
  }, [isMobile, rrForPrint.length]);

  // Tournament complete + winner (based on FINAL winnerId)
  const tournamentWinnerLabel = useMemo(() => {
    if (!finalMatch?.winnerId) return "";
    return seededTeamLabel(finalMatch.winnerId);
  }, [finalMatch, seedByTeamId, teams]);

  const tournamentComplete = useMemo(() => {
    const finalsList = state.finals || [];
    const f = finalsList.find((m) => m.id === "FINAL");
    const t = finalsList.find((m) => m.id === "THIRD");
    const finalDone = f ? !!f.winnerId : false;
    const thirdDone = t ? !!t.winnerId : true; // if no third match, treat as done
    return finalDone && thirdDone;
  }, [state.finals]);

  return (
    <Container maxW="6xl" py={8} px={{ base: 4, md: 6 }} overflowX="hidden">
      {/* Print styles */}
      <style>{`
        .print-sheet { background: white; max-width: 100%; }
        .print-only { display: none; }
  
        @media print {
          @page { margin: 0.5in; }
  
          .no-print { display: none !important; }
          body { background: white !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-sheet { padding: 0 !important; margin: 0 !important; }
          .print-only { display: block !important; }
          .page-break { break-before: page; page-break-before: always; }
          .avoid-break { break-inside: avoid; page-break-inside: avoid; }
  
          table { table-layout: fixed; width: 100%; }
          th, td { font-size: 10px !important; padding: 6px !important; vertical-align: top; }
        }
  
        .sheet-title { font-size: 22px; font-weight: 800; margin-bottom: 6px; }
        .sheet-sub { font-size: 12px; opacity: 0.9; margin-bottom: 12px; }
        .section-title { font-size: 14px; font-weight: 800; margin: 14px 0 8px; }
        .box { border: 1px solid #222; border-radius: 10px; padding: 10px; }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
        .line { height: 1px; background: #222; opacity: 0.6; margin: 10px 0; }
  
        .match-box { border: 1px solid #222; border-radius: 10px; padding: 10px; }
        .match-row { display: grid; grid-template-columns: 1fr 44px; gap: 8px; align-items: center; }
        .score-box { border: 1px solid #222; height: 22px; border-radius: 6px; }
        .note-box { border: 1px solid #222; height: 28px; border-radius: 6px; }
  
        /* Mobile safety: stack grids to prevent horizontal overflow */
        @media (max-width: 600px) {
          .grid2 { grid-template-columns: 1fr; }
          .grid3 { grid-template-columns: 1fr; }
        }
  
        /* Make wide tables scroll instead of spilling */
        .table-scroll {
          display: block;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          width: 100%;
        }
  
        /* Optional: give tables a minimum width so scrolling actually engages */
        .table-min {
          min-width: 760px;
        }

        /* -------- Rotate hint overlay (mobile portrait) -------- */
        .rotate-hint {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: grid;
          place-items: center;
          padding: 16px;
          background: rgba(0, 0, 0, 0.55);
        }
        .rotate-hint-card {
          width: min(420px, 92vw);
          background: white;
          border: 1px solid #222;
          border-radius: 16px;
          padding: 16px;
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.25);
        }
        .rotate-hint-row {
          display: grid;
          grid-template-columns: 52px 1fr;
          gap: 12px;
          align-items: center;
          margin-bottom: 12px;
        }
        .phone-icon {
          width: 42px;
          height: 42px;
          position: relative;
          transform-origin: 50% 50%;
          animation: phone-rotate 1.35s ease-in-out infinite;
        }
        .phone-body {
          position: absolute;
          inset: 6px 12px;
          border: 2px solid #222;
          border-radius: 8px;
          background: white;
        }
        .phone-notch {
          position: absolute;
          top: 10px;
          left: 50%;
          transform: translateX(-50%);
          width: 14px;
          height: 3px;
          border-radius: 999px;
          background: #222;
          opacity: 0.75;
        }
        .rotate-arrow {
          position: absolute;
          right: -4px;
          top: -2px;
          width: 16px;
          height: 16px;
          border: 2px solid #222;
          border-left-color: transparent;
          border-bottom-color: transparent;
          border-radius: 999px;
          transform: rotate(25deg);
          opacity: 0.9;
        }
        .rotate-arrow::after {
          content: "";
          position: absolute;
          right: 1px;
          top: 1px;
          width: 0;
          height: 0;
          border-left: 6px solid #222;
          border-top: 4px solid transparent;
          border-bottom: 4px solid transparent;
          transform: rotate(18deg);
        }
        @keyframes phone-rotate {
          0%   { transform: rotate(0deg); }
          35%  { transform: rotate(90deg); }
          70%  { transform: rotate(90deg); }
          100% { transform: rotate(0deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .phone-icon { animation: none; }
        }
        @media print {
          .rotate-hint { display: none !important; }
        }
      `}</style>

      {/* Mobile rotate hint overlay */}
      {showRotateHint ? (
        <Portal>
          <div className="rotate-hint no-print" role="dialog" aria-modal="true">
            <div className="rotate-hint-card">
              <div className="rotate-hint-row">
                <div className="phone-icon" aria-hidden="true">
                  <div className="phone-body" />
                  <div className="phone-notch" />
                  <div className="rotate-arrow" />
                </div>

                <div>
                  <Heading size="sm" mb={1}>
                    Tip: Rotate for the best view
                  </Heading>
                  <Text opacity={0.8} fontSize="sm">
                    Brackets and schedules look better in landscape mode.
                  </Text>
                </div>
              </div>

              <HStack justify="flex-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    dismissedRotateHintRef.current = true;
                    setShowRotateHint(false);
                  }}
                >
                  Got it
                </Button>
              </HStack>
            </div>
          </div>
        </Portal>
      ) : null}

      {/* Header / controls (won't print) */}
      <HStack mb={6} className="no-print" flexWrap="wrap" gap={3} align="start">
        <IconButton
          aria-label="Home"
          variant="outline"
          onClick={() => navigate("/")}
          flexShrink={0}
        >
          <Home size={18} />
        </IconButton>

        <Heading size={{ base: "md", md: "lg" }} flex="1" minW={0}>
          Tournament Brackets
        </Heading>

        <HStack
          flexWrap="wrap"
          justify={{ base: "flex-start", md: "flex-end" }}
          w={{ base: "100%", md: "auto" }}
          gap={2}
        >
          <Button size="sm" variant="outline" onClick={fetchState}>
            <RotateCcw size={16} style={{ marginRight: 8 }} />
            Refresh
          </Button>

          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer size={16} style={{ marginRight: 8 }} />
            Print
          </Button>

          <Button size="sm" variant="outline" onClick={() => navigate("/")}>
            <ArrowLeft size={16} style={{ marginRight: 8 }} />
            Back
          </Button>
        </HStack>
      </HStack>

      {error && (
        <Box mb={4} p={3} borderWidth="1px" rounded="md">
          <Text>{error}</Text>
        </Box>
      )}

      {loading && teams.length === 0 ? <Text>Loading…</Text> : null}

            {/* On-screen bracket (desktop-style, responsive for mobile too) */}
            <Box className="print-sheet">
        <div className="sheet-title">Big Dill Pickleball Tournament Sheet</div>
        <div className="sheet-sub">
          Tournament ID: {state.tournamentId || tid || "—"} • Printed:{" "}
          {new Date().toLocaleString()}
        </div>

        {/* Legend */}
        <div className="box avoid-break" style={{ marginBottom: 12 }}>
          <div className="section-title">Legend</div>
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
            <div>
              • Round Robin games to <b>11</b>
            </div>
            <div>
              • Semifinal & Final games to <b>15</b>
            </div>
            <div>
              • Win by <b>2</b>
            </div>
            <div>• No ties (record final score)</div>
          </div>

          {tournamentComplete ? (
            <div
              style={{
                marginTop: 10,
                border: "1px solid #1a7f37",
                background: "#e9fbe9",
                borderRadius: 10,
                padding: 10,
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              Tournament Complete ✅{" "}
              {tournamentWinnerLabel ? ` Winner: ${tournamentWinnerLabel}` : ""}
            </div>
          ) : null}
        </div>

        {/* Teams + Notes */}
        <div className="grid2 avoid-break">
          <div className="box">
            <div className="section-title">Teams</div>
            <div style={{ fontSize: 12 }}>
              {teams.length === 0 ? (
                <div>—</div>
              ) : (
                teams.map((t, i) => (
                  <div key={t.id} style={{ display: "flex", gap: 8 }}>
                    <div style={{ width: 20, fontWeight: 700 }}>{i + 1}.</div>
                    <div style={{ wordBreak: "break-word" }}>
                      {safeTeamLabel(t, `Team ${t.id}`)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="box">
            <div className="section-title">Notes / Rules</div>
            <div style={{ height: 140 }} />
            <div className="line" />
            <div style={{ height: 40 }} />
          </div>
        </div>

        {/* Round Robin Schedule */}
        <div className="box avoid-break" style={{ marginTop: 12 }}>
          <div className="section-title">Round Robin Schedule</div>
          <div className="table-scroll">
            <Table.Root size="sm" className="table-min">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader w="80px">Match</Table.ColumnHeader>
                  <Table.ColumnHeader>Team A</Table.ColumnHeader>
                  <Table.ColumnHeader w="60px">Score</Table.ColumnHeader>
                  <Table.ColumnHeader>Team B</Table.ColumnHeader>
                  <Table.ColumnHeader w="60px">Score</Table.ColumnHeader>
                  <Table.ColumnHeader w="90px">Court</Table.ColumnHeader>
                  <Table.ColumnHeader w="180px">Time</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {rrForPrint.map((m) => (
                  <Table.Row key={m.id}>
                    <Table.Cell>{m.id}</Table.Cell>
                    <Table.Cell style={{ wordBreak: "break-word" }}>
                      {teamLabelById(teams, m.teamAId)}
                    </Table.Cell>
                    <Table.Cell>{renderScoreOrBox(m.scoreA)}</Table.Cell>
                    <Table.Cell style={{ wordBreak: "break-word" }}>
                      {teamLabelById(teams, m.teamBId)}
                    </Table.Cell>
                    <Table.Cell>{renderScoreOrBox(m.scoreB)}</Table.Cell>
                    <Table.Cell>{m.court ? `Court ${m.court}` : ""}</Table.Cell>
                    <Table.Cell>{fmtTime(m.startTime)}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </div>
        </div>

        {/* Standings */}
        <div className="box avoid-break" style={{ marginTop: 12 }}>
          <div className="section-title">Standings</div>
          <div className="table-scroll">
            <Table.Root size="sm" className="table-min">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader w="60px">Seed</Table.ColumnHeader>
                  <Table.ColumnHeader>Team</Table.ColumnHeader>
                  <Table.ColumnHeader w="80px">Wins</Table.ColumnHeader>
                  <Table.ColumnHeader w="90px">Point Diff</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {(state.standings || []).map((s, idx) => (
                  <Table.Row key={s.teamId}>
                    <Table.Cell>{idx + 1}</Table.Cell>
                    <Table.Cell style={{ wordBreak: "break-word" }}>
                      {teamLabelById(teams, s.teamId)}
                    </Table.Cell>
                    <Table.Cell>{s.wins}</Table.Cell>
                    <Table.Cell>{s.pointDiff}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </div>
        </div>

        {/* Playoffs */}
        <div className="page-break" />
        <div className="sheet-title">Playoff Bracket</div>
        <div className="sheet-sub">
          Semis → Final • Third-place match included
        </div>

        <div className="grid3">
          <div className="box avoid-break">
            <div className="section-title">Semifinal 1</div>
            <div>{semis[0] ? seededTeamLabel(semis[0].teamAId) : "TBD"}</div>
            <div>{semis[0] ? seededTeamLabel(semis[0].teamBId) : "TBD"}</div>
          </div>

          <div className="box avoid-break">
            <div className="section-title">Final</div>
            <div>
              {finalMatch ? seededTeamLabel(finalMatch.teamAId) : "Winner SF1"}
            </div>
            <div>
              {finalMatch ? seededTeamLabel(finalMatch.teamBId) : "Winner SF2"}
            </div>
          </div>

          <div className="box avoid-break">
            <div className="section-title">Third Place</div>
            <div>
              {thirdMatch ? seededTeamLabel(thirdMatch.teamAId) : "Loser SF1"}
            </div>
            <div>
              {thirdMatch ? seededTeamLabel(thirdMatch.teamBId) : "Loser SF2"}
            </div>
          </div>
        </div>
      </Box>
    </Container>
  );
}