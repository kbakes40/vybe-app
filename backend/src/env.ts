import { z } from "zod";

/**
 * Environment variable schema using Zod
 * This ensures all required environment variables are present and valid
 */
const envSchema = z.object({
  // Server Configuration
  PORT: z.string().optional().default("3000"),
  NODE_ENV: z.string().optional(),
  BACKEND_URL: z.url("BACKEND_URL must be a valid URL").default("http://localhost:3000"), // Set via the Vibecode enviroment at run-time

  // Database - either TURSO_URL+TURSO_AUTH_TOKEN or DATABASE_URL must be set
  DATABASE_URL: z.string().optional(),
  TURSO_URL: z.string().optional(),
  TURSO_AUTH_TOKEN: z.string().optional(),

  // Auth
  BETTER_AUTH_SECRET: z.string().min(1, "BETTER_AUTH_SECRET is required"),

  // YouTube Data API (for Discover feature)
  YOUTUBE_API_KEY: z.string().optional(), // Optional - feature degrades gracefully if not set

  // Twilio SMS (for phone-number OTP). When unset, OTPs are logged to console only.
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
});

/**
 * Validate and parse environment variables
 */
function validateEnv() {
  try {
    const parsed = envSchema.parse(process.env);

    // Validate database config: need either Turso OR local SQLite
    const hasTurso = parsed.TURSO_URL && parsed.TURSO_AUTH_TOKEN;
    const hasLocalDb = parsed.DATABASE_URL;

    if (!hasTurso && !hasLocalDb) {
      // Default to local SQLite for development
      (parsed as any).DATABASE_URL = "file:./dev.db";
    }

    console.log("✅ Environment variables validated successfully");
    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("❌ Environment variable validation failed:");
      error.issues.forEach((err: any) => {
        console.error(`  - ${err.path.join(".")}: ${err.message}`);
      });
      console.error("\nPlease check your .env file and ensure all required variables are set.");
      process.exit(1);
    }
    throw error;
  }
}

/**
 * Validated and typed environment variables
 */
export const env = validateEnv();

/**
 * Type of the validated environment variables
 */
export type Env = z.infer<typeof envSchema>;

/**
 * Extend process.env with our environment variables
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    // eslint-disable-next-line import/namespace
    interface ProcessEnv extends z.infer<typeof envSchema> {}
  }
}
