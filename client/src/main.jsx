import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import App from "./App.jsx";
import PlayersPage from "./PlayersPage.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <nav style={{ textAlign: "center", margin: "1rem" }}>
        <Link to="/" style={{ marginRight: "1rem" }}>Home</Link>
        <Link to="/players">Players</Link>
      </nav>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/players" element={<PlayersPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);