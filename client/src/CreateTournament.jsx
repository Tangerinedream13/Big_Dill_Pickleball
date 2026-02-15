// client/src/CreateTournament.jsx
import { useEffect, useMemo, useState } from "react";
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
  IconButton,
  Input,
  Stack,
  Text,
  Dialog,
  Portal,
} from "@chakra-ui/react";
import { PlusCircle, Trophy, Trash2, Pencil, Home } from "lucide-react";
import {
  getCurrentTournamentId,
  setCurrentTournamentId,
} from "./tournamentStore";
import { API_BASE } from "./apiBase";
import StickyPageHeader from "./components/StickyPageHeader";
import usePageTitle from "./hooks/usePageTitle";

function CreateTournament() {
  const navigate = useNavigate();
  usePageTitle("Create Tournament");

  const [name, setName] = useState("");
  const [gamesPerTeam, setGamesPerTeam] = useState("4");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const [currentTid, setCurrentTid] = useState(getCurrentTournamentId());

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "currentTournamentId") {
        setCurrentTid(getCurrentTournamentId());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // existing tournaments list
  const [listStatus, setListStatus] = useState("idle"); // idle | loading | ok | error
  const [listError, setListError] = useState("");
  const [tournaments, setTournaments] = useState([]);

  // rename modal
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameId, setRenameId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameStatus, setRenameStatus] = useState("idle"); // idle | saving | error
  const [renameError, setRenameError] = useState("");

  // delete modal (safe confirm)
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [deleteName, setDeleteName] = useState("");
  const [deleteTyped, setDeleteTyped] = useState("");
  const [deleteStatus, setDeleteStatus] = useState("idle"); // idle | deleting | error
  const [deleteError, setDeleteError] = useState("");

  const canSubmit = useMemo(
    () => name.trim().length > 0 && status !== "saving",
    [name, status]
  );

  async function loadTournaments() {
    setListError("");
    setListStatus("loading");
    try {
      const res = await fetch(`${API_BASE}/api/tournaments`);
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      const normalized = (Array.isArray(data) ? data : [])
        .map((t) => ({
          id: String(t.id ?? ""),
          name: String(t.name ?? ""),
          players: typeof t.players === "number" ? t.players : undefined,
          teams: typeof t.teams === "number" ? t.teams : undefined,
          matches: typeof t.matches === "number" ? t.matches : undefined,
        }))
        .filter((t) => t.id);

      setTournaments(normalized);
      setListStatus("ok");
    } catch (e) {
      console.error(e);
      setListStatus("error");
      setListError(e.message || "Could not load tournaments.");
    }
  }

  useEffect(() => {
    loadTournaments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      const created = await res.json().catch(() => null);
      if (created?.id) {
        const newId = String(created.id);
        setCurrentTournamentId(newId);
        setCurrentTid(newId);
      }

      setName("");
      setGamesPerTeam("4");
      setStatus("ok");

      await loadTournaments();
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

  function openRename(t) {
    setRenameError("");
    setRenameStatus("idle");
    setRenameId(t?.id ?? null);
    setRenameValue(t?.name ?? "");
    setRenameOpen(true);
  }

  async function saveRename() {
    setRenameError("");

    const id = renameId;
    const newName = renameValue.trim();
    if (!id) return;

    if (!newName) {
      setRenameError("Tournament name is required.");
      setRenameStatus("error");
      return;
    }

    setRenameStatus("saving");
    try {
      const res = await fetch(`${API_BASE}/api/tournaments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data?.error ||
            `Rename failed (HTTP ${res.status}). Add PATCH /api/tournaments/:id on backend.`
        );
      }

      setRenameOpen(false);
      setRenameStatus("idle");
      await loadTournaments();
    } catch (e) {
      console.error(e);
      setRenameStatus("error");
      setRenameError(e.message || "Could not rename tournament.");
    }
  }

  function openDelete(t) {
    setDeleteError("");
    setDeleteStatus("idle");
    setDeleteId(t?.id ?? null);
    setDeleteName(t?.name ?? "");
    setDeleteTyped("");
    setDeleteOpen(true);
  }

  const canConfirmDelete =
    deleteTyped.trim().toLowerCase() === deleteName.trim().toLowerCase() &&
    deleteStatus !== "deleting";

  async function confirmDelete() {
    setDeleteError("");

    const id = deleteId;
    if (!id) return;

    if (String(currentTid ?? "") === String(id)) {
      setDeleteError(
        "You can’t delete the currently selected tournament. Switch tournaments first."
      );
      setDeleteStatus("error");
      return;
    }

    if (!canConfirmDelete) {
      setDeleteError("Type the tournament name exactly to confirm.");
      setDeleteStatus("error");
      return;
    }

    setDeleteStatus("deleting");
    try {
      const res = await fetch(`${API_BASE}/api/tournaments/${id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      setDeleteOpen(false);
      setDeleteStatus("idle");
      await loadTournaments();
    } catch (e) {
      console.error(e);
      setDeleteStatus("error");
      setDeleteError(e.message || "Could not delete tournament.");
    }
  }

  return (
    <Box bg="cream.50" minH="calc(100vh - 64px)" pb={{ base: 10, md: 12 }}>
      {/* Sticky cream header to match other pages */}
      <StickyPageHeader>
        <Stack gap={3} w="100%">
          <Flex
            align={{ base: "stretch", md: "center" }}
            justify="space-between"
            direction={{ base: "column", md: "row" }}
            gap={3}
          >
            <HStack gap={3} wrap="wrap" align="center">
              <IconButton
                aria-label="Home"
                variant="outline"
                size="md"
                onClick={() => navigate("/")}
              >
                <Home size={18} />
              </IconButton>

              <Trophy size={18} />

              <Heading size="lg" letterSpacing="-0.02em">
                Manage Tournaments
              </Heading>

              {status === "saving" && <Badge variant="club">Saving…</Badge>}
              {status === "ok" && <Badge variant="pickle">Created</Badge>}
              {status === "error" && (
                <Badge variant="club">Needs attention</Badge>
              )}
            </HStack>

            {/* keep empty to mirror other sticky headers spacing */}
            <Box />
          </Flex>

          <Text opacity={0.85}>
            Create a new tournament, or manage existing ones below. Deleting
            requires typing the name to confirm.
          </Text>
        </Stack>
      </StickyPageHeader>

      <Container maxW="6xl" pt={{ base: 8, md: 10 }}>
        <Stack gap={6}>
          {/* Create form */}
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
                      Controls how many round-robin matches each team will play.
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

          {/* Existing tournaments list */}
          <Card.Root>
            <Card.Body>
              <Flex
                justify="space-between"
                align="center"
                mb={3}
                wrap="wrap"
                gap={2}
              >
                <Heading size="sm">Existing tournaments</Heading>
                <HStack gap={2}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadTournaments}
                    disabled={listStatus === "loading"}
                  >
                    {listStatus === "loading" ? "Refreshing…" : "Refresh"}
                  </Button>
                </HStack>
              </Flex>

              {listError ? (
                <Box
                  border="1px solid"
                  borderColor="red.200"
                  bg="red.50"
                  p={3}
                  borderRadius="lg"
                  mb={3}
                >
                  <Text color="red.700" fontSize="sm">
                    {listError}
                  </Text>
                </Box>
              ) : null}

              {tournaments.length === 0 ? (
                <Box
                  border="1px dashed"
                  borderColor="border"
                  borderRadius="2xl"
                  p={{ base: 6, md: 10 }}
                  textAlign="center"
                  bg="white"
                >
                  <Heading size="sm" mb={2}>
                    No tournaments yet
                  </Heading>
                  <Text opacity={0.8}>Create your first tournament above.</Text>
                </Box>
              ) : (
                <Stack gap={3}>
                  {tournaments.map((t) => {
                    const isCurrent = String(currentTid ?? "") === String(t.id);
                    const hasCounts =
                      typeof t.players === "number" ||
                      typeof t.teams === "number" ||
                      typeof t.matches === "number";

                    return (
                      <Box
                        key={t.id}
                        bg="white"
                        border="1px solid"
                        borderColor="border"
                        borderRadius="2xl"
                        p={{ base: 4, md: 5 }}
                      >
                        <Flex
                          justify="space-between"
                          align={{ base: "stretch", md: "center" }}
                          direction={{ base: "column", md: "row" }}
                          gap={3}
                        >
                          <Stack gap={1}>
                            <HStack gap={2} wrap="wrap">
                              <Text fontWeight="800">{t.name}</Text>
                              {isCurrent ? (
                                <Badge variant="pickle">Current</Badge>
                              ) : null}
                            </HStack>
                            {hasCounts ? (
                              <Text fontSize="sm" opacity={0.75}>
                                {typeof t.players === "number"
                                  ? `${t.players} players`
                                  : null}
                                {typeof t.teams === "number"
                                  ? ` • ${t.teams} teams`
                                  : null}
                                {typeof t.matches === "number"
                                  ? ` • ${t.matches} matches`
                                  : null}
                              </Text>
                            ) : null}
                          </Stack>

                          <HStack
                            gap={2}
                            wrap="wrap"
                            justify={{ base: "flex-start", md: "flex-end" }}
                          >
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const id = String(t.id);
                                setCurrentTournamentId(id);
                                setCurrentTid(id);
                                navigate("/");
                              }}
                              disabled={isCurrent}
                            >
                              Set Current
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openRename(t)}
                            >
                              <HStack gap={2}>
                                <Pencil size={16} />
                                <Text>Rename</Text>
                              </HStack>
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openDelete(t)}
                              disabled={isCurrent}
                            >
                              <HStack gap={2}>
                                <Trash2 size={16} />
                                <Text>Delete</Text>
                              </HStack>
                            </Button>
                          </HStack>
                        </Flex>
                      </Box>
                    );
                  })}
                </Stack>
              )}
            </Card.Body>
          </Card.Root>

          {/* Rename Tournament Modal */}
          <Dialog.Root
            open={renameOpen}
            onOpenChange={(e) => setRenameOpen(e.open)}
          >
            <Portal>
              <Dialog.Backdrop />
              <Dialog.Positioner>
                <Dialog.Content>
                  <Dialog.Header>
                    <Dialog.Title>Rename Tournament</Dialog.Title>
                  </Dialog.Header>

                  <Dialog.Body>
                    <Stack gap={3}>
                      {renameError ? (
                        <Box
                          border="1px solid"
                          borderColor="red.200"
                          bg="red.50"
                          borderRadius="lg"
                          p={3}
                        >
                          <Text color="red.700" fontSize="sm">
                            {renameError}
                          </Text>
                        </Box>
                      ) : null}

                      <Input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        placeholder="New tournament name"
                        disabled={renameStatus === "saving"}
                      />
                      <Text fontSize="sm" opacity={0.75}>
                        Requires backend route: PATCH /api/tournaments/:id
                      </Text>
                    </Stack>
                  </Dialog.Body>

                  <Dialog.Footer>
                    <HStack gap={2}>
                      <Button
                        variant="outline"
                        onClick={() => setRenameOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="pickle"
                        onClick={saveRename}
                        disabled={
                          renameStatus === "saving" || !renameValue.trim()
                        }
                      >
                        {renameStatus === "saving" ? "Saving…" : "Save"}
                      </Button>
                    </HStack>
                  </Dialog.Footer>
                </Dialog.Content>
              </Dialog.Positioner>
            </Portal>
          </Dialog.Root>

          {/* Delete Tournament Modal (type-to-confirm) */}
          <Dialog.Root
            open={deleteOpen}
            onOpenChange={(e) => setDeleteOpen(e.open)}
          >
            <Portal>
              <Dialog.Backdrop />
              <Dialog.Positioner>
                <Dialog.Content>
                  <Dialog.Header>
                    <Dialog.Title>Delete Tournament</Dialog.Title>
                  </Dialog.Header>

                  <Dialog.Body>
                    <Stack gap={3}>
                      <Text>
                        This will permanently delete <b>{deleteName}</b> and all
                        its tournament data.
                      </Text>

                      {deleteError ? (
                        <Box
                          border="1px solid"
                          borderColor="red.200"
                          bg="red.50"
                          borderRadius="lg"
                          p={3}
                        >
                          <Text color="red.700" fontSize="sm">
                            {deleteError}
                          </Text>
                        </Box>
                      ) : null}

                      <Text fontSize="sm" opacity={0.8}>
                        Type the tournament name to confirm:
                      </Text>

                      <Input
                        value={deleteTyped}
                        onChange={(e) => setDeleteTyped(e.target.value)}
                        placeholder={deleteName}
                        disabled={deleteStatus === "deleting"}
                      />
                    </Stack>
                  </Dialog.Body>

                  <Dialog.Footer>
                    <HStack gap={2}>
                      <Button
                        variant="outline"
                        onClick={() => setDeleteOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="outline"
                        onClick={confirmDelete}
                        disabled={!canConfirmDelete}
                      >
                        {deleteStatus === "deleting" ? "Deleting…" : "Delete"}
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

export default CreateTournament;
