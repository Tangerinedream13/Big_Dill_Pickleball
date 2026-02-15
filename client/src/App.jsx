// client/src/App.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Container,
  Flex,
  Heading,
  HStack,
  Input,
  Stack,
  Text,
  Grid,
  Card,
  Select,
  createListCollection,
} from "@chakra-ui/react";
import { Trophy, Users, CalendarDays, Plus, LogIn, ChevronDown } from "lucide-react";

import heroImg from "./assets/pickleball-hero.jpg";
import {
  setCurrentTournamentId,
  getCurrentTournamentId,
} from "./tournamentStore";
import { setOptimisticPlayer } from "./optimisticPlayerStore";
import { API_BASE } from "./apiBase";
import usePageTitle from "./hooks/usePageTitle";

/* -----------------------------
   Shared layout components
------------------------------ */

function Surface({ children, ...props }) {
  return (
    <Box
      bg="white"
      border="1px solid"
      borderColor="border"
      borderRadius="2xl"
      boxShadow="soft"
      {...props}
    >
      {children}
    </Box>
  );
}

function ActionTile({ icon, title, desc, cta, onClick, disabled = false }) {
  return (
    <Surface p={5} opacity={disabled ? 0.6 : 1}>
      <HStack gap={3} mb={2}>
        <Box
          w="36px"
          h="36px"
          borderRadius="xl"
          bg="club.100"
          display="grid"
          placeItems="center"
        >
          {icon}
        </Box>
        <Text fontWeight="800" color="club.900">
          {title}
        </Text>
      </HStack>

      <Text fontSize="sm" opacity={0.85} mb={4}>
        {desc}
      </Text>

      <Button
        w="full"
        variant="outline"
        onClick={onClick}
        type="button"
        disabled={disabled}
      >
        {cta}
      </Button>
    </Surface>
  );
}

/* -----------------------------
   App
------------------------------ */

export default function App() {
  usePageTitle("Home");

  const navigate = useNavigate();

  // silent backend ping
  useEffect(() => {
    fetch(`${API_BASE}/api/message`).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -----------------------------
     Tournament selection (global)
  ------------------------------ */

  const [tournamentsStatus, setTournamentsStatus] = useState("idle");
  const [tournaments, setTournaments] = useState([]);
  const [tournamentsError, setTournamentsError] = useState("");

  const [selectedTid, setSelectedTid] = useState(getCurrentTournamentId() || "");

  async function loadTournaments() {
    setTournamentsError("");
    setTournamentsStatus("loading");
    try {
      const res = await fetch(`${API_BASE}/api/tournaments`);
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error();
      setTournaments(Array.isArray(data) ? data : []);
      setTournamentsStatus("ok");
    } catch {
      setTournamentsStatus("error");
      setTournamentsError("Could not load tournaments.");
    }
  }

  useEffect(() => {
    // Load tournaments once when landing on homepage
    if (tournamentsStatus === "idle") loadTournaments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tournamentCollection = useMemo(
    () =>
      createListCollection({
        items: tournaments.map((t) => ({
          value: String(t.id),
          label: t.name ?? `Tournament ${t.id}`,
        })),
      }),
    [tournaments]
  );

  function setTidEverywhere(id) {
    const next = String(id || "");
    setSelectedTid(next);
    if (next) setCurrentTournamentId(next);
  }

  const hasTournamentSelected = !!selectedTid;

  /* -----------------------------
     Join Tournament state
  ------------------------------ */

  const [joinOpen, setJoinOpen] = useState(false);

  const [joinName, setJoinName] = useState("");
  const [joinEmail, setJoinEmail] = useState("");
  const [joinDupr, setJoinDupr] = useState("");
  const [joinStatus, setJoinStatus] = useState("idle");
  const [joinError, setJoinError] = useState("");

  const isSubmitting = joinStatus === "saving";

  const canJoinSubmit =
    joinName.trim() && joinEmail.includes("@") && selectedTid && !isSubmitting;

  async function submitJoin(e) {
    e.preventDefault();
    setJoinError("");
    setJoinStatus("saving");

    const payload = {
      name: joinName.trim(),
      email: joinEmail.trim().toLowerCase(),
      duprRating: joinDupr.trim(),
    };

    try {
      const res = await fetch(
        `${API_BASE}/api/tournaments/${selectedTid}/signup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error);

      // OPTIMISTIC PLAYER WRITE (shared store)
      setOptimisticPlayer({
        id: "optimistic",
        tournamentId: selectedTid,
        name: payload.name,
        email: payload.email,
        duprRating: payload.duprRating || "—",
        _optimistic: true,
      });

      setCurrentTournamentId(selectedTid);
      navigate("/players");
    } catch (err) {
      setJoinStatus("error");
      setJoinError(err?.message || "Signup failed.");
    } finally {
      setJoinStatus("idle");
    }
  }

  /* -----------------------------
     UI
  ------------------------------ */

  const selectedTournamentLabel =
    tournamentCollection.items.find((i) => i.value === String(selectedTid))
      ?.label || "";

  return (
    <Box minH="100vh" py={{ base: 10, md: 14 }} bg="cream.50">
      <Container maxW="6xl">
        <Stack gap={10}>
          <Surface p={8}>
            <Flex gap={10} direction={{ base: "column", md: "row" }}>
              <Stack flex="1" gap={4}>
                <HStack gap={3} align="center" flexWrap="wrap">
                  <Heading>Big Dill Pickleball</Heading>
                  <Box w="1px" h="24px" bg="border" opacity={0.6} mx={2} />
                </HStack>

                <Surface p={4}>
                  <Stack gap={2}>
                    <HStack justify="space-between" align="center">
                      <Text fontWeight="800" color="club.900">
                        Current Tournament
                      </Text>
                    </HStack>

                    {tournamentsStatus === "error" ? (
                      <Text color="red.600" fontSize="sm">
                        {tournamentsError}
                      </Text>
                    ) : null}

                    <Select.Root
                      collection={tournamentCollection}
                      value={selectedTid ? [String(selectedTid)] : []}
                      onValueChange={(d) => setTidEverywhere(d.value?.[0])}
                      disabled={tournamentsStatus === "loading"}
                    >
                      <Select.Trigger>
                        <Select.ValueText
                          placeholder={
                            tournamentsStatus === "loading"
                              ? "Loading tournaments…"
                              : "Select a tournament"
                          }
                        />
                        <Select.Indicator>
                          <ChevronDown size={16} />
                        </Select.Indicator>
                      </Select.Trigger>
                      <Select.Content>
                        {tournamentCollection.items.map((opt) => (
                          <Select.Item key={opt.value} item={opt}>
                            {opt.label}
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Root>

                    {hasTournamentSelected ? (
                      <Text fontSize="sm" opacity={0.8}>
                        Selected: <b>{selectedTournamentLabel}</b>
                      </Text>
                    ) : (
                      <Text fontSize="sm" opacity={0.75}>
                        Select a tournament to unlock Matches + Printable
                        Brackets.
                      </Text>
                    )}
                  </Stack>
                </Surface>

                <HStack>
                  <Button
                    bg="club.900"
                    color="white"
                    onClick={() => setJoinOpen((v) => !v)}
                  >
                    <LogIn size={18} />
                    {joinOpen ? "Close Join" : "Join a Tournament"}
                  </Button>

                  <Button
                    variant="pickle"
                    onClick={() => navigate("/tournaments/new")}
                  >
                    <Plus size={18} />
                    Create Tournament
                  </Button>
                </HStack>

                {joinOpen && (
                  <Card.Root>
                    <Card.Body>
                      <Stack as="form" onSubmit={submitJoin} gap={4}>
                        {joinError ? (
                          <Text color="red.600">{joinError}</Text>
                        ) : null}

                        <Text fontSize="sm" opacity={0.85}>
                          You’re joining:{" "}
                          <b>
                            {selectedTournamentLabel ||
                              "Select a tournament above"}
                          </b>
                        </Text>

                        <Input
                          placeholder="Your name"
                          value={joinName}
                          onChange={(e) => setJoinName(e.target.value)}
                          disabled={isSubmitting}
                        />

                        <Input
                          placeholder="Email"
                          value={joinEmail}
                          onChange={(e) => setJoinEmail(e.target.value)}
                          disabled={isSubmitting}
                        />

                        <Input
                          placeholder="DUPR (optional)"
                          value={joinDupr}
                          onChange={(e) => setJoinDupr(e.target.value)}
                          disabled={isSubmitting}
                        />

                        <HStack justify="flex-end">
                          <Button
                            variant="outline"
                            onClick={() => setJoinOpen(false)}
                            disabled={isSubmitting}
                            type="button"
                          >
                            Cancel
                          </Button>
                          <Button
                            variant="pickle"
                            type="submit"
                            disabled={!canJoinSubmit}
                          >
                            {isSubmitting ? "Signing up…" : "Sign up"}
                          </Button>
                        </HStack>
                      </Stack>
                    </Card.Body>
                  </Card.Root>
                )}
              </Stack>

              <Box flex="1">
                <img
                  src={heroImg}
                  alt="Pickleball"
                  style={{ borderRadius: 16, width: "100%" }}
                />
              </Box>
            </Flex>
          </Surface>

          <Grid templateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }} gap={5}>
            <ActionTile
              icon={<Users size={18} />}
              title="Players"
              desc="Manage player rosters."
              cta="View Players"
              onClick={() => navigate("/players")}
            />
            <ActionTile
              icon={<CalendarDays size={18} />}
              title="Matches"
              desc="Enter match scores."
              cta="Match Schedule"
              onClick={() => navigate("/matches")}
              disabled={!hasTournamentSelected}
            />
            <ActionTile
              icon={<Trophy size={18} />}
              title="Printable Brackets"
              desc="Print-friendly bracket sheets."
              cta="Printable Brackets"
              onClick={() => navigate("/bracket")}
              disabled={!hasTournamentSelected}
            />
          </Grid>
        </Stack>
      </Container>
    </Box>
  );
}