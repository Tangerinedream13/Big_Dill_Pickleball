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
