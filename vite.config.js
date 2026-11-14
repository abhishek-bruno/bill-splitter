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
    build: {
      rollupOptions: {
        output: {
          // Keep the on-device reader's libraries in their own chunk, loaded only when it's used
          manualChunks: (id) => (/node_modules\/(@paddleocr|@techstark|onnxruntime-web|clipper-lib)/.test(id) ? "ondevice" : undefined)
        }
      }
    },
    plugins: [
      react(),
      VitePWA({
        registerType: "prompt", // src/UpdatePrompt.jsx asks before switching to a new version
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
          // The on-device reader's code (OCR + OpenCV, >10 MB) isn't installed for everyone; it's cached
          // at runtime once someone downloads a reader (see runtimeCaching below)
          globIgnores: ["**/ondevice-*.js", "**/worker-entry-*.js"],
          runtimeCaching: [
            {
              urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/assets\/(ondevice|worker-entry)-[^/]+\.js$/.test(url.pathname),
              handler: "CacheFirst",
              options: { cacheName: "spliteasy-ondevice-code", expiration: { maxEntries: 8 } }
            },
            {
              // ONNX Runtime files, put there by the consented download (src/local/models.js); the runtime
              // fetches them by URL, so serve them from the cache offline. (Models are read from the cache
              // directly, so their server isn't routed here.)
              urlPattern: ({ url }) => url.href.startsWith("https://cdn.jsdelivr.net/npm/onnxruntime-web@"),
              handler: "CacheFirst",
              options: { cacheName: "spliteasy-models-v1", cacheableResponse: { statuses: [200] } }
            }
          ],
          // pay.html carries the payment in its query string; match the cached page regardless of params
          ignoreURLParametersMatching: [/.*/],
          navigateFallbackDenylist: [/\/pay\.html/]
        }
      })
    ]
  };
});
