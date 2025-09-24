import { env } from "@/config/env";
import type { JwtPayload } from "@/types/jwt";
import type { Role } from "@/types/user";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export const verifyToken =
  (allowedRoles: Role[] = []) =>
  (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies?.token as string | undefined;
    if (!token) {
      return res.status(401).json({ message: "No token provided." });
    }

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      req.user = decoded;

      if (allowedRoles.length === 0 || allowedRoles.includes(decoded.role)) {
        return next();
      }
      return res.status(403).json({ message: "Forbidden: Insufficient role." });
    } catch (err) {
      return res.status(400).json({ message: "Invalid token." });
    }
  };
