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
} from "@chakra-ui/react";
import { Trophy, Users, CalendarDays, Plus, Activity } from "lucide-react";

import heroImg from "./assets/pickleball-hero.jpg"; // make sure this exists

export default function App() {
  const [message, setMessage] = useState("Loading...");
  const [status, setStatus] = useState("loading"); // loading | ok | error
  const navigate = useNavigate();

  useEffect(() => {
    fetch("/api/message")
      .then((res) => res.json())
      .then((data) => {
        setMessage(data.text ?? "Connected");
        setStatus("ok");
      })
      .catch(() => {
        setMessage("Error connecting to backend");
        setStatus("error");
      });
  }, []);

  const statusBadge =
    status === "ok"
      ? { label: "Connected", bg: "pickle.200", color: "club.900" }
      : status === "error"
      ? { label: "Backend Offline", bg: "club.100", color: "club.900" }
      : { label: "Checking…", bg: "club.100", color: "club.900" };

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

  const ActionTile = ({ icon, title, desc, cta, onClick }) => (
    <Surface p={5}>
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

      <Button w="full" variant="outline" onClick={onClick}>
        {cta}
      </Button>
    </Surface>
  );

  return (
    <Box
      minH="100vh"
      py={{ base: 10, md: 14 }}
      bg="cream.50"
      /* subtle club tint */
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
                    px={3}
                    py={1}
                    borderRadius="full"
                    bg={statusBadge.bg}
                    color={statusBadge.color}
                    fontWeight="800"
                  >
                    {statusBadge.label}
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

                  {/* Make sure text is visible even if theme is odd */}
                  <Button
                    bg="club.900"
                    color="white"
                    _hover={{ bg: "club.800" }}
                    onClick={() => navigate("/bracket")}
                  >
                    <HStack gap={2}>
                      <Trophy size={18} />
                      <span>View Bracket</span>
                    </HStack>
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => navigate("/matches")}
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

                {/* System status */}
                <Box mt={2}>
                  <Surface p={4} bg="white">
                    <HStack gap={2} mb={1}>
                      <Activity size={18} />
                      <Text fontWeight="800" color="club.900">
                        System Status
                      </Text>
                    </HStack>
                    <Text fontSize="sm" opacity={0.85}>
                      {message}
                    </Text>
                  </Surface>
                </Box>
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
                    bg="rgba(255,255,255,0.90)"
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

          {/* QUICK ACTIONS SECTION (adds “layout rhythm”) */}
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
              />
              <ActionTile
                icon={<CalendarDays size={18} />}
                title="Match Schedule"
                desc="Enter scores and track matches."
                cta="Open Schedule"
                onClick={() => navigate("/matches")}
              />
              <ActionTile
                icon={<Trophy size={18} />}
                title="Bracket"
                desc="Generate and view playoffs and standings."
                cta="Go to Bracket"
                onClick={() => navigate("/bracket")}
              />
            </Grid>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}
