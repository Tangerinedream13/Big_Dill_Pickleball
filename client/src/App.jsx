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
  Grid,
  Card,
  Select,
  createListCollection,
} from "@chakra-ui/react";
import { Trophy, Users, CalendarDays, Plus, LogIn, UserPlus } from "lucide-react";

import heroImg from "./assets/pickleball-hero.jpg";
import { setCurrentTournamentId, getCurrentTournamentId } from "./tournamentStore";

// ✅ IMPORTANT: keep these OUTSIDE App() so they don't remount on every keystroke
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

export default function App() {
  const navigate = useNavigate();

  // Silent backend ping (no UI)
  useEffect(() => {
    fetch("/api/message").catch((e) => console.warn("Backend check failed:", e));
  }, []);

  // ---------------------------
  // Join Tournament UI state
  // ---------------------------
  const [joinOpen, setJoinOpen] = useState(false);
  const [tournamentsStatus, setTournamentsStatus] = useState("idle"); // idle | loading | ok | error
  const [tournaments, setTournaments] = useState([]);
  const [tournamentsError, setTournamentsError] = useState("");

  const [joinTournamentId, setJoinTournamentIdState] = useState(
    getCurrentTournamentId() || ""
  );
  const [joinName, setJoinName] = useState("");
  const [joinEmail, setJoinEmail] = useState("");
  const [joinDupr, setJoinDupr] = useState("");
  const [joinStatus, setJoinStatus] = useState("idle"); // idle | saving | ok | error
  const [joinError, setJoinError] = useState("");

  // Make "selected" reactive to the picker while it's open
  const currentTid = joinTournamentId || getCurrentTournamentId();
  const hasTournamentSelected = !!currentTid;

  async function loadTournaments() {
    setTournamentsError("");
    setTournamentsStatus("loading");
    try {
      const res = await fetch("/api/tournaments");
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setTournaments(Array.isArray(data) ? data : []);
      setTournamentsStatus("ok");
    } catch (e) {
      console.error(e);
      setTournamentsStatus("error");
      setTournamentsError(e?.message || "Could not load tournaments.");
    }
  }

  // when user opens Join panel, fetch tournaments (once)
  useEffect(() => {
    if (joinOpen && tournamentsStatus === "idle") loadTournaments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinOpen]);

  // ✅ Chakra v3 collection-based select
  const tournamentCollection = useMemo(() => {
    const items = (tournaments || []).map((t) => ({
      value: String(t.id),
      label: t.name ?? `Tournament ${t.id}`,
    }));
    return createListCollection({ items });
  }, [tournaments]);

  const canJoinSubmit = useMemo(() => {
    const nameOk = joinName.trim().length > 0;
    const emailOk = joinEmail.trim().includes("@");
    const tidOk = String(joinTournamentId || "").trim().length > 0;
    return nameOk && emailOk && tidOk && joinStatus !== "saving";
  }, [joinName, joinEmail, joinTournamentId, joinStatus]);

  function setJoinTournamentId(id) {
    const next = String(id || "");
    setJoinTournamentIdState(next);
    if (next) setCurrentTournamentId(next); // persist selection
  }

  async function submitJoin(e) {
    e?.preventDefault();
    setJoinError("");
    setJoinStatus("saving");

    const tid = String(joinTournamentId || "").trim();
    const name = joinName.trim();
    const email = joinEmail.trim().toLowerCase();
    const duprRating = joinDupr.trim(); // keep as string

    try {
      if (!tid) throw new Error("Please pick a tournament.");
      if (!name) throw new Error("Name is required.");
      if (!email || !email.includes("@")) throw new Error("Valid email is required.");

      const res = await fetch(`/api/tournaments/${tid}/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, duprRating }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      setCurrentTournamentId(tid);
      setJoinStatus("ok");
      navigate("/players");
    } catch (err) {
      console.error(err);
      setJoinStatus("error");
      setJoinError(err?.message || "Signup failed.");
    }
  }

  return (
    <Box
      minH="100vh"
      py={{ base: 10, md: 14 }}
      bg="cream.50"
      backgroundImage="radial-gradient(900px 400px at 70% 10%, rgba(183,243,74,0.14), transparent 60%)"
    >
      <Container maxW="6xl">
        <Stack gap={{ base: 8, md: 10 }}>
          {/* HERO SURFACE */}
          <Surface p={{ base: 6, md: 8 }}>
            <Flex
              gap={{ base: 8, md: 10 }}
              direction={{ base: "column", md: "row" }}
              align="stretch"
            >
              {/* LEFT */}
              <Stack flex="1" gap={4} justify="center">
                <HStack gap={3} align="center" flexWrap="wrap">
                  <Box
                    w="10px"
                    h="10px"
                    borderRadius="full"
                    bg="pickle.500"
                    boxShadow="0 0 0 4px rgba(183,243,74,0.25)"
                  />
                  <Heading size="lg" letterSpacing="-0.02em" color="club.900">
                    Big Dill Pickleball
                  </Heading>

                  {hasTournamentSelected ? (
                    <Badge variant="pickle">Tournament selected</Badge>
                  ) : (
                    <Badge variant="club">No tournament selected</Badge>
                  )}
                </HStack>

                <Text fontSize={{ base: "md", md: "lg" }} opacity={0.9} maxW="60ch">
                  Tournament management for pickleball — round robin, playoffs,
                  brackets, standings, and score entry.
                </Text>

                {/* Primary options: Join / Create */}
                <HStack gap={3} flexWrap="wrap" pt={2}>
                  <Button
                    type="button"
                    bg="club.900"
                    color="white"
                    _hover={{ bg: "club.800" }}
                    onClick={() => setJoinOpen((v) => !v)}
                  >
                    <HStack gap={2}>
                      <LogIn size={18} />
                      <span>{joinOpen ? "Close Join" : "Join a Tournament"}</span>
                    </HStack>
                  </Button>

                  <Button
                    type="button"
                    variant="pickle"
                    onClick={() => navigate("/tournaments/new")}
                  >
                    <HStack gap={2}>
                      <Plus size={18} />
                      <span>Create a Tournament</span>
                    </HStack>
                  </Button>
                </HStack>

                {/* Join panel */}
                {joinOpen ? (
                  <Card.Root mt={3}>
                    <Card.Body>
                      <Stack gap={4} as="form" onSubmit={submitJoin}>
                        <HStack justify="space-between" flexWrap="wrap">
                          <HStack gap={2}>
                            <UserPlus size={18} />
                            <Text fontWeight="800">Join Tournament</Text>
                            {joinStatus === "saving" ? (
                              <Badge variant="club">Signing up…</Badge>
                            ) : null}
                            {joinStatus === "error" ? (
                              <Badge variant="club">Needs attention</Badge>
                            ) : null}
                          </HStack>

                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={loadTournaments}
                            disabled={tournamentsStatus === "loading"}
                          >
                            Refresh tournaments
                          </Button>
                        </HStack>

                        {tournamentsStatus === "error" ? (
                          <Box border="1px solid" borderColor="border" p={3} borderRadius="xl">
                            <Text fontWeight="700" mb={1}>
                              Couldn’t load tournaments
                            </Text>
                            <Text opacity={0.85}>{tournamentsError}</Text>
                          </Box>
                        ) : null}

                        {joinError ? (
                          <Box border="1px solid" borderColor="border" p={3} borderRadius="xl">
                            <Text fontWeight="700" mb={1}>
                              Couldn’t sign you up
                            </Text>
                            <Text opacity={0.85}>{joinError}</Text>
                          </Box>
                        ) : null}

                        {/* Tournament select */}
                        <Stack gap={2}>
                          <Text fontSize="sm" fontWeight="700">
                            Tournament
                          </Text>

                          <Select.Root
                            collection={tournamentCollection}
                            value={joinTournamentId ? [joinTournamentId] : []}
                            onValueChange={(details) =>
                              setJoinTournamentId(details.value?.[0] ?? "")
                            }
                          >
                            <Select.Trigger maxW={{ base: "100%", md: "420px" }}>
                              <Select.ValueText
                                placeholder={
                                  tournamentsStatus === "loading"
                                    ? "Loading tournaments…"
                                    : "Select a tournament"
                                }
                              />
                            </Select.Trigger>

                            <Select.Content>
                              {tournamentCollection.items.length === 0 ? (
                                <Select.Item
                                  item={{
                                    value: "__none__",
                                    label: "No tournaments found",
                                  }}
                                  disabled
                                >
                                  No tournaments found
                                </Select.Item>
                              ) : (
                                tournamentCollection.items.map((opt) => (
                                  <Select.Item key={opt.value} item={opt}>
                                    {opt.label} (ID: {opt.value})
                                  </Select.Item>
                                ))
                              )}
                            </Select.Content>
                          </Select.Root>

                          <Text fontSize="xs" opacity={0.75}>
                            Tip: if you created multiple “Winter Classic” entries while testing,
                            pick the latest ID from the dropdown.
                          </Text>
                        </Stack>

                        {/* Fields */}
                        <Grid
                          templateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }}
                          gap={3}
                        >
                          <Stack gap={2}>
                            <Text fontSize="sm" fontWeight="700">
                              Your name
                            </Text>
                            <Input
                              value={joinName}
                              onChange={(e) => setJoinName(e.target.value)}
                              placeholder="ex: Maria Haddon"
                            />
                          </Stack>

                          <Stack gap={2}>
                            <Text fontSize="sm" fontWeight="700">
                              Email
                            </Text>
                            <Input
                              value={joinEmail}
                              onChange={(e) => setJoinEmail(e.target.value)}
                              placeholder="ex: maria@email.com"
                              inputMode="email"
                            />
                          </Stack>

                          <Stack gap={2}>
                            <Text fontSize="sm" fontWeight="700">
                              DUPR (optional)
                            </Text>
                            <Input
                              value={joinDupr}
                              onChange={(e) => setJoinDupr(e.target.value)}
                              placeholder="ex: 3.5"
                              inputMode="decimal"
                            />
                          </Stack>
                        </Grid>

                        <HStack justify="flex-end" gap={2}>
                          <Button type="button" variant="outline" onClick={() => setJoinOpen(false)}>
                            Cancel
                          </Button>

                          <Button variant="pickle" type="submit" disabled={!canJoinSubmit}>
                            Sign up
                          </Button>
                        </HStack>
                      </Stack>
                    </Card.Body>
                  </Card.Root>
                ) : null}
              </Stack>

              {/* RIGHT IMAGE */}
              <Box
                flex="1"
                borderRadius="2xl"
                overflow="hidden"
                border="1px solid"
                borderColor="border"
                boxShadow="lift"
                minH={{ base: "240px", md: "420px" }}
                position="relative"
              >
                <Box as="img" src={heroImg} alt="Pickleball club courts" w="100%" h="100%" objectFit="cover" />
                <Box
                  position="absolute"
                  inset="0"
                  bg="linear-gradient(135deg, rgba(11,46,29,0.20), rgba(183,243,74,0.08))"
                />
                <Box position="absolute" bottom="14px" left="14px">
                  <Badge
                    bg="rgba(255,255,255,0.9)"
                    color="club.900"
                    borderRadius="full"
                    px={3}
                    py={1}
                    fontWeight="800"
                  >
                    Organizer Mode
                  </Badge>
                </Box>
              </Box>
            </Flex>
          </Surface>

          {/* QUICK ACTIONS SECTION */}
          <Stack gap={3}>
            <Heading size="md" color="club.900">
              Quick Actions
            </Heading>

            <Grid templateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }} gap={5}>
              <ActionTile
                icon={<Users size={18} />}
                title="Players"
                desc="Add and manage player rosters."
                cta="View Players"
                onClick={() => navigate("/players")}
              />
              <ActionTile
                icon={<CalendarDays size={18} />}
                title="Match Schedule"
                desc="Enter scores and track matches."
                cta="Open Schedule"
                onClick={() => navigate("/matches")}
                disabled={!hasTournamentSelected}
              />
              <ActionTile
                icon={<Trophy size={18} />}
                title="Bracket"
                desc="Generate and view playoffs and standings."
                cta="Go to Bracket"
                onClick={() => navigate("/bracket")}
                disabled={!hasTournamentSelected}
              />
            </Grid>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}