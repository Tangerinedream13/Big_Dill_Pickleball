import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { ChakraProvider } from "@chakra-ui/react";

import system from "./theme";

import App from "./App.jsx";
import PlayersPage from "./PlayersPage.jsx";
import CreateTournament from "./CreateTournament.jsx";
import MatchSchedule from "./MatchSchedule.jsx";
import BracketPage from "./pages/BracketPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import { API_BASE } from "./apiBase";

import "./index.css";

function apiUrl(path) {
  const base = (API_BASE || "").replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!base) return p;
  return `${base}${p}`;
}

function RequireAuth({ user, children }) {
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RouterApp() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    async function loadMe() {
      try {
        const res = await fetch(apiUrl("/api/auth/me"), {
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        setUser(data?.user || null);
      } catch (err) {
        console.error(err);
        setUser(null);
      } finally {
        setAuthChecked(true);
      }
    }

    loadMe();
  }, []);

  if (!authChecked) {
    return <div>Loading...</div>;
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage onLogin={setUser} />} />
      <Route path="/" element={<App user={user} setUser={setUser} />} />
      <Route path="/players" element={<PlayersPage user={user} setUser={setUser} />} />
      <Route
        path="/tournaments/new"
        element={
          <RequireAuth user={user}>
            <CreateTournament user={user} setUser={setUser} />
          </RequireAuth>
        }
      />
      <Route path="/matches" element={<MatchSchedule user={user} setUser={setUser} />} />
      <Route path="/bracket" element={<BracketPage user={user} setUser={setUser} />} />
    </Routes>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ChakraProvider value={system}>
      <BrowserRouter>
        <RouterApp />
      </BrowserRouter>
    </ChakraProvider>
  </StrictMode>
);