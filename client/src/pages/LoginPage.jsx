import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Container,
  Heading,
  Input,
  Stack,
  Text,
} from "@chakra-ui/react";
import { LogIn } from "lucide-react";
import { API_BASE } from "../apiBase";

function apiUrl(path) {
  const base = (API_BASE || "").replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!base) return p;
  return `${base}${p}`;
}

export default function LoginPage({ onLogin }) {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("idle"); // idle | saving | error
  const [error, setError] = useState("");

  const isSaving = status === "saving";
  const canSubmit = email.trim() && password.trim() && !isSaving;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setStatus("saving");

    try {
      const res = await fetch(apiUrl("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const data = await res.json().catch(() => ({}));
      console.log("login response:", res.status, data);

      if (!res.ok) {
        throw new Error(data?.error || `Login failed (${res.status})`);
      }

      if (onLogin) {
        onLogin(data?.user || null);
      }

      navigate("/");
    } catch (err) {
      console.error(err);
      setError(err?.message || "Login failed.");
      setStatus("error");
    } finally {
      if (status !== "error") {
        setStatus("idle");
      } else {
        setStatus("idle");
      }
    }
  }

  return (
    <Box bg="cream.50" minH="100vh" py={{ base: 8, md: 16 }}>
      <Container maxW="md" px={{ base: 4, md: 6 }}>
        <Box
          bg="white"
          border="1px solid"
          borderColor="border"
          borderRadius="2xl"
          boxShadow="soft"
          p={{ base: 5, md: 8 }}
        >
          <Stack gap={5}>
            <Stack gap={2}>
              <Heading size="lg">Admin Login</Heading>
              <Text opacity={0.8}>
                Log in to manage tournaments, teams, and protected actions.
              </Text>
            </Stack>

            <form onSubmit={handleSubmit}>
              <Stack gap={4}>
                <Box>
                  <Text fontSize="sm" fontWeight="700" mb={2}>
                    Email
                  </Text>
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isSaving}
                  />
                </Box>

                <Box>
                  <Text fontSize="sm" fontWeight="700" mb={2}>
                    Password
                  </Text>
                  <Input
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isSaving}
                  />
                </Box>

                {error ? (
                  <Box
                    border="1px solid"
                    borderColor="red.200"
                    bg="red.50"
                    borderRadius="lg"
                    p={3}
                  >
                    <Text color="red.700" fontSize="sm">
                      {error}
                    </Text>
                  </Box>
                ) : null}

                <Button type="submit" variant="pickle" disabled={!canSubmit}>
                  <LogIn size={16} style={{ marginRight: 8 }} />
                  {isSaving ? "Logging in..." : "Log In"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/")}
                  disabled={isSaving}
                >
                  Back to Home
                </Button>
              </Stack>
            </form>
          </Stack>
        </Box>
      </Container>
    </Box>
  );
}
