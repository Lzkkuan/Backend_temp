import {
  findUserByEmail,
  insertUser,
  updateUserPassword,
} from "@/repositories/userRepo";
import type { Role, User } from "@/types/user";
import { isRole } from "@/types/user";
import { signJwt } from "@/utils/jwt";
import { comparePassword, hashPassword } from "@/utils/password";

export async function registerUserSvc(params: {
  email: string;
  password: string;
  name: string;
  role: Role;
}) {
  let { email, password, name, role } = params;
  email = email.trim().toLowerCase();

  const existing = await findUserByEmail(email);
  if (existing)
    return { ok: false, code: 400, message: "Email already exists." };

  if (!isRole(role))
    return { ok: false, code: 400, message: "That is not a valid role." };

  const password_hash = await hashPassword(password);
  const inserted = await insertUser({
    email,
    password_hash,
    name,
    role
  });
  if (!inserted)
    return { ok: false, code: 400, message: "Adding user failed." };

  return { ok: true as const, code: 200, message: "User added successfully" };
}

export async function loginUserSvc(params: {
  email: string;
  password: string;
}) {
  let { email, password } = params;
  email = email.trim().toLowerCase();

  const user = (await findUserByEmail(email)) as User | null;
  if (!user)
    return { ok: false, code: 401, message: "Invalid email or password." };

  const ok = await comparePassword(password, user.password_hash.trim());
  if (!ok)
    return { ok: false, code: 401, message: "Invalid email or password." };

  const token = signJwt({ email: user.email, role: user.role });
  return {
    ok: true as const,
    token,
    user: { email: user.email, role: user.role },
  };
}

export async function resetPasswordSvc(params: {
  email: string;
  newPassword: string;
}) {
  const { email, newPassword } = params;
  const user = (await findUserByEmail(email)) as User | null;
  if (!user) return { ok: false, code: 400, message: "User not found." };

  const same = await comparePassword(newPassword, user.password_hash);
  if (same)
    return { ok: false, code: 401, message: "Choose a different password." };

  const newHash = await hashPassword(newPassword);
  await updateUserPassword(email, newHash);
  return { ok: true as const };
}
