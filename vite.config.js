import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { execSync } from "node:child_process";

// Short commit + build date, shown in Settings to tell which version a device is running
const commit = (() => { try { return execSync("git rev-parse --short HEAD").toString().trim(); } catch { return "dev"; } })();
const APP_BUILD = `${commit} · ${new Date().toISOString().slice(0, 10)}`;

export default defineConfig(({ mode }) => {
  const { VITE_PUBLIC_URL } = loadEnv(mode, process.cwd());
  return {
    base: "./",
    define: { __APP_BUILD__: JSON.stringify(APP_BUILD) },
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["favicon.ico", "apple-touch-icon-180x180.png", "logo.svg", "pizza.svg"],
        manifest: {
          name: "SplitEasy",
          short_name: "SplitEasy",
          description: "Split restaurant bills with friends, fully offline.",
          theme_color: "#6366f1",
          background_color: "#f3f4f6",
          display: "standalone",
          orientation: "portrait",
          start_url: "./",
          scope: "./",
          // Lets the browser tab ask (getInstalledRelatedApps) whether this app is already installed
          ...(VITE_PUBLIC_URL && { related_applications: [{ platform: "webapp", url: new URL("manifest.webmanifest", VITE_PUBLIC_URL).href }] }),
          icons: [
            { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
            { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
            { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
            { src: "maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
          ]
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
          // pay.html carries the payment in its query string; match the cached page regardless of params
          ignoreURLParametersMatching: [/.*/],
          navigateFallbackDenylist: [/\/pay\.html/]
        }
      })
    ]
  };
});
