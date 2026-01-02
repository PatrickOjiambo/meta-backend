import type { NextFunction, Request, Response } from "express";
import { env } from "../env.js";

export function adminAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const adminSecret = req.headers["x-admin-secret"];

  if (!adminSecret || adminSecret !== env.ADMIN_SECRET) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Invalid or missing admin secret",
    });
    return;
  }

  // Optional: Add IP whitelisting here
  // const clientIp = req.ip || req.socket.remoteAddress;
  // if (!ALLOWED_IPS.includes(clientIp)) {
  //   return res.status(403).json({ error: "Forbidden", message: "IP not whitelisted" });
  // }

  next();
}
