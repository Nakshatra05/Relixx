import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
// Merge VITE_* from Relix/.env (parent) and frontend/.env so the API key works from either place.
export default defineConfig(({ mode }) => {
  const parentDir = path.resolve(__dirname, "..");
  const merged = {
    ...loadEnv(mode, parentDir, ""),
    ...loadEnv(mode, __dirname, ""),
  };
  const viteDefine = Object.fromEntries(
    Object.entries(merged)
      .filter(([key]) => key.startsWith("VITE_"))
      .map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]),
  );

  return {
    define: viteDefine,
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
    },
  };
});
