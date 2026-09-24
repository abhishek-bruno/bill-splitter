import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
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
});
