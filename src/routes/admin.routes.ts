import { Router } from "express";
import * as adminController from "../controllers/admin.controller.js";
import { adminAuthMiddleware } from "../middlewares/admin-auth.middleware.js";
import {
    adminRateLimiter,
    strictAdminRateLimiter,
} from "../middlewares/rate-limit.middleware.js";
import { validateBody } from "../middlewares/validation.middleware.js";
import {
    distributeRewardsBodySchema,
    drawWinnersBodySchema,
    manualDepositBodySchema,
    resyncEventsBodySchema,
    triggerUnstakeBodySchema,
} from "../schemas/validation.schemas.js";

const router = Router();

// All admin routes require authentication
router.use(adminAuthMiddleware);

// Apply admin rate limiting
router.use(adminRateLimiter);

// Get system stats
router.get("/stats", adminController.getSystemStats);

// Process unstake (strict rate limit)
router.post(
    "/process-unstake",
    strictAdminRateLimiter,
    validateBody(triggerUnstakeBodySchema),
    adminController.processUnstake,
);

// Draw winners (strict rate limit)
router.post(
    "/draw",
    strictAdminRateLimiter,
    validateBody(drawWinnersBodySchema),
    adminController.drawWinners,
);

// Finalize pending draw
router.post(
    "/draw/:draw_id/finalize",
    strictAdminRateLimiter,
    adminController.finalizeDraw,
);

// Distribute rewards (strict rate limit)
router.post(
    "/distribute-rewards",
    strictAdminRateLimiter,
    validateBody(distributeRewardsBodySchema),
    adminController.distributeRewards,
);

// Manual deposit (for testing/emergency)
router.post(
    "/manual-deposit",
    validateBody(manualDepositBodySchema),
    adminController.manualDeposit,
);

// Resync events
router.post(
    "/resync",
    validateBody(resyncEventsBodySchema),
    adminController.resyncEvents,
);

export default router;
