import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

/**
 * Builds the WebKit/desktop bundle without `@supabase/supabase-js`:
 * stubs replace `@/lib/supabase` and `@/adapter/supabase`.
 *
 * Uses `.env.webkit` via `vite --mode webkit` (see npm scripts).
 */
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: [
      { find: "@/lib/supabase", replacement: path.resolve(__dirname, "./src/lib/supabase.webkit.ts") },
      { find: "@/adapter/supabase", replacement: path.resolve(__dirname, "./src/adapter/supabase.webkit.stub.ts") },
      { find: "@", replacement: path.resolve(__dirname, "./src") },
    ],
  },
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(pkg.version),
  },
});
