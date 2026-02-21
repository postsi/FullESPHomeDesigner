import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  base: "/api/esphome_touch_designer/static/",
  build: {
    outDir: path.resolve(__dirname, "../custom_components/esphome_touch_designer/web/dist"),
    emptyOutDir: true,
    sourcemap: true,
  },
});
