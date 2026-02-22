// client/src/pages/BracketPage.jsx
import { useEffect, useMemo, useState } from "react";
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
  Divider,
  Badge,
  Collapse,
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
  const isMobile = useBreakpointValue({ base: true, md: false });

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
    <Container maxW="6xl" py={8}>
      {/* Print styles */}
      <style>{`
        .print-sheet { background: white; }
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
      `}</style>

      {/* Header / controls (won't print) */}
      <HStack mb={6} className="no-print">
        <IconButton
          aria-label="Home"
          variant="outline"
          onClick={() => navigate("/")}
        >
          <Home size={18} />
        </IconButton>

        <Heading size={{ base: "md", md: "lg" }}>Tournament Brackets</Heading>

        <Spacer />

        <HStack>
          <Button variant="outline" onClick={fetchState}>
            <RotateCcw size={16} style={{ marginRight: 8 }} />
            Refresh
          </Button>

          <Button variant="outline" onClick={() => window.print()}>
            <Printer size={16} style={{ marginRight: 8 }} />
            Print
          </Button>

          <Button variant="outline" onClick={() => navigate("/")}>
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

      {/* On-screen bracket (mobile-friendly) */}
      {isMobile ? (
        <Stack gap={4}>
          <Box>
            <Heading size="md" mb={1}>
              Bracket
            </Heading>
            <Text opacity={0.75}>
              Tournament: {state.tournamentId || tid || "—"}
            </Text>
          </Box>

          <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
            <MatchCard
              title="Semifinal 1"
              aLabel={semis[0] ? seededTeamLabel(semis[0].teamAId) : "TBD"}
              bLabel={semis[0] ? seededTeamLabel(semis[0].teamBId) : "TBD"}
              scoreA={semis[0]?.scoreA}
              scoreB={semis[0]?.scoreB}
              winnerLabel={
                semis[0]?.winnerId ? seededTeamLabel(semis[0].winnerId) : ""
              }
            />

            <MatchCard
              title="Semifinal 2"
              aLabel={semis[1] ? seededTeamLabel(semis[1].teamAId) : "TBD"}
              bLabel={semis[1] ? seededTeamLabel(semis[1].teamBId) : "TBD"}
              scoreA={semis[1]?.scoreA}
              scoreB={semis[1]?.scoreB}
              winnerLabel={
                semis[1]?.winnerId ? seededTeamLabel(semis[1].winnerId) : ""
              }
            />
          </SimpleGrid>

          <Divider />

          <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
            <MatchCard
              title="Final"
              aLabel={
                finalMatch ? seededTeamLabel(finalMatch.teamAId) : "Winner SF1"
              }
              bLabel={
                finalMatch ? seededTeamLabel(finalMatch.teamBId) : "Winner SF2"
              }
              scoreA={finalMatch?.scoreA}
              scoreB={finalMatch?.scoreB}
              winnerLabel={
                finalMatch?.winnerId ? seededTeamLabel(finalMatch.winnerId) : ""
              }
            />

            <MatchCard
              title="Third Place"
              aLabel={
                thirdMatch ? seededTeamLabel(thirdMatch.teamAId) : "Loser SF1"
              }
              bLabel={
                thirdMatch ? seededTeamLabel(thirdMatch.teamBId) : "Loser SF2"
              }
              scoreA={thirdMatch?.scoreA}
              scoreB={thirdMatch?.scoreB}
              winnerLabel={
                thirdMatch?.winnerId ? seededTeamLabel(thirdMatch.winnerId) : ""
              }
            />
          </SimpleGrid>

          <Divider />

          {/* Mobile Round Robin (collapsible) */}
          <Box
            border="1px solid"
            borderColor="border"
            borderRadius="2xl"
            p={4}
            bg="white"
          >
            <HStack justify="space-between" mb={2} flexWrap="wrap">
              <Heading size="sm">Round Robin</Heading>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowRR((v) => !v)}
              >
                {showRR ? "Hide" : "Show"}
              </Button>
            </HStack>

            <Text fontSize="sm" opacity={0.75} mb={3}>
              {rrForPrint.length} matches
            </Text>

            <Collapse in={showRR} animateOpacity>
              <Stack gap={2}>
                {rrForPrint.map((m) => (
                  <Box
                    key={m.id}
                    border="1px solid"
                    borderColor="border"
                    borderRadius="xl"
                    p={3}
                  >
                    <HStack justify="space-between" mb={1} flexWrap="wrap">
                      <Text fontWeight="800">{m.id}</Text>
                      <Text fontSize="sm" opacity={0.75}>
                        {m.court ? `Court ${m.court}` : ""}
                        {m.startTime ? ` • ${fmtTime(m.startTime)}` : ""}
                      </Text>
                    </HStack>

                    <HStack justify="space-between" gap={3}>
                      <Text fontWeight="700" noOfLines={1} flex="1" minW={0}>
                        {teamLabelById(teams, m.teamAId)}
                      </Text>
                      <ScorePill value={m.scoreA} />
                    </HStack>

                    <HStack justify="space-between" gap={3} mt={2}>
                      <Text fontWeight="700" noOfLines={1} flex="1" minW={0}>
                        {teamLabelById(teams, m.teamBId)}
                      </Text>
                      <ScorePill value={m.scoreB} />
                    </HStack>
                  </Box>
                ))}
              </Stack>
            </Collapse>
          </Box>
        </Stack>
      ) : (
        // Desktop / print sheet
        <Box className="print-sheet">
          <div className="sheet-title">Big Dill Pickleball Tournament Sheet</div>
          <div className="sheet-sub">
            Tournament ID: {state.tournamentId || tid || "—"} • Printed:{" "}
            {new Date().toLocaleString()}
          </div>

          {/* Legend (RR to 11, Playoffs to 15) */}
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

            <Table.Root size="sm">
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

          {/* Round Robin Results */}
          <div className="box avoid-break" style={{ marginTop: 12 }}>
            <div className="section-title">Round Robin Results</div>

            <Table.Root size="sm">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader w="80px">Match</Table.ColumnHeader>
                  <Table.ColumnHeader>Winner</Table.ColumnHeader>
                  <Table.ColumnHeader w="140px">Final Score</Table.ColumnHeader>
                  <Table.ColumnHeader>Notes</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>

              <Table.Body>
                {rrForPrint.map((m) => {
                  const a = teamLabelById(teams, m.teamAId);
                  const b = teamLabelById(teams, m.teamBId);
                  const winner =
                    m.winnerId == null
                      ? ""
                      : String(m.winnerId) === String(m.teamAId)
                      ? a
                      : b;

                  const scoreText =
                    m.scoreA != null &&
                    m.scoreB != null &&
                    m.scoreA !== "" &&
                    m.scoreB !== ""
                      ? `${m.scoreA}-${m.scoreB}`
                      : "";

                  return (
                    <Table.Row key={`${m.id}-results`}>
                      <Table.Cell>{m.id}</Table.Cell>
                      <Table.Cell>
                        {winner ? (
                          <span style={{ fontWeight: 800 }}>{winner}</span>
                        ) : (
                          <div className="score-box" />
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        {scoreText ? (
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
                            {scoreText}
                          </div>
                        ) : (
                          <div className="score-box" />
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        <div className="note-box" />
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table.Root>
          </div>

          {/* Standings */}
          <div className="box avoid-break" style={{ marginTop: 12 }}>
            <div className="section-title">Standings</div>

            <Table.Root size="sm">
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

          {/* Playoffs on new page */}
          <div className="page-break" />

          {/* (everything below stays exactly the same as your file) */}
          <div className="sheet-title">Playoff Bracket</div>
          <div className="sheet-sub">Semis → Final • Third-place match included</div>

          <div className="grid3">
            {/* Semis with seeds */}
            <div className="box avoid-break">
              <div className="section-title">Semifinal 1 (to 15)</div>
              <div className="match-box">
                <div className="match-row">
                  <div>{semis[0] ? seededTeamLabel(semis[0].teamAId) : "TBD"}</div>
                  {renderScoreOrBox(semis[0]?.scoreA)}
                </div>
                <div style={{ height: 8 }} />
                <div className="match-row">
                  <div>{semis[0] ? seededTeamLabel(semis[0].teamBId) : "TBD"}</div>
                  {renderScoreOrBox(semis[0]?.scoreB)}
                </div>
              </div>

              <div className="section-title" style={{ marginTop: 12 }}>
                Semifinal 2 (to 15)
              </div>
              <div className="match-box">
                <div className="match-row">
                  <div>{semis[1] ? seededTeamLabel(semis[1].teamAId) : "TBD"}</div>
                  {renderScoreOrBox(semis[1]?.scoreA)}
                </div>
                <div style={{ height: 8 }} />
                <div className="match-row">
                  <div>{semis[1] ? seededTeamLabel(semis[1].teamBId) : "TBD"}</div>
                  {renderScoreOrBox(semis[1]?.scoreB)}
                </div>
              </div>
            </div>

            {/* Finals section */}
            <div className="box avoid-break">
              <div className="section-title">Final (to 15)</div>
              <div className="match-box">
                <div className="match-row">
                  <div>
                    {finalMatch ? seededTeamLabel(finalMatch.teamAId) : "Winner SF1"}
                  </div>
                  {renderScoreOrBox(finalMatch?.scoreA)}
                </div>
                <div style={{ height: 8 }} />
                <div className="match-row">
                  <div>
                    {finalMatch ? seededTeamLabel(finalMatch.teamBId) : "Winner SF2"}
                  </div>
                  {renderScoreOrBox(finalMatch?.scoreB)}
                </div>
              </div>

              <div className="section-title" style={{ marginTop: 12 }}>
                Third Place (to 15)
              </div>
              <div className="match-box">
                <div className="match-row">
                  <div>
                    {thirdMatch ? seededTeamLabel(thirdMatch.teamAId) : "Loser SF1"}
                  </div>
                  {renderScoreOrBox(thirdMatch?.scoreA)}
                </div>
                <div style={{ height: 8 }} />
                <div className="match-row">
                  <div>
                    {thirdMatch ? seededTeamLabel(thirdMatch.teamBId) : "Loser SF2"}
                  </div>
                  {renderScoreOrBox(thirdMatch?.scoreB)}
                </div>
              </div>
            </div>

            {/* Placements */}
            <div className="box avoid-break">
              <div className="section-title">Placements</div>

              <div style={{ fontSize: 12, lineHeight: 2 }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "90px 1fr",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <div>
                    <b>Champion:</b>
                  </div>
                  <div className="score-box" />
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "90px 1fr",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <div>
                    <b>Runner-up:</b>
                  </div>
                  <div className="score-box" />
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "90px 1fr",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <div>
                    <b>Third:</b>
                  </div>
                  <div className="score-box" />
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "90px 1fr",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <div>
                    <b>Fourth:</b>
                  </div>
                  <div className="score-box" />
                </div>
              </div>

              <div className="line" />
              <div className="section-title">Organizer signature</div>
              <div style={{ height: 50 }} />
            </div>
          </div>
        </Box>
      )}
    </Container>
  );
}