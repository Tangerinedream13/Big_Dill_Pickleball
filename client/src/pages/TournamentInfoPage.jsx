import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Box,
  Button,
  Container,
  Heading,
  HStack,
  Stack,
  Text,
  IconButton,
  Card,
  Badge,
} from "@chakra-ui/react";
import {
  Home,
  ArrowLeft,
  MapPin,
  CalendarDays,
  Clock,
  Mail,
} from "lucide-react";
import { API_BASE } from "../apiBase";
import usePageTitle from "../hooks/usePageTitle";
import StickyPageHeader from "../components/StickyPageHeader";

function InfoRow({ icon, label, value }) {
  if (!value) return null;

  return (
    <HStack align="start" gap={3}>
      <Box mt="2px">{icon}</Box>
      <Box>
        <Text fontWeight="700" fontSize="sm">
          {label}
        </Text>
        <Text opacity={0.85}>{value}</Text>
      </Box>
    </HStack>
  );
}

export default function TournamentInfoPage() {
  usePageTitle("Tournament Info");

  const navigate = useNavigate();
  const { id } = useParams();

  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [info, setInfo] = useState(null);

  useEffect(() => {
    async function loadInfo() {
      setStatus("loading");
      setError("");

      try {
        const res = await fetch(`${API_BASE}/api/tournaments/${id}/info`);
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data?.error || `HTTP ${res.status}`);
        }

        setInfo(data);
        setStatus("ok");
      } catch (err) {
        console.error(err);
        setError(err?.message || "Could not load tournament info.");
        setStatus("error");
      }
    }

    if (id) loadInfo();
  }, [id]);

  return (
    <Box bg="cream.50" minH="calc(100vh - 64px)" pb={{ base: 10, md: 12 }}>
      <StickyPageHeader>
        <Stack gap={3} w="100%">
          <HStack justify="space-between" align="center" wrap="wrap">
            <HStack gap={3} wrap="wrap">
              <IconButton
                aria-label="Home"
                variant="outline"
                onClick={() => navigate("/")}
              >
                <Home size={18} />
              </IconButton>

              <Heading size="lg" letterSpacing="-0.02em">
                Tournament Info
              </Heading>

              {status === "loading" ? (
                <Badge variant="club">Loading…</Badge>
              ) : null}
              {status === "error" ? <Badge variant="club">Error</Badge> : null}
            </HStack>

            <Button variant="outline" onClick={() => navigate(-1)}>
              <ArrowLeft size={16} style={{ marginRight: 8 }} />
              Back
            </Button>
          </HStack>
        </Stack>
      </StickyPageHeader>

      <Container maxW="4xl" pt={{ base: 8, md: 10 }} px={{ base: 4, md: 6 }}>
        {status === "loading" ? (
          <Text>Loading tournament info…</Text>
        ) : status === "error" ? (
          <Box
            border="1px solid"
            borderColor="red.200"
            bg="red.50"
            p={4}
            borderRadius="xl"
          >
            <Text color="red.700">{error}</Text>
          </Box>
        ) : !info ? (
          <Text>No tournament info found.</Text>
        ) : (
          <Stack gap={6}>
            <Card.Root>
              <Card.Body>
                <Stack gap={4}>
                  <Box>
                    <Heading size="xl">{info.name || "Tournament"}</Heading>
                  </Box>

                  <InfoRow
                    icon={<CalendarDays size={18} />}
                    label="Date"
                    value={info.eventDate}
                  />

                  <InfoRow
                    icon={<Clock size={18} />}
                    label="Time"
                    value={
                      info.startTime && info.endTime
                        ? `${info.startTime} – ${info.endTime}`
                        : info.startTime || info.endTime || ""
                    }
                  />

                  <InfoRow
                    icon={<MapPin size={18} />}
                    label="Location"
                    value={info.locationName}
                  />

                  <InfoRow
                    icon={<MapPin size={18} />}
                    label="Address"
                    value={info.address}
                  />

                  <InfoRow
                    icon={<Mail size={18} />}
                    label="Contact"
                    value={info.contactEmail}
                  />
                </Stack>
              </Card.Body>
            </Card.Root>

            {info.details ? (
              <Card.Root>
                <Card.Body>
                  <Stack gap={2}>
                    <Heading size="md">Tournament Details</Heading>
                    <Text whiteSpace="pre-wrap" opacity={0.9}>
                      {info.details}
                    </Text>
                  </Stack>
                </Card.Body>
              </Card.Root>
            ) : null}

            {info.parkingInfo ? (
              <Card.Root>
                <Card.Body>
                  <Stack gap={2}>
                    <Heading size="md">Parking</Heading>
                    <Text whiteSpace="pre-wrap" opacity={0.9}>
                      {info.parkingInfo}
                    </Text>
                  </Stack>
                </Card.Body>
              </Card.Root>
            ) : null}

            {info.checkInInfo ? (
              <Card.Root>
                <Card.Body>
                  <Stack gap={2}>
                    <Heading size="md">Check-In</Heading>
                    <Text whiteSpace="pre-wrap" opacity={0.9}>
                      {info.checkInInfo}
                    </Text>
                  </Stack>
                </Card.Body>
              </Card.Root>
            ) : null}
          </Stack>
        )}
      </Container>
    </Box>
  );
}
