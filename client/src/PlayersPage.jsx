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
  IconButton,
  Dialog,
  Portal,
  Table,
} from "@chakra-ui/react";
import { Plus, Search, Trash2, UserRound, ArrowLeft } from "lucide-react";

// If backend already returns duprTier, we’ll use it.
// But keep a fallback just in case.
function duprTierFromNumber(dupr) {
  const n = Number(dupr);
  if (!Number.isFinite(n)) return "Unrated";
  if (n >= 5.0) return "Elite (5.0+)";
  if (n >= 4.0) return "Advanced (4.0–4.99)";
  if (n >= 3.0) return "Intermediate (3.0–3.99)";
  if (n >= 2.0) return "Beginner (2.0–2.99)";
  return "< 2.0";
}

function formatDupr(dupr) {
  if (dupr === null || dupr === undefined || dupr === "") return "—";
  const n = Number(dupr);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(2);
}

export default function PlayersPage() {
  const navigate = useNavigate();

  const [players, setPlayers] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ok | error
  const [query, setQuery] = useState("");

  // Modal state
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDupr, setNewDupr] = useState(""); // string for the input

  async function loadPlayers() {
    try {
      setStatus("loading");
      const res = await fetch("/api/players");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPlayers(Array.isArray(data) ? data : data.players ?? []);
      setStatus("ok");
    } catch (e) {
      console.error(e);
      setStatus("error");
    }
  }

  useEffect(() => {
    loadPlayers();
  }, []);

  // Search ONLY by name or DUPR (no email, no level)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return players;

    return players.filter((p) => {
      const name = (p.name ?? "").toLowerCase();

      // backend returns duprRating; but allow fallback if older data uses dupr_rating/dupr
      const duprVal =
        p.duprRating ?? p.dupr_rating ?? p.dupr ?? null;

      const duprStr =
        duprVal === null || duprVal === undefined ? "" : String(duprVal).toLowerCase();

      return name.includes(q) || duprStr.includes(q);
    });
  }, [players, query]);

  async function createPlayer() {
    const name = newName.trim();
    if (!name) return;

    // Allow blank DUPR (optional)
    let duprRating = null;
    if (newDupr.trim() !== "") {
      const n = Number(newDupr);
      if (!Number.isFinite(n)) {
        alert("DUPR must be a number (ex: 3.25).");
        return;
      }
      duprRating = Math.round(n * 100) / 100;
    }

    try {
      const res = await fetch("/api/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // ✅ match backend: { name, duprRating }
        body: JSON.stringify({ name, duprRating }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      setNewName("");
      setNewDupr("");
      setOpen(false);
      await loadPlayers();
    } catch (e) {
      console.error(e);
      alert(e.message || "Could not create player. Check console + API route.");
    }
  }

  async function deletePlayer(id) {
    if (!confirm("Delete this player?")) return;

    try {
      const res = await fetch(`/api/players/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      await loadPlayers();
    } catch (e) {
      console.error(e);
      alert(e.message || "Could not delete player. Check console + API route.");
    }
  }

  return (
    <Box bg="cream.50" minH="calc(100vh - 64px)" py={{ base: 8, md: 12 }}>
      <Container maxW="6xl">
        <Stack gap={6}>
          {/* Header */}
          <Flex
            align={{ base: "stretch", md: "center" }}
            justify="space-between"
            direction={{ base: "column", md: "row" }}
            gap={4}
          >
            <Stack gap={2}>
              <HStack gap={3} wrap="wrap">
                <Button
                  variant="outline"
                  onClick={() => navigate("/")}
                >
                  <HStack gap={2}>
                    <ArrowLeft size={16} />
                    <Text>Back to Landing</Text>
                  </HStack>
                </Button>

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
                  <UserRound size={18} />
                </Box>

                <Heading size="lg" letterSpacing="-0.02em">
                  Players
                </Heading>

                <Badge variant="pickle">{players.length} total</Badge>

                {status === "loading" && <Badge variant="club">Loading…</Badge>}
                {status === "error" && <Badge variant="club">Backend issue</Badge>}
              </HStack>

              <Text opacity={0.85} maxW="75ch">
                Manage your player roster. Search by <b>name</b> or <b>DUPR</b>.
                DUPR tiers: Beginner (2.0–2.99), Intermediate (3.0–3.99), Advanced
                (4.0–4.99), Elite (5.0+).
              </Text>
            </Stack>

            <HStack gap={2} justify={{ base: "flex-start", md: "flex-end" }}>
              <Box position="relative" w={{ base: "100%", md: "320px" }}>
                <Box
                  position="absolute"
                  left="12px"
                  top="50%"
                  transform="translateY(-50%)"
                  opacity={0.7}
                >
                  <Search size={16} />
                </Box>
                <Input
                  pl="38px"
                  placeholder="Search name or DUPR…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </Box>

              <Button variant="pickle" onClick={() => setOpen(true)}>
                <HStack gap={2}>
                  <Plus size={16} />
                  <Text>New Player</Text>
                </HStack>
              </Button>
            </HStack>
          </Flex>

          {/* Main panel (NO Card.Root to avoid white screen) */}
          <Box
            bg="white"
            border="1px solid"
            borderColor="border"
            borderRadius="2xl"
            boxShadow="soft"
            overflow="hidden"
          >
            <Box p={{ base: 4, md: 5 }}>
              {filtered.length === 0 ? (
                <Box
                  border="1px dashed"
                  borderColor="border"
                  borderRadius="2xl"
                  p={{ base: 6, md: 10 }}
                  textAlign="center"
                  bg="cream.50"
                >
                  <Heading size="md" mb={2}>
                    No players found
                  </Heading>
                  <Text opacity={0.8} mb={5}>
                    Try a different search, or add your first player.
                  </Text>
                  <Button variant="pickle" onClick={() => setOpen(true)}>
                    Add Player
                  </Button>
                </Box>
              ) : (
                <Box overflowX="auto">
                  <Table.Root size="md" variant="outline">
                    <Table.Header>
                      <Table.Row>
                        <Table.ColumnHeader>Name</Table.ColumnHeader>
                        <Table.ColumnHeader>DUPR</Table.ColumnHeader>
                        <Table.ColumnHeader>Tier</Table.ColumnHeader>
                        <Table.ColumnHeader textAlign="end">
                          Actions
                        </Table.ColumnHeader>
                      </Table.Row>
                    </Table.Header>

                    <Table.Body>
                      {filtered.map((p) => {
                        const duprVal = p.duprRating ?? p.dupr_rating ?? p.dupr ?? null;
                        const tier = p.duprTier ?? duprTierFromNumber(duprVal);

                        return (
                          <Table.Row key={p.id ?? p.name}>
                            <Table.Cell fontWeight="600">
                              {p.name ?? "Unnamed"}
                            </Table.Cell>

                            <Table.Cell>
                              <Badge variant="club">{formatDupr(duprVal)}</Badge>
                            </Table.Cell>

                            <Table.Cell>
                              <Badge variant="club">{tier}</Badge>
                            </Table.Cell>

                            <Table.Cell textAlign="end">
                              <IconButton
                                aria-label="Delete player"
                                variant="outline"
                                onClick={() => deletePlayer(p.id)}
                              >
                                <Trash2 size={16} />
                              </IconButton>
                            </Table.Cell>
                          </Table.Row>
                        );
                      })}
                    </Table.Body>
                  </Table.Root>
                </Box>
              )}
            </Box>
          </Box>

          {/* Modal */}
          <Dialog.Root open={open} onOpenChange={(e) => setOpen(e.open)}>
            <Portal>
              <Dialog.Backdrop />
              <Dialog.Positioner>
                <Dialog.Content>
                  <Dialog.Header>
                    <Dialog.Title>Add Player</Dialog.Title>
                  </Dialog.Header>

                  <Dialog.Body>
                    <Stack gap={3}>
                      <Text opacity={0.8}>
                        Add a new player to your roster.
                      </Text>

                      <Stack gap={2}>
                        <Text fontSize="sm" fontWeight="600">
                          Player name
                        </Text>
                        <Input
                          placeholder="ex: John Smith"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                        />
                      </Stack>

                      <Stack gap={2}>
                        <HStack justify="space-between" wrap="wrap">
                          <Text fontSize="sm" fontWeight="600">
                            DUPR rating
                          </Text>
                          <Text fontSize="xs" opacity={0.75}>
                            Beginner 2.0–2.99 • Intermediate 3.0–3.99 • Advanced
                            4.0–4.99 • Elite 5.0+
                          </Text>
                        </HStack>

                        <Input
                          placeholder="ex: 3.25 (optional)"
                          inputMode="decimal"
                          value={newDupr}
                          onChange={(e) => setNewDupr(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") createPlayer();
                          }}
                        />
                      </Stack>
                    </Stack>
                  </Dialog.Body>

                  <Dialog.Footer>
                    <HStack gap={2}>
                      <Button variant="outline" onClick={() => setOpen(false)}>
                        Cancel
                      </Button>
                      <Button variant="pickle" onClick={createPlayer}>
                        Create
                      </Button>
                    </HStack>
                  </Dialog.Footer>
                </Dialog.Content>
              </Dialog.Positioner>
            </Portal>
          </Dialog.Root>
        </Stack>
      </Container>
    </Box>
  );
}