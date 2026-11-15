import { describe, it, expect } from "vitest";
import { routeFor, parseRoute } from "./routes.js";

describe("routes", () => {
  const screens = [
    [{ view: "split", step: 0, billMode: null }, "#/"],
    [{ view: "split", step: 0, billMode: "manual" }, "#/bill/manual"],
    [{ view: "split", step: 0, billMode: "upload" }, "#/bill/scan"],
    [{ view: "split", step: 1 }, "#/people"],
    [{ view: "split", step: 2 }, "#/assign"],
    [{ view: "split", step: 3 }, "#/summary"],
    [{ view: "history", openEntryId: null }, "#/history"],
    [{ view: "history", openEntryId: "123-abc" }, "#/history/123-abc"],
    [{ view: "settings" }, "#/settings"]
  ];

  it.each(screens)("%o is %s", (state, hash) => {
    expect(routeFor(state)).toBe(hash);
  });

  it.each(screens)("%o comes back from %s", (state, hash) => {
    expect(routeFor({ ...parseRoute(hash), step: parseRoute(hash).step ?? 0 })).toBe(hash);
  });

  it("lets saved progress decide when there is no route yet", () => {
    expect(parseRoute("")).toEqual({ view: "split" });
  });

  it("sends unknown routes to the start", () => {
    expect(parseRoute("#/nowhere")).toEqual({ view: "split", step: 0, billMode: null });
  });
});
