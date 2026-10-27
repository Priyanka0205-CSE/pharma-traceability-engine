// Sets real bcrypt password hashes for the demo users inserted by schema.sql.
// Run:  npm run seed:users
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const hash = await bcrypt.hash("Pass@123", 10);
  const res = await pool.query("UPDATE users SET password_hash = $1 RETURNING email, role", [hash]);
  console.log("Updated users (password: Pass@123):");
  console.table(res.rows);
  await pool.end();
})();
