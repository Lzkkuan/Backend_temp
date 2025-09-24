import type { CookieOptions } from "express";
import { env } from "@/config/env";

export const authCookieName = "token";

export const authCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.IS_PROD,
  sameSite: "lax",
  path: "/"
};
