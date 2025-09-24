import { Router } from "express";
import {
  registerUser,
  loginUser,
  resetPassword,
  logoutUser,
  session,
} from "../controllers/authController";        
import { verifyToken } from "../middleware/authMiddleware"; 
import { validate } from "../middleware/validate";         
import {
  LoginSchema,
  RegisterSchema,
  ResetPasswordSchema,
} from "../schemas/authSchema";     

const router = Router();

router.post("/register", validate(RegisterSchema), registerUser);
router.post("/login", validate(LoginSchema), loginUser);
router.post("/reset-password", validate(ResetPasswordSchema), verifyToken(), resetPassword);
router.post("/logout", logoutUser);
router.get("/session", session);

export default router;
