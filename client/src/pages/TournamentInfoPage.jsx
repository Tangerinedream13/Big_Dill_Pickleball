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
  Input,
  Textarea,
} from "@chakra-ui/react";
import {
  Home,
  ArrowLeft,
  MapPin,
  CalendarDays,
  Clock,
  Mail,
  Pencil,
} from "lucide-react";
import { API_BASE } from "../apiBase";
import usePageTitle from "../hooks/usePageTitle";
import StickyPageHeader from "../components/StickyPageHeader";

function formatEventDate(value) {
  if (!value) return "";

  const raw = String(value);

  // If it starts with YYYY-MM-DD, pull just that part
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    const d = new Date(year, month - 1, day);

    return d.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Invalid Date";

  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function toDateInputValue(value) {
  if (!value) return "";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? match[0] : "";
}

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

function FormField({ label, children }) {
  return (
    <Stack gap={2}>
      <Text fontSize="sm" fontWeight="700">
        {label}
      </Text>
      {children}
    </Stack>
  );
}

const BLANK_FORM = {
  eventDate: "",
  startTime: "",
  endTime: "",
  locationName: "",
  address: "",
  contactEmail: "",
  details: "",
  parkingInfo: "",
  checkInInfo: "",
};

function infoToForm(info) {
  return {
    eventDate: toDateInputValue(info?.eventDate),
    startTime: info?.startTime || "",
    endTime: info?.endTime || "",
    locationName: info?.locationName || "",
    address: info?.address || "",
    contactEmail: info?.contactEmail || "",
    details: info?.details || "",
    parkingInfo: info?.parkingInfo || "",
    checkInInfo: info?.checkInInfo || "",
  };
}

export default function TournamentInfoPage({ user }) {
  usePageTitle("Tournament Info");

  const navigate = useNavigate();
  const { id } = useParams();
  const isAdmin = user?.role === "admin";

  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [info, setInfo] = useState(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [saveError, setSaveError] = useState("");

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

  useEffect(() => {
    if (id) loadInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function startEditing() {
    setForm(infoToForm(info));
    setSaveError("");
    setSaveStatus("idle");
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setSaveError("");
    setSaveStatus("idle");
  }

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function saveInfo(e) {
    e?.preventDefault();
    setSaveError("");
    setSaveStatus("saving");

    try {
      const res = await fetch(`${API_BASE}/api/tournaments/${id}/info`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          eventDate: form.eventDate || null,
          startTime: form.startTime || null,
          endTime: form.endTime || null,
          locationName: form.locationName || null,
          address: form.address || null,
          contactEmail: form.contactEmail || null,
          details: form.details || null,
          parkingInfo: form.parkingInfo || null,
          checkInInfo: form.checkInInfo || null,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      setInfo(data);
      setSaveStatus("ok");
      setEditing(false);
    } catch (err) {
      console.error(err);
      setSaveError(err?.message || "Could not save tournament info.");
      setSaveStatus("error");
    }
  }

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

            <HStack gap={2}>
              {isAdmin && status === "ok" && !editing ? (
                <Button variant="outline" onClick={startEditing}>
                  <Pencil size={16} style={{ marginRight: 8 }} />
                  Edit
                </Button>
              ) : null}

              <Button variant="outline" onClick={() => navigate(-1)}>
                <ArrowLeft size={16} style={{ marginRight: 8 }} />
                Back
              </Button>
            </HStack>
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
        ) : editing ? (
          <Card.Root>
            <Card.Body>
              <Stack gap={5} as="form" onSubmit={saveInfo}>
                <Heading size="lg">{info.name || "Tournament"}</Heading>

                {saveError ? (
                  <Box
                    border="1px solid"
                    borderColor="red.200"
                    bg="red.50"
                    p={4}
                    borderRadius="xl"
                  >
                    <Text color="red.700">{saveError}</Text>
                  </Box>
                ) : null}

                <HStack align="start" gap={4} wrap="wrap">
                  <Box flex="1" minW="200px">
                    <FormField label="Event date">
                      <Input
                        type="date"
                        value={form.eventDate}
                        onChange={(e) =>
                          updateField("eventDate", e.target.value)
                        }
                      />
                    </FormField>
                  </Box>
                  <Box flex="1" minW="140px">
                    <FormField label="Start time">
                      <Input
                        placeholder="ex: 9:00 AM"
                        value={form.startTime}
                        onChange={(e) =>
                          updateField("startTime", e.target.value)
                        }
                      />
                    </FormField>
                  </Box>
                  <Box flex="1" minW="140px">
                    <FormField label="End time">
                      <Input
                        placeholder="ex: 3:00 PM"
                        value={form.endTime}
                        onChange={(e) =>
                          updateField("endTime", e.target.value)
                        }
                      />
                    </FormField>
                  </Box>
                </HStack>

                <FormField label="Location name">
                  <Input
                    placeholder="ex: Lake Louise Pickleball Courts"
                    value={form.locationName}
                    onChange={(e) =>
                      updateField("locationName", e.target.value)
                    }
                  />
                </FormField>

                <FormField label="Address">
                  <Input
                    placeholder="ex: 123 Main St, Weaverville, NC"
                    value={form.address}
                    onChange={(e) => updateField("address", e.target.value)}
                  />
                </FormField>

                <FormField label="Contact email">
                  <Input
                    type="email"
                    placeholder="ex: info@example.com"
                    value={form.contactEmail}
                    onChange={(e) =>
                      updateField("contactEmail", e.target.value)
                    }
                  />
                </FormField>

                <FormField label="Tournament details">
                  <Textarea
                    rows={4}
                    placeholder="Format, divisions, prizes, etc."
                    value={form.details}
                    onChange={(e) => updateField("details", e.target.value)}
                  />
                </FormField>

                <FormField label="Parking info">
                  <Textarea
                    rows={3}
                    value={form.parkingInfo}
                    onChange={(e) =>
                      updateField("parkingInfo", e.target.value)
                    }
                  />
                </FormField>

                <FormField label="Check-in info">
                  <Textarea
                    rows={3}
                    value={form.checkInInfo}
                    onChange={(e) =>
                      updateField("checkInInfo", e.target.value)
                    }
                  />
                </FormField>

                <HStack justify="flex-end" gap={2} pt={2}>
                  <Button
                    variant="outline"
                    onClick={cancelEditing}
                    disabled={saveStatus === "saving"}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="pickle"
                    disabled={saveStatus === "saving"}
                  >
                    {saveStatus === "saving" ? "Saving…" : "Save"}
                  </Button>
                </HStack>
              </Stack>
            </Card.Body>
          </Card.Root>
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
                    value={formatEventDate(info.eventDate)}
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

                  {isAdmin &&
                  !info.eventDate &&
                  !info.locationName &&
                  !info.address ? (
                    <Box
                      border="1px dashed"
                      borderColor="border"
                      borderRadius="xl"
                      p={4}
                    >
                      <Text fontSize="sm" opacity={0.8}>
                        No details added yet. Click Edit above to add the
                        date, location, and other tournament info.
                      </Text>
                    </Box>
                  ) : null}
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
