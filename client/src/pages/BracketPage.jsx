// client/src/pages/BracketPage.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Container,
  Heading,
  HStack,
  Spacer,
  Text,
  Table,
} from "@chakra-ui/react";
import { ArrowLeft, Printer } from "lucide-react";
import { getCurrentTournamentId } from "../tournamentStore";

function teamNameById(teams, id) {
  return teams.find((t) => String(t.id) === String(id))?.name ?? `Team ${id}`;
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

export default function BracketPage() {
  const navigate = useNavigate();
  const tid = getCurrentTournamentId();

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

  function withTid(path) {
    const u = new URL(path, window.location.origin);
    if (tid) u.searchParams.set("tournamentId", tid);
    return u.pathname + u.search;
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
  const placements = state.placements;

  const finalMatch = useMemo(
    () => finals.find((m) => m.id === "FINAL") || null,
    [finals]
  );
  const thirdMatch = useMemo(
    () => finals.find((m) => m.id === "THIRD") || null,
    [finals]
  );

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

          /* RR table readability on paper */
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
        .match-row { display: grid; grid-template-columns: 1fr 40px; gap: 8px; align-items: center; }
        .score-box { border: 1px solid #222; height: 22px; border-radius: 6px; }
        .note-box { border: 1px solid #222; height: 28px; border-radius: 6px; }
      `}</style>

      {/* Header / controls (won't print) */}
      <HStack mb={6} className="no-print">
        <Heading size="lg">Tournament Brackets</Heading>
        <Spacer />
        <HStack>
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

      {/* PRINT SHEET */}
      <Box className="print-sheet">
        <div className="sheet-title">
          Big Dill Pickleball — Tournament Sheet
        </div>
        <div className="sheet-sub">
          Tournament ID: {state.tournamentId || tid || "—"} • Printed:{" "}
          {new Date().toLocaleString()}
        </div>

        {/* ✅ Legend */}
        <div className="box avoid-break" style={{ marginBottom: 12 }}>
          <div className="section-title">Legend</div>
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
            <div>
              • Games to <b>11</b>
            </div>
            <div>
              • Win by <b>2</b>
            </div>
            <div>• No ties (record final score)</div>
          </div>
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
                    <div style={{ wordBreak: "break-word" }}>{t.name}</div>
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
                    {teamNameById(teams, m.teamAId)}
                  </Table.Cell>
                  <Table.Cell>
                    <div className="score-box" />
                  </Table.Cell>
                  <Table.Cell style={{ wordBreak: "break-word" }}>
                    {teamNameById(teams, m.teamBId)}
                  </Table.Cell>
                  <Table.Cell>
                    <div className="score-box" />
                  </Table.Cell>
                  <Table.Cell>{m.court ? `Court ${m.court}` : ""}</Table.Cell>
                  <Table.Cell>{fmtTime(m.startTime)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </div>

        {/* ✅ Round Robin Results (Winner + Notes) */}
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
              {rrForPrint.map((m) => (
                <Table.Row key={`${m.id}-results`}>
                  <Table.Cell>{m.id}</Table.Cell>
                  <Table.Cell>
                    <div className="score-box" />
                  </Table.Cell>
                  <Table.Cell>
                    <div className="score-box" />
                  </Table.Cell>
                  <Table.Cell>
                    <div className="note-box" />
                  </Table.Cell>
                </Table.Row>
              ))}
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
                    {teamNameById(teams, s.teamId)}
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

        <div className="sheet-title">Playoff Bracket</div>
        <div className="sheet-sub">
          Semis → Final • Third-place match included
        </div>

        <div className="grid3">
          <div className="box avoid-break">
            <div className="section-title">Semifinal 1</div>
            <div className="match-box">
              <div className="match-row">
                <div>
                  {semis[0] ? teamNameById(teams, semis[0].teamAId) : "TBD"}
                </div>
                <div className="score-box" />
              </div>
              <div style={{ height: 8 }} />
              <div className="match-row">
                <div>
                  {semis[0] ? teamNameById(teams, semis[0].teamBId) : "TBD"}
                </div>
                <div className="score-box" />
              </div>
            </div>

            <div className="section-title" style={{ marginTop: 12 }}>
              Semifinal 2
            </div>
            <div className="match-box">
              <div className="match-row">
                <div>
                  {semis[1] ? teamNameById(teams, semis[1].teamAId) : "TBD"}
                </div>
                <div className="score-box" />
              </div>
              <div style={{ height: 8 }} />
              <div className="match-row">
                <div>
                  {semis[1] ? teamNameById(teams, semis[1].teamBId) : "TBD"}
                </div>
                <div className="score-box" />
              </div>
            </div>
          </div>

          <div className="box avoid-break">
            <div className="section-title">Final</div>
            <div className="match-box">
              <div className="match-row">
                <div>
                  {finalMatch
                    ? teamNameById(teams, finalMatch.teamAId)
                    : "Winner SF1"}
                </div>
                <div className="score-box" />
              </div>
              <div style={{ height: 8 }} />
              <div className="match-row">
                <div>
                  {finalMatch
                    ? teamNameById(teams, finalMatch.teamBId)
                    : "Winner SF2"}
                </div>
                <div className="score-box" />
              </div>
            </div>

            <div className="section-title" style={{ marginTop: 12 }}>
              Third Place
            </div>
            <div className="match-box">
              <div className="match-row">
                <div>
                  {thirdMatch
                    ? teamNameById(teams, thirdMatch.teamAId)
                    : "Loser SF1"}
                </div>
                <div className="score-box" />
              </div>
              <div style={{ height: 8 }} />
              <div className="match-row">
                <div>
                  {thirdMatch
                    ? teamNameById(teams, thirdMatch.teamBId)
                    : "Loser SF2"}
                </div>
                <div className="score-box" />
              </div>
            </div>
          </div>

          <div className="box avoid-break">
            <div className="section-title">Placements</div>
            <div style={{ fontSize: 12, lineHeight: 1.8 }}>
              <div>
                <b>Champion:</b>{" "}
                {placements ? teamNameById(teams, placements.champion) : "—"}
              </div>
              <div>
                <b>Runner-up:</b>{" "}
                {placements ? teamNameById(teams, placements.runnerUp) : "—"}
              </div>
              <div>
                <b>Third:</b>{" "}
                {placements ? teamNameById(teams, placements.third) : "—"}
              </div>
              <div>
                <b>Fourth:</b>{" "}
                {placements ? teamNameById(teams, placements.fourth) : "—"}
              </div>
            </div>

            <div className="line" />
            <div className="section-title">Organizer signature</div>
            <div style={{ height: 50 }} />
          </div>
        </div>
      </Box>
    </Container>
  );
}
