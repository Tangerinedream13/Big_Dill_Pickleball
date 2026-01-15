import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Badge,
  Box,
  Button,
  Container,
  Flex,
  Heading,
  HStack,
  Stack,
  Text,
  Grid,
  Select,
} from "@chakra-ui/react";
import { Trophy, Users, CalendarDays, Plus } from "lucide-react";

import heroImg from "./assets/pickleball-hero.jpg"; // make sure this exists
import {
  getCurrentTournamentId,
  setCurrentTournamentId,
} from "./tournamentStore";

export default function App() {
  const navigate = useNavigate();

  // tournaments + active selection
  const [tournaments, setTournaments] = useState([]);
  const [activeId, setActiveId] = useState(getCurrentTournamentId());
  const [tournamentsStatus, setTournamentsStatus] = useState("loading"); // loading | ok | error

  // Silent backend ping (no UI)
  useEffect(() => {
    fetch("/api/message").catch((e) => console.warn("Backend check failed:", e));
  }, []);

  // Load tournaments for picker
  useEffect(() => {
    let cancelled = false;

    async function loadTournaments() {
      try {
        setTournamentsStatus("loading");
        const res = await fetch("/api/tournaments");
        const data = await res.json().catch(() => []);
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

        if (cancelled) return;

        setTournaments(Array.isArray(data) ? data : []);
        setTournamentsStatus("ok");

        // If nothing selected yet, default to the newest (first item in your API order)
        const current = getCurrentTournamentId();
        if (!current && Array.isArray(data) && data.length > 0) {
          const newestId = String(data[0].id);
          setActiveId(newestId);
          setCurrentTournamentId(newestId);
        } else {
          setActiveId(current);
        }
      } catch (e) {
        if (cancelled) return;
        console.error("Failed to load tournaments:", e);
        setTournamentsStatus("error");
      }
    }

    loadTournaments();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasTournamentSelected = !!activeId;

  const Surface = ({ children, ...props }) => (
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

  const ActionTile = ({ icon, title, desc, cta, onClick, disabled }) => (
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
        disabled={disabled}
      >
        {cta}
      </Button>
    </Surface>
  );

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

                  <Badge
                    bg="club.100"
                    color="club.900"
                    borderRadius="full"
                    px={3}
                    py={1}
                    fontWeight="800"
                  >
                    {tournamentsStatus === "loading"
                      ? "Loading tournaments…"
                      : tournamentsStatus === "error"
                      ? "Tournaments unavailable"
                      : hasTournamentSelected
                      ? `Tournament #${activeId}`
                      : "Select a tournament"}
                  </Badge>
                </HStack>

                <Text
                  fontSize={{ base: "md", md: "lg" }}
                  opacity={0.9}
                  maxW="60ch"
                >
                  Tournament management for pickleball - round robin, playoffs,
                  brackets, standings, and score entry.
                </Text>

                {/* Tournament Picker */}
                <Stack gap={2} maxW="380px">
                  <Text fontSize="sm" fontWeight="800" color="club.900">
                    Active Tournament
                  </Text>

                  <Select.Root
                    value={activeId ? [String(activeId)] : []}
                    onValueChange={(details) => {
                      const id = details.value?.[0] ?? "";
                      setActiveId(id);
                      if (id) setCurrentTournamentId(id);
                    }}
                    disabled={tournamentsStatus !== "ok"}
                    size="md"
                  >
                    <Select.Trigger>
                      <Select.ValueText placeholder="Select tournament…" />
                    </Select.Trigger>

                    <Select.Content>
                      {tournaments.map((t) => (
                        <Select.Item
                          key={String(t.id)}
                          item={{ value: String(t.id) }}
                        >
                          {t.name}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Root>

                  {!hasTournamentSelected ? (
                    <Text fontSize="xs" opacity={0.75}>
                      Select a tournament to view brackets and match schedule.
                    </Text>
                  ) : null}
                </Stack>

                {/* Primary actions */}
                <HStack gap={3} flexWrap="wrap" pt={2}>
                  <Button
                    variant="pickle"
                    onClick={() => navigate("/tournaments/new")}
                  >
                    <HStack gap={2}>
                      <Plus size={18} />
                      <span>New Tournament</span>
                    </HStack>
                  </Button>

                  <Button
                    bg="club.900"
                    color="white"
                    _hover={{ bg: "club.800" }}
                    onClick={() => navigate("/bracket")}
                    disabled={!hasTournamentSelected}
                  >
                    <HStack gap={2}>
                      <Trophy size={18} />
                      <span>View Bracket</span>
                    </HStack>
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => navigate("/matches")}
                    disabled={!hasTournamentSelected}
                  >
                    <HStack gap={2}>
                      <CalendarDays size={18} />
                      <span>Match Schedule</span>
                    </HStack>
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => navigate("/players")}
                  >
                    <HStack gap={2}>
                      <Users size={18} />
                      <span>Players</span>
                    </HStack>
                  </Button>
                </HStack>
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
                <Box
                  as="img"
                  src={heroImg}
                  alt="Pickleball club courts"
                  w="100%"
                  h="100%"
                  objectFit="cover"
                />
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

            <Grid
              templateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }}
              gap={5}
            >
              <ActionTile
                icon={<Users size={18} />}
                title="Players"
                desc="Add and manage player rosters."
                cta="View Players"
                onClick={() => navigate("/players")}
                disabled={false}
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