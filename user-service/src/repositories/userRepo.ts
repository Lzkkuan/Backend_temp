import { pool } from "@/config/db";
import type { Role, User } from "@/types/user";

export async function findUserByEmail(email: string): Promise<User | null> {
  const sql = `SELECT email, password_hash, name, role
               FROM users WHERE email = $1 LIMIT 1`;
  const { rows } = await pool.query<User>(sql, [email]);
  return rows[0] ?? null;
}

export async function insertUser(params: {
  email: string;
  password_hash: string;
  name: string;
  role: Role;
}): Promise<{ email: string } | null> {
  const sql = `
    INSERT INTO users (email, password_hash, name, role)
    VALUES ($1, $2, $3, $4)
    RETURNING email
  `;
  const values = [
    params.email,
    params.password_hash,
    params.name,
    params.role,
  ];
  const { rows } = await pool.query<{ email: string }>(sql, values);
  return rows[0] ?? null;
}

export async function updateUserPassword(
  email: string,
  password_hash: string
): Promise<void> {
  const sql = `UPDATE users SET password_hash = $1 WHERE email = $2`;
  await pool.query(sql, [password_hash, email]);
}
