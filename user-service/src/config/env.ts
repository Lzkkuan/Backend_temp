import type { Secret, SignOptions } from "jsonwebtoken";

export const env = {
  USER_PORT: Number.parseInt(process.env.USER_PORT ?? "3001", 10),
  IS_PROD: process.env.NODE_ENV === "production",
  
  PG_URI:
    process.env.NODE_ENV === "production"
      ? process.env.USER_PG_CLOUD_URI
      : process.env.USER_PG_URI,

  SALT_ROUNDS: Number.parseInt(process.env.SALT_ROUNDS ?? "12", 10),
  JWT_SECRET: process.env.JWT_SECRET ?? "" as Secret,
  JWT_EXPIRATION: (process.env.JWT_EXPIRATION ??
    "2d") as SignOptions["expiresIn"],
};

if (!env.PG_URI) {
  console.error("PostgreSQL URI not found in environment variables.");
  process.exit(1);
}

if (!env.JWT_SECRET) {
  console.error("JWT_SECRET is not set");
  process.exit(1);
}

