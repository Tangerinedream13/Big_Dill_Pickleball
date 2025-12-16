// server.js
require("dotenv").config();
const express = require("express");
const pool = require("./db");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

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