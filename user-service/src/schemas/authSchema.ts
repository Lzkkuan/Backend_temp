// src/schemas/auth.schema.ts
import { ROLES } from "@/types/user.js";
import { z } from "zod";

export const RegisterSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z.enum(ROLES),
});

export const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const ResetPasswordSchema = z.object({
  newPassword: z.string().min(8),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
