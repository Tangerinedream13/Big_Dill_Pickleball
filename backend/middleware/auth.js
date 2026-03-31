const pool = require("../db");

function requireAuth(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ error: "Admin Only." });
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    const user = req.session?.user;
    if (!user) {
      return res.status(401).json({ error: "Admin Only." });
    }
    if (!roles.includes(user.role)) {
      return res.status(403).json({ error: "Admin Only." });
    }
    next();
  };
}

async function requirePlayerOwnerOrAdmin(req, res, next) {
  try {
    const playerId = Number(req.params.playerId || req.params.id);
    const user = req.session?.user;

    if (!user) {
      return res.status(401).json({ error: "Admin Only." });
    }

    if (user.role === "admin") {
      return next();
    }

    if (!Number.isInteger(playerId) || playerId <= 0) {
      return res.status(400).json({ error: "Invalid player id." });
    }

    const result = await pool.query(
      "select user_id from players where id = $1",
      [playerId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Player not found." });
    }

    if (result.rows[0].user_id !== user.id) {
      return res.status(403).json({ error: "You cannot edit this player." });
    }

    next();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Authorization check failed." });
  }
}

async function requireTeamCaptainOrAdmin(req, res, next) {
  try {
    const teamId = Number(req.params.teamId || req.params.id);
    const user = req.session?.user;

    if (!user) {
      return res.status(401).json({ error: "Admin Only." });
    }

    if (user.role === "admin") {
      return next();
    }

    if (!Number.isInteger(teamId) || teamId <= 0) {
      return res.status(400).json({ error: "Invalid team id." });
    }

    const result = await pool.query(
      "select captain_user_id from teams where id = $1",
      [teamId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Team not found." });
    }

    if (result.rows[0].captain_user_id !== user.id) {
      return res.status(403).json({ error: "You cannot edit this team." });
    }

    next();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Authorization check failed." });
  }
}

async function requireRegistrationUnlocked(req, res, next) {
  try {
    const tournamentId =
      Number(req.body?.tournamentId) ||
      Number(req.query?.tournamentId) ||
      Number(req.params?.tournamentId) ||
      Number(req.params?.tid);

    if (!tournamentId) {
      return res.status(400).json({ error: "Tournament ID required." });
    }

    const result = await pool.query(
      "select registration_locked from tournaments where id = $1",
      [tournamentId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Tournament not found." });
    }

    const locked = result.rows[0].registration_locked;
    const isAdmin = req.session?.user?.role === "admin";

    if (locked && !isAdmin) {
      return res.status(403).json({ error: "Registration is locked." });
    }

    next();
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Unable to validate registration state." });
  }
}

module.exports = {
  requireAuth,
  requireRole,
  requirePlayerOwnerOrAdmin,
  requireTeamCaptainOrAdmin,
  requireRegistrationUnlocked,
};