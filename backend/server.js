// server.js
require("dotenv").config();
const express = require("express");
const pool = require("./db");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

const engine = require("./tournamentEngine");

// In-memory tournament data (temporary, for development)
const store = {
  teams: [
    { id: 1, name: "Aubrey & Olivia" },
    { id: 2, name: "Big Dill Energy" },
    { id: 3, name: "Kitchen Dinks" },
    { id: 4, name: "Pickles" },
    { id: 5, name: "Dill With It" },
    { id: 6, name: "Net Results" },
  ],
  rrMatches: [],
  semis: [],
  finals: [],
};

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED PROMISE REJECTION:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

// ------------------ API ROUTES ------------------

// Test message route
app.get("/api/message", (req, res) => {
  res.json({ text: "Hello from the Big Dill Pickleball backend!" });
});

// ---- GET /api/players ----
app.get("/api/players", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM players ORDER BY id;");
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching players:", err);
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/api/roundrobin/generate", (req, res) => {
  try {
    store.rrMatches = engine.generateRoundRobinSchedule(store.teams, 4);
    res.json({ teams: store.teams, matches: store.rrMatches });
  } catch (err) {
    console.error("RR generate error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/roundrobin/matches/:id/score", (req, res) => {
  const { id } = req.params;
  const { scoreA, scoreB } = req.body;

  try {
    const match = engine.scoreMatch(store.rrMatches, id, scoreA, scoreB);
    const standings = engine.computeStandings(
      store.teams.map((t) => t.id),
      store.rrMatches
    );

    res.json({ match, standings });
  } catch (err) {
    console.error("Score error:", err);
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/roundrobin/standings", (req, res) => {
  try {
    const standings = engine.computeStandings(
      store.teams.map((t) => t.id),
      store.rrMatches
    );
    res.json({ standings });
  } catch (err) {
    console.error("Standings error:", err);
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/playoffs/generate", (req, res) => {
  try {
    const standings = engine.computeStandings(
      store.teams.map((t) => t.id),
      store.rrMatches
    );
    store.semis = engine.generatePlayoffsFromStandings(standings);
    res.json({ semis: store.semis });
  } catch (err) {
    console.error("Playoffs generate error:", err);
    res.status(400).json({ error: err.message });
  }
});
app.post("/api/playoffs/semis/:id/score", (req, res) => {
  const { id } = req.params;
  const { scoreA, scoreB } = req.body;

  try {
    engine.scoreMatch(store.semis, id, scoreA, scoreB);

    const sf1Done = store.semis.find((m) => m.id === "SF1")?.winnerId;
    const sf2Done = store.semis.find((m) => m.id === "SF2")?.winnerId;

    if (sf1Done && sf2Done) {
      store.finals = engine.generateFinalsFromSemis(store.semis);
    }

    res.json({ semis: store.semis, finals: store.finals });
  } catch (err) {
    console.error("Semi score error:", err);
    res.status(400).json({ error: err.message });
  }
});
// ---- POST /api/players ----
app.post("/api/players", async (req, res) => {
  const { name, skill } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Name is required" });
  }

  try {
    const result = await pool.query(
      "INSERT INTO players (name, skill) VALUES ($1, $2) RETURNING *;",
      [name, skill]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error adding player:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ---- GET /api/matches (mock data) ----
app.get("/api/matches", (req, res) => {
  res.json([
    {
      teamA: "Team 1",
      teamB: "Team 2",
      date: "2025-11-15",
      time: "10:00 AM",
      court: "Court 1",
    },
    {
      teamA: "Team 3",
      teamB: "Team 4",
      date: "2025-11-15",
      time: "11:00 AM",
      court: "Court 2",
    },
  ]);
});

// ------------------ START SERVER ------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
