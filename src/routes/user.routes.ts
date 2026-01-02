import { Router } from "express";
import * as userController from "../controllers/user.controller.js";
import { standardRateLimiter } from "../middlewares/rate-limit.middleware.js";
import { validateParams, validateQuery } from "../middlewares/validation.middleware.js";
import {
  getUserHistoryParamsSchema,
  getUserHistoryQuerySchema,
  getUserStatsParamsSchema,
} from "../schemas/validation.schemas.js";

const router = Router();

// Apply standard rate limiting to all user routes
router.use(standardRateLimiter);

// User-specific endpoints
router.get(
  "/user/:address/stats",
  validateParams(getUserStatsParamsSchema),
  userController.getUserStats,
);

router.get(
  "/user/:address/history",
  validateParams(getUserHistoryParamsSchema),
  validateQuery(getUserHistoryQuerySchema),
  userController.getUserHistory,
);

router.get(
  "/user/:address/rewards",
  validateParams(getUserStatsParamsSchema),
  userController.getUserRewards,
);

// Public vault endpoints
router.get("/vault/info", userController.getVaultInfo);
router.get("/vault/draws", userController.getDrawHistory);

export default router;
