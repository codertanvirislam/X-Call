import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Dummy values so modules that read env at import time (prisma, env) construct
    // without throwing. No test actually connects to the database.
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "mysql://user:pass@localhost:3306/test_db",
      SESSION_SECRET: "test-session-secret-000000000000",
      TOKEN_ENCRYPTION_KEY: "test-token-encryption-key-32byte",
    },
  },
});
