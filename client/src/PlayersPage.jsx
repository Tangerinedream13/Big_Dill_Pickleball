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

import { consumeOptimisticPlayer } from "./optimisticPlayerStore";

/* -----------------------------
   DUPR helpers
------------------------------ */

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

/* -----------------------------
   Players Page
------------------------------ */

export default function PlayersPage() {
  const navigate = useNavigate();

  const [players, setPlayers] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ok | error
  const [query, setQuery] = useState("");

  // Modal state
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDupr, setNewDupr] = useState("");

  /* -----------------------------
     Load players + optimistic merge
  ------------------------------ */

  async function loadPlayers() {
    try {
      setStatus("loading");

      const res = await fetch("/api/players");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const serverPlayers = Array.isArray(data) ? data : data.players ?? [];

      const optimistic = consumeOptimisticPlayer();
      if (optimistic) {
        setPlayers([
          { ...optimistic, _optimistic: true },
          ...serverPlayers.filter(
            (p) => p.email?.toLowerCase() !== optimistic.email?.toLowerCase()
          ),
        ]);
      } else {
        setPlayers(serverPlayers);
      }

      setStatus("ok");
    } catch (e) {
      console.error(e);
      setStatus("error");
    }
  }

  useEffect(() => {
    loadPlayers();
  }, []);

  /* -----------------------------
     Search (name or DUPR)
  ------------------------------ */

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return players;

    return players.filter((p) => {
      const name = (p.name ?? "").toLowerCase();
      const duprVal = p.duprRating ?? p.dupr_rating ?? p.dupr ?? "";
      return name.includes(q) || String(duprVal).toLowerCase().includes(q);
    });
  }, [players, query]);

  /* -----------------------------
     Create / Delete players
  ------------------------------ */

  async function createPlayer() {
    const name = newName.trim();
    if (!name) return;

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
        body: JSON.stringify({ name, duprRating }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);

      setNewName("");
      setNewDupr("");
      setOpen(false);
      await loadPlayers();
    } catch (e) {
      console.error(e);
      alert(e.message || "Could not create player.");
    }
  }

  async function deletePlayer(id) {
    if (!confirm("Delete this player?")) return;

    try {
      const res = await fetch(`/api/players/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);
      await loadPlayers();
    } catch (e) {
      console.error(e);
      alert(e.message || "Could not delete player.");
    }
  }

  /* -----------------------------
     UI
  ------------------------------ */

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
                <Box
                  w="36px"
                  h="36px"
                  borderRadius="12px"
                  bg="club.100"
                  display="grid"
                  placeItems="center"
                >
                  <UserRound size={18} />
                </Box>

                <Heading size="lg">Players</Heading>

                <Badge variant="pickle">{players.length} total</Badge>
                {status === "loading" && <Badge variant="club">Loading…</Badge>}
              </HStack>

              <Text opacity={0.85}>
                Search by <b>name</b> or <b>DUPR</b>.
              </Text>
            </Stack>

            {/* Right actions */}
            <HStack gap={2} wrap="wrap">
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

              {/* ✅ Back button (right of New Player) */}
              <Button variant="outline" onClick={() => navigate("/")}>
                <HStack gap={2}>
                  <ArrowLeft size={16} />
                  <Text>Back</Text>
                </HStack>
              </Button>
            </HStack>
          </Flex>

          {/* Table */}
          <Box
            bg="white"
            border="1px solid"
            borderColor="border"
            borderRadius="2xl"
          >
            <Box p={5}>
              <Table.Root variant="outline">
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
                    const duprVal =
                      p.duprRating ?? p.dupr_rating ?? p.dupr ?? null;
                    const tier = p.duprTier ?? duprTierFromNumber(duprVal);

                    return (
                      <Table.Row
                        key={p.id ?? p.email ?? p.name}
                        bg={p._optimistic ? "green.50" : undefined}
                      >
                        <Table.Cell fontWeight="600">
                          {p.name}
                          {p._optimistic && (
                            <Badge ml={2} colorScheme="green">
                              Just joined
                            </Badge>
                          )}
                        </Table.Cell>

                        <Table.Cell>
                          <Badge>{formatDupr(duprVal)}</Badge>
                        </Table.Cell>

                        <Table.Cell>
                          <Badge>{tier}</Badge>
                        </Table.Cell>

                        <Table.Cell textAlign="end">
                          {!p._optimistic && (
                            <IconButton
                              aria-label="Delete"
                              variant="outline"
                              onClick={() => deletePlayer(p.id)}
                            >
                              <Trash2 size={16} />
                            </IconButton>
                          )}
                        </Table.Cell>
                      </Table.Row>
                    );
                  })}
                </Table.Body>
              </Table.Root>
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
                      <Input
                        placeholder="Player name"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                      />
                      <Input
                        placeholder="DUPR (optional)"
                        value={newDupr}
                        onChange={(e) => setNewDupr(e.target.value)}
                      />
                    </Stack>
                  </Dialog.Body>

                  <Dialog.Footer>
                    <Button variant="outline" onClick={() => setOpen(false)}>
                      Cancel
                    </Button>
                    <Button variant="pickle" onClick={createPlayer}>
                      Create
                    </Button>
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
