import rateLimit from "express-rate-limit";
import { env } from "../env.js";

export const standardRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests from this IP, please try again later.",
  },
});

export const adminRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.ADMIN_RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Admin rate limit exceeded, please try again later.",
  },
  skipFailedRequests: false,
});

export const strictAdminRateLimiter = rateLimit({
  windowMs: 3600000, // 1 hour
  max: 5, // Only 5 requests per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Critical admin operation rate limit exceeded.",
  },
});
