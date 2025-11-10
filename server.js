// server.js
const express = require("express");
const app = express();
const PORT = process.env.PORT || 5001;

app.use(express.json());

// Example API route
app.get("/api/message", (req, res) => {
  res.json({ text: "Hello from the Big Dill Pickleball backend!" });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});

app.get("/api/players", (req, res) => {
  res.json([
    { id: 1, name: "Maria Haddon", skill: "4.0" },
    { id: 2, name: "Dan Haddon", skill: "3.5" },
  ]);
});

app.post("/api/players", (req, res) => {
  const { name, skill } = req.body;
  const newPlayer = {
    id: Math.floor(Math.random() * 10000),
    name,
    skill,
  };
  res.status(201).json(newPlayer);
});