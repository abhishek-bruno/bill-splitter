// Hash routes so the browser/Android back button steps back through screens instead of leaving
// the app. Hashes need no server config on GitHub Pages and don't disturb the service worker.
export const STEP_ROUTES = ["", "people", "assign", "summary"];

export function routeFor({ view, openEntryId, step, billMode }) {
  if (view === "settings") return "#/settings";
  if (view === "history") return openEntryId ? `#/history/${openEntryId}` : "#/history";
  if (step === 0) return billMode === "manual" ? "#/bill/manual" : billMode === "upload" ? "#/bill/scan" : "#/";
  return `#/${STEP_ROUTES[step]}`;
}

export function parseRoute(hash) {
  if (!hash) return { view: "split" }; // no route yet: let saved progress decide the screen
  const [a, b] = hash.replace(/^#\/?/, "").split("/");
  if (a === "settings") return { view: "settings" };
  if (a === "history") return { view: "history", openEntryId: b ? decodeURIComponent(b) : null };
  if (a === "bill") return { view: "split", step: 0, billMode: b === "manual" ? "manual" : b === "scan" ? "upload" : null };
  const step = STEP_ROUTES.indexOf(a);
  return { view: "split", step: step > 0 ? step : 0, billMode: null };
}
