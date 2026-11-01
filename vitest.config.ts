import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: ["src"],
      reporter: ["text", ["text", { file: "coverage.txt" }]],
      thresholds: { 100: true },
    },
  },
});
