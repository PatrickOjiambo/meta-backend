import { z } from "zod/v4";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),

  // MongoDB
  MONGODB_URI: z.url(),
  
  // Casper Network
  CASPER_NODE_URL: z.url().default("http://localhost:11101"),
  CASPER_SIDECAR_URL: z.url().default("http://localhost:18101"),
  CASPER_NETWORK_NAME: z.string().default("casper-test"),
  CONTRACT_HASH: z.string(),
  
  // Admin Configuration
  ADMIN_SECRET: z.string().min(32),
  ADMIN_PUBLIC_KEY: z.string(),
  ADMIN_PRIVATE_KEY: z.string(),
  
  // Application Settings
  DRAW_INTERVAL_HOURS: z.coerce.number().default(168), // Default: weekly
  MIN_HOLD_DURATION_HOURS: z.coerce.number().default(24),
  REWARD_SPLIT_PERCENTAGE: z.coerce.number().min(0).max(100).default(50),
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  ADMIN_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(10),
});

try {
  // eslint-disable-next-line node/no-process-env
  envSchema.parse(process.env);
}
catch (error) {
  if (error instanceof z.ZodError) {
    console.error("Missing environment variables:", error.issues.flatMap(issue => issue.path));
  }
  else {
    console.error(error);
  }
  process.exit(1);
}

// eslint-disable-next-line node/no-process-env
export const env = envSchema.parse(process.env);
