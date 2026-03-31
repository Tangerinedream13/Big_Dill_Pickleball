const express = require("express");
const argon2 = require("argon2");
const pool = require("../db");

const router = express.Router();

router.post("/register", async (req, res) => {
  const { email, password, playerName } = req.body;

  if (!email || !password || !playerName) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    const existing = await pool.query(
      "select id from users where email_lower = lower($1)",
      [email]
    );

    if (existing.rowCount > 0) {
      return res.status(409).json({ error: "Email already registered." });
    }

    const passwordHash = await argon2.hash(password);

    const userResult = await pool.query(
      `insert into users (email, password_hash, role)
       values ($1, $2, 'participant')
       returning id, email, role`,
      [email, passwordHash]
    );

    const user = userResult.rows[0];

    const playerResult = await pool.query(
      `insert into players (name, user_id, email)
       values ($1, $2, $3)
       returning id, name, user_id`,
      [playerName, user.id, email]
    );

    req.session.regenerate((err) => {
      if (err) {
        return res.status(500).json({ error: "Session error." });
      }

      req.session.user = {
        id: user.id,
        email: user.email,
        role: user.role,
      };

      return res.status(201).json({
        ok: true,
        user: req.session.user,
        player: playerResult.rows[0],
      });
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Registration failed." });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Missing email or password." });
  }

  try {
    const result = await pool.query(
      `select id, email, password_hash, role
       from users
       where email_lower = lower($1)`,
      [email]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    const user = result.rows[0];
    const ok = await argon2.verify(user.password_hash, password);

    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    req.session.regenerate((err) => {
      if (err) {
        return res.status(500).json({ error: "Session error." });
      }

      req.session.user = {
        id: user.id,
        email: user.email,
        role: user.role,
      };

      return res.json({
        ok: true,
        user: req.session.user,
      });
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Login failed." });
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "Logout failed." });
    }

    res.clearCookie("bigdill.sid");
    return res.json({ ok: true });
  });
});

router.get("/me", (req, res) => {
  return res.json({
    user: req.session?.user || null,
  });
});

module.exports = router;