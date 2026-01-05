import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";

import { ChakraProvider, defaultSystem } from "@chakra-ui/react";

import App from "./App.jsx";
import PlayersPage from "./PlayersPage.jsx";
import CreateTournament from "./CreateTournament.jsx";
import MatchSchedule from "./MatchSchedule.jsx";
import BracketPage from "./pages/BracketPage.jsx";

import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ChakraProvider value={defaultSystem}>
      <BrowserRouter>
        <nav style={{ textAlign: "center", margin: "1rem" }}>
          <Link to="/" style={{ marginRight: "1rem" }}>
            Home
          </Link>
          <Link to="/players" style={{ marginRight: "1rem" }}>
            Players
          </Link>
          <Link to="/tournaments/new" style={{ marginRight: "1rem" }}>
            Create Tournament
          </Link>
          <Link to="/matches" style={{ marginRight: "1rem" }}>
            Matches
          </Link>
          <Link to="/bracket">Bracket</Link>
        </nav>

        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/players" element={<PlayersPage />} />
          <Route path="/tournaments/new" element={<CreateTournament />} />
          <Route path="/matches" element={<MatchSchedule />} />
          <Route path="/bracket" element={<BracketPage />} />
        </Routes>
      </BrowserRouter>
    </ChakraProvider>
  </StrictMode>
);
