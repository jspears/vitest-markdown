import { defineConfig } from "vitest/config";
import { markdownTest } from "./src/vitest-markdown-loader";

export default defineConfig({
    plugins: [markdownTest()],
    test: {
        include: ["**/*.md"],
        exclude: ["**/node_modules/**", "**/dist/**"],
    }
});
