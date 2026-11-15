import { describe, it, expect, beforeEach } from "vitest";
import { requestStore, REQUESTS_KEY } from "./requests.js";

// A minimal in-memory localStorage for Node
beforeEach(() => {
  const data = new Map();
  globalThis.localStorage = {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k)
  };
});
const saved = () => JSON.parse(localStorage.getItem(REQUESTS_KEY));

describe("requestStore", () => {
  it("saves an opened link, newest first", () => {
    requestStore("a").remember({ title: "Taj bill", amount: 100 });
    requestStore("b").remember({ title: "Cafe bill", amount: 50 });
    expect(saved().map(r => r.id)).toEqual(["b", "a"]);
    expect(saved()[1]).toMatchObject({ id: "a", title: "Taj bill", amount: 100 });
  });

  it("moves a reopened link to the top without duplicating it", () => {
    requestStore("a").remember({ title: "A" });
    requestStore("b").remember({ title: "B" });
    requestStore("a").remember({ title: "A" });
    expect(saved().map(r => r.id)).toEqual(["a", "b"]);
  });

  it("keeps what the reader chose when the link is opened again", () => {
    const store = requestStore("g");
    store.remember({ title: "Group", group: true });
    store.patch({ me: 2, who: "Meera", share: 333.33, paid: true });
    store.remember({ title: "Group", group: true });
    expect(store.get()).toMatchObject({ me: 2, who: "Meera", share: 333.33, paid: true });
  });

  it("keeps the paid mark on a personal link, but takes fresh details from it", () => {
    const store = requestStore("p");
    store.remember({ title: "Bill", me: 1, who: "Ravi", share: 100 });
    store.patch({ paid: true });
    store.remember({ title: "Bill", me: 1, who: "Ravi", share: 120 });
    expect(store.get()).toMatchObject({ paid: true, share: 120 });
  });

  it("keeps at most 50 requests", () => {
    for (let i = 0; i < 55; i++) requestStore(`r${i}`).remember({ title: `#${i}` });
    expect(saved()).toHaveLength(50);
    expect(saved()[0].id).toBe("r54");
  });
});
