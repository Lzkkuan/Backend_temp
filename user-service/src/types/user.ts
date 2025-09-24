export const ROLES = [
  "user",
  "admin",
] as const;

export type Role = (typeof ROLES)[number];

// type guard function
export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export interface User {
  email: string;
  password_hash: string;
  name: string;
  role: Role;
}

