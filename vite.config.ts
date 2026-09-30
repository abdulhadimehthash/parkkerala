import { defineConfig } from "vite";
export default defineConfig({
  server: {
    proxy: {
      "/world": { target: "ws://localhost:3001", ws: true },
      "/api": "http://localhost:3001",
      "/health": "http://localhost:3001",
    },
  },
  build: { rollupOptions: { output: { manualChunks: { three: ["three"] } } } },
});
