import { Role } from "@/types/user";

export type JwtPayload = {
  email: string;
  role: Role;
  iat?: number;
  exp?: number;
};
