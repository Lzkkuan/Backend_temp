import { Pool } from "pg";
import { env } from "@/config/env";

const pool = new Pool({
  connectionString: env.PG_URI,
  ssl: env.IS_PROD ? { rejectUnauthorized: false } : false,
});

export const connectDb = async (): Promise<void> => {
  try {
    await pool.connect();
    console.log(`pgsql connected to ${env.PG_URI}`);
  } catch (err) {
    console.error("pgsql connection error:", err);
    process.exit(1);
  }
};

export { pool };
