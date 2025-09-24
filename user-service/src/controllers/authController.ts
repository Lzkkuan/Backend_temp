// src/controllers/auth.controller.ts
import { authCookieName, authCookieOptions } from "@/config/cookies";
import { BadRequestError, UnauthorizedError } from "@/errors/appError";
import { asyncHandler } from "@/middleware/asyncHandler";
import { LoginInput, RegisterInput, ResetPasswordInput } from "@/schemas/authSchema";
import {
  loginUserSvc,
  registerUserSvc,
  resetPasswordSvc,
} from "@/services/authService";
import type { Request, Response } from "express";

export const registerUser = asyncHandler(
  async (req: Request, res: Response) => {
    const { email, password, name, role } = req.validated as RegisterInput;
    await registerUserSvc({ email, password, name, role });
    res.status(200).json({ message: "User registered successfully." });
  }
);

export const loginUser = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.validated as LoginInput;
  const out = await loginUserSvc({ email, password });
  res.cookie(authCookieName, out.token, authCookieOptions);
  res.status(200).json({ message: "Login successful", user: out.user });
});

export const resetPassword = asyncHandler(
  async (req: Request, res: Response) => {
    const token = req.cookies?.[authCookieName] as string | undefined;
    if (!token) throw new BadRequestError("Token not found.");

    const email = req.user?.email
    if (!email) {
      throw new UnauthorizedError("Invalid token.");
    }

    const { newPassword } = req.validated as ResetPasswordInput;
    await resetPasswordSvc({ email, newPassword });

    res.clearCookie(authCookieName);
    res.status(200).json({ message: "Password reset successfully." });
  }
);

export const logoutUser = asyncHandler(async (_req: Request, res: Response) => {
  res.clearCookie(authCookieName, { ...authCookieOptions, maxAge: 0 });
  res.status(200).json({ message: "Logout successful" });
});

export const session = asyncHandler(async (req: Request, res: Response) => {
  try {
    const email = req.user?.email
    const role = req.user?.role

    if (!email || !role) {
      throw new UnauthorizedError("Invalid token.");
    }
    
    res.status(200).json({ user: { email, role } });
  } catch {
    throw new UnauthorizedError("Invalid token");
  }
});
