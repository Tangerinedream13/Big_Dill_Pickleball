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
import { Trophy, Users, CalendarDays, Plus, LogIn } from "lucide-react";

import heroImg from "./assets/pickleball-hero.jpg";
import {
  setCurrentTournamentId,
  getCurrentTournamentId,
} from "./tournamentStore";
import { setOptimisticPlayer } from "./optimisticPlayerStore";

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
  const navigate = useNavigate();

  // silent backend ping
  useEffect(() => {
    fetch("/api/message").catch(() => {});
  }, []);

  /* -----------------------------
     Join Tournament state
  ------------------------------ */

  const [joinOpen, setJoinOpen] = useState(false);
  const [tournamentsStatus, setTournamentsStatus] = useState("idle");
  const [tournaments, setTournaments] = useState([]);
  const [tournamentsError, setTournamentsError] = useState("");

  const [joinTournamentId, setJoinTournamentIdState] = useState(
    getCurrentTournamentId() || ""
  );
  const [joinName, setJoinName] = useState("");
  const [joinEmail, setJoinEmail] = useState("");
  const [joinDupr, setJoinDupr] = useState("");
  const [joinStatus, setJoinStatus] = useState("idle");
  const [joinError, setJoinError] = useState("");

  const isSubmitting = joinStatus === "saving";
  const currentTid = joinTournamentId || getCurrentTournamentId();
  const hasTournamentSelected = !!currentTid;

  async function loadTournaments() {
    setTournamentsError("");
    setTournamentsStatus("loading");
    try {
      const res = await fetch("/api/tournaments");
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
    if (joinOpen && tournamentsStatus === "idle") loadTournaments();
  }, [joinOpen, tournamentsStatus]);

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

  const canJoinSubmit =
    joinName.trim() &&
    joinEmail.includes("@") &&
    joinTournamentId &&
    !isSubmitting;

  function setJoinTournamentId(id) {
    const next = String(id || "");
    setJoinTournamentIdState(next);
    if (next) setCurrentTournamentId(next);
  }

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
      const res = await fetch(`/api/tournaments/${joinTournamentId}/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);

      // ✅ OPTIMISTIC PLAYER WRITE (shared store)
      setOptimisticPlayer({
        id: "optimistic",
        name: payload.name,
        email: payload.email,
        duprRating: payload.duprRating || "—",
        _optimistic: true,
      });

      setCurrentTournamentId(joinTournamentId);
      navigate("/players");
    } catch (err) {
      setJoinStatus("error");
      setJoinError(err.message || "Signup failed.");
    }
  }

  /* -----------------------------
     UI
  ------------------------------ */

  return (
    <Box minH="100vh" py={{ base: 10, md: 14 }} bg="cream.50">
      <Container maxW="6xl">
        <Stack gap={10}>
          <Surface p={8}>
            <Flex gap={10} direction={{ base: "column", md: "row" }}>
              <Stack flex="1" gap={4}>
                {/* ✅ Marketing-forward title row (Option B) */}
                <HStack gap={3} align="center" flexWrap="wrap">
                  <Heading>Big Dill Pickleball</Heading>

                  <Box w="1px" h="24px" bg="border" opacity={0.6} mx={2} />
                </HStack>

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
                        {tournamentsStatus === "error" ? (
                          <Text color="red.600">{tournamentsError}</Text>
                        ) : null}

                        {joinError ? (
                          <Text color="red.600">{joinError}</Text>
                        ) : null}

                        <Select.Root
                          collection={tournamentCollection}
                          value={[joinTournamentId]}
                          onValueChange={(d) => setJoinTournamentId(d.value[0])}
                          disabled={isSubmitting}
                        >
                          <Select.Trigger>
                            <Select.ValueText
                              placeholder={
                                tournamentsStatus === "loading"
                                  ? "Loading tournaments…"
                                  : "Select tournament"
                              }
                            />
                          </Select.Trigger>
                          <Select.Content>
                            {tournamentCollection.items.map((opt) => (
                              <Select.Item key={opt.value} item={opt}>
                                {opt.label}
                              </Select.Item>
                            ))}
                          </Select.Content>
                        </Select.Root>

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
              title="Bracket"
              desc="View playoffs."
              cta="View Bracket"
              onClick={() => navigate("/bracket")}
              disabled={!hasTournamentSelected}
            />
          </Grid>
        </Stack>
      </Container>
    </Box>
  );
}
