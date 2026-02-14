import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Badge,
  Box,
  Button,
  Card,
  Container,
  Flex,
  Heading,
  HStack,
  Input,
  Stack,
  Text,
} from "@chakra-ui/react";
import { ArrowLeft, PlusCircle, Trophy } from "lucide-react";
import { setCurrentTournamentId } from "./tournamentStore";
import { API_BASE } from "./apiBase";

function CreateTournament() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [gamesPerTeam, setGamesPerTeam] = useState("4");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const canSubmit = useMemo(
    () => name.trim().length > 0 && status !== "saving",
    [name, status]
  );

  async function handleCreate(e) {
    e?.preventDefault();
    setError("");

    const trimmed = name.trim();
    if (!trimmed) {
      setError("Tournament name is required.");
      setStatus("error");
      return;
    }

    const gptRaw = gamesPerTeam.trim();
    const gptNum = gptRaw === "" ? null : Number(gptRaw);

    if (gptRaw !== "" && !Number.isFinite(gptNum)) {
      setError("Games per team must be a number (or leave blank).");
      setStatus("error");
      return;
    }

    setStatus("saving");

    try {
      const res = await fetch(`${API_BASE}/api/tournaments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          ...(gptNum === null ? {} : { gamesPerTeam: gptNum }),
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}${text ? ` — ${text}` : ""}`);
      }

      // If your POST returns the created tournament, you can set it as current:
      // const created = await res.json().catch(() => null);
      // if (created?.id) setCurrentTournamentId(String(created.id));

      setStatus("ok");
      navigate("/");
    } catch (err) {
      console.error(err);

      const msg = String(err?.message || "").includes("HTTP 404")
        ? "The backend doesn’t have POST /api/tournaments yet. Need to add that route."
        : "Could not create tournament. Check the console and your backend route.";

      setError(msg);
      setStatus("error");
    }
  }

  return (
    <Box bg="cream.50" minH="calc(100vh - 64px) " py={{ base: 8, md: 12 }}>
      <Container maxW="6xl">
        <Stack gap={6}>
          <Flex
            align={{ base: "stretch", md: "center" }}
            justify="space-between"
            direction={{ base: "column", md: "row" }}
            gap={4}
          >
            <Stack gap={1}>
              <HStack gap={3} flexWrap="wrap">
                <Box
                  w="36px"
                  h="36px"
                  borderRadius="12px"
                  bg="club.100"
                  display="grid"
                  placeItems="center"
                  border="1px solid"
                  borderColor="border"
                >
                  <Trophy size={18} />
                </Box>

                <Heading size="lg" letterSpacing="-0.02em">
                  Create Tournament
                </Heading>

                {status === "saving" && <Badge variant="club">Saving…</Badge>}
                {status === "ok" && <Badge variant="pickle">Created</Badge>}
                {status === "error" && (
                  <Badge variant="club">Needs attention</Badge>
                )}
              </HStack>

              <Text opacity={0.85} maxW="70ch">
                Start a new event. Name your tournament and (optionally) set the
                number of round-robin games per team.
              </Text>
            </Stack>

            <HStack gap={2} justify={{ base: "flex-start", md: "flex-end" }}>
              <Button variant="outline" onClick={() => navigate("/")}>
                <HStack gap={2}>
                  <ArrowLeft size={16} />
                  <Text>Back to Landing</Text>
                </HStack>
              </Button>
            </HStack>
          </Flex>

          <Card.Root>
            <Card.Body>
              <Stack gap={5} as="form" onSubmit={handleCreate}>
                {error ? (
                  <Box
                    border="1px solid"
                    borderColor="border"
                    borderRadius="2xl"
                    p={4}
                    bg="white"
                  >
                    <Text fontWeight="700" mb={1}>
                      Couldn’t create tournament
                    </Text>
                    <Text opacity={0.85}>{error}</Text>
                  </Box>
                ) : null}

                <Stack gap={4}>
                  <Stack gap={2}>
                    <Text fontSize="sm" fontWeight="700">
                      Tournament name
                    </Text>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="ex: Big Dill Winter Classic"
                    />
                    <Text fontSize="xs" opacity={0.75}>
                      Create a memorable & fun tournament name.
                    </Text>
                  </Stack>

                  <Stack gap={2}>
                    <Text fontSize="sm" fontWeight="700">
                      Round-robin games per team (optional)
                    </Text>
                    <Input
                      value={gamesPerTeam}
                      onChange={(e) => setGamesPerTeam(e.target.value)}
                      placeholder="ex: 4"
                      inputMode="numeric"
                    />
                    <Text fontSize="xs" opacity={0.75}>
                      In progress.
                    </Text>
                  </Stack>
                </Stack>

                <HStack justify="flex-end" gap={2} pt={2}>
                  <Button variant="outline" onClick={() => navigate("/")}>
                    Cancel
                  </Button>

                  <Button type="submit" variant="pickle" disabled={!canSubmit}>
                    <HStack gap={2}>
                      <PlusCircle size={16} />
                      <Text>Create</Text>
                    </HStack>
                  </Button>
                </HStack>
              </Stack>
            </Card.Body>
          </Card.Root>
        </Stack>
      </Container>
    </Box>
  );
}

export default CreateTournament;