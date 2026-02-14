// backend/db.js
const { Pool } = require("pg");

const isRailway = !!process.env.RAILWAY_ENVIRONMENT;

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        // Railway Postgres often requires SSL
        ssl: { rejectUnauthorized: false },
      }
    : {
        host: process.env.PGHOST || "localhost",
        port: Number(process.env.PGPORT || 5440),
        user: process.env.PGUSER || "postgres",
        password: process.env.PGPASSWORD || "postgres",
        database: process.env.PGDATABASE || "bigdill",
      }
);

pool.on("error", (err) => {
  console.error("Unexpected PG pool error:", err);
});

module.exports = pool;
