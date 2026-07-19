import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "tests/**/*.test.ts"],
    // Integration tests that need a live database opt in via env; unit
    // tests always run.
    exclude: ["node_modules", "dist", ".output", ".vinxi"],
    coverage: { reporter: ["text", "html"], include: ["src/lib/**"] },
  },
});
