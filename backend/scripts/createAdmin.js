const argon2 = require("argon2");
const pool = require("../db");

async function main() {
  const email = "gsuman@unca.edu";
  const password = "SillyPassword1!";
  const playerName = "giv";

  const existing = await pool.query(
    "select id from users where email_lower = lower($1)",
    [email]
  );

  if (existing.rowCount > 0) {
    console.log("User already exists.");
    process.exit(0);
  }

  const passwordHash = await argon2.hash(password);

  const userResult = await pool.query(
    `
    insert into users (email, password_hash, role)
    values ($1, $2, 'admin')
    returning id, email, role
    `,
    [email, passwordHash]
  );

  const user = userResult.rows[0];

  const playerResult = await pool.query(
    `
    insert into players (name, user_id, email)
    values ($1, $2, $3)
    returning id, name, user_id
    `,
    [playerName, user.id, email]
  );

  console.log("Created admin user:");
  console.log(user);
  console.log("Created player:");
  console.log(playerResult.rows[0]);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});