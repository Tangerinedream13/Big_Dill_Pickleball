import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import App from "./App.jsx";
import PlayersPage from "./PlayersPage.jsx";
import "./index.css";
import CreateTournament from "./CreateTournament.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
    <nav style={{ textAlign: "center", margin: "1rem" }}>
      <Link to="/" style={{ marginRight: "1rem" }}>Home</Link>
      <Link to="/players" style={{ marginRight: "1rem" }}>Players</Link>
      <Link to="/tournaments/new">Create Tournament</Link>
    </nav>
    <Routes>
  <Route path="/" element={<App />} />
    <Route path="/players" element={<PlayersPage />} />
    <Route path="/tournaments/new" element={<CreateTournament />} />
  </Routes>
    </BrowserRouter>
  </StrictMode>
);