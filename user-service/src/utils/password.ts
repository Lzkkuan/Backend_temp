import bcrypt from "bcrypt";
import { env } from "@/config/env";

export const hashPassword = (plain: string) =>
  bcrypt.hash(plain, env.SALT_ROUNDS);

export const comparePassword = (plain: string, hash: string) =>
  bcrypt.compare(plain, hash.trim());
