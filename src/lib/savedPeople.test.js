import { describe, it, expect } from "vitest";
import { remember, forget, rename, renameInPeople, renameInHistory, assignContactIds, matchName, historyContacts } from "./savedPeople.js";

const ids = () => { let n = 0; return () => `id${++n}`; };
const person = (name, contactId, i = 0) => ({ id: `p${i}`, name, color: "#000", ...(contactId && { contactId }) });
const split = (id, people, createdAt = 0) => ({ id, createdAt, people, bill: { items: [], taxes: [] }, assignments: {}, paid: {} });

describe("saved people list", () => {
  const list = [{ id: "a", name: "Asha" }, { id: "r", name: "Ravi" }, "Meera"]; // older saves are plain strings

  it("puts contacts first, without duplicates by id or name, keeping ids", () => {
    expect(remember(list, [{ id: "r", name: "Ravi" }, { id: "k", name: "Kiran" }])).toEqual([
      { id: "r", name: "Ravi" }, { id: "k", name: "Kiran" }, { id: "a", name: "Asha" }, { name: "Meera" }
    ]);
    expect(remember(list, [{ name: "asha" }]).map(x => x.name)).toEqual(["asha", "Ravi", "Meera"]);
  });

  it("forgets a name, ignoring case", () => {
    expect(forget(list, "ASHA").map(x => x.name)).toEqual(["Ravi", "Meera"]);
  });

  it("renames in place, keeps the id, and tidies spaces", () => {
    expect(rename(list, "Ravi", "  Ravi   Kumar ")[1]).toEqual({ id: "r", name: "Ravi Kumar" });
    expect(rename(list, "Meera", "meera").map(x => x.name)).toEqual(["Asha", "Ravi", "meera"]);
  });

  it("refuses an empty name or one that is already saved", () => {
    expect(rename(list, "Ravi", "   ")).toBeNull();
    expect(rename(list, "Ravi", "asha")).toBeNull();
  });
});

describe("renaming across splits", () => {
  const ravi = { id: "r", name: "Ravi" };

  it("renames by contact id, even where the old spelling differs", () => {
    const people = [person("Asha", "a", 0), person("ravi k", "r", 1)];
    expect(renameInPeople(people, ravi, "Ravi Kumar").map(p => p.name)).toEqual(["Asha", "Ravi Kumar"]);
  });

  it("doesn't rename a different person who happens to have the same name", () => {
    const people = [person("Ravi", "other", 0)];
    expect(renameInPeople(people, ravi, "Ravi K")).toBe(people);
  });

  it("falls back to the name for people without an id", () => {
    expect(renameInPeople([person("Ravi")], ravi, "Ravi K")[0].name).toBe("Ravi K");
  });

  it("leaves a split alone when the new name is already someone else's there", () => {
    const people = [person("Asha", "a", 0), person("Ravi", "r", 1)];
    expect(renameInPeople(people, ravi, "asha")).toBe(people);
  });

  it("renames across history and counts the splits that changed", () => {
    const history = [split("1", [person("Asha", "a", 0), person("Ravi", "r", 1)]), split("2", [person("Meera", "m")]), split("3", [person("Ravi", "r")])];
    const { history: next, changed } = renameInHistory(history, ravi, "Ravi K");
    expect(changed).toBe(2);
    expect(next.map(e => e.people.map(p => p.name))).toEqual([["Asha", "Ravi K"], ["Meera"], ["Ravi K"]]);
    expect(next[1]).toBe(history[1]);
  });
});

describe("assignContactIds (one-time upgrade of older data)", () => {
  it("gives the same name the same id across the saved list, history and the current split", () => {
    const out = assignContactIds({
      savedNames: ["Asha", { name: "Ravi" }],
      history: [split("1", [person("asha"), person("Kiran", null, 1)]), split("2", [person("Ravi")])],
      people: [person("Kiran"), person("ASHA", null, 1)]
    }, ids());
    const asha = out.savedNames[0].id;
    expect(out.savedNames).toEqual([{ id: asha, name: "Asha" }, { id: out.savedNames[1].id, name: "Ravi" }]);
    expect(out.history[0].people.map(p => p.contactId)).toEqual([asha, out.people[0].contactId]);
    expect(out.history[1].people[0].contactId).toBe(out.savedNames[1].id);
    expect(out.people[1].contactId).toBe(asha);
  });

  it("keeps existing ids and reuses them for the same name", () => {
    const out = assignContactIds({ savedNames: [], history: [split("1", [person("Ravi", "r")])], people: [person("ravi")] }, ids());
    expect(out.people[0].contactId).toBe("r");
  });

  it("returns the same objects when everything already has ids", () => {
    const input = { savedNames: [{ id: "a", name: "Asha" }], history: [split("1", [person("Asha", "a")])], people: [person("Asha", "a")] };
    const out = assignContactIds(input, ids());
    expect(out.savedNames).toBe(input.savedNames);
    expect(out.history).toBe(input.history);
    expect(out.people).toBe(input.people);
  });
});

describe("matchName (adding someone on the People step)", () => {
  const saved = [{ id: "a", name: "Asha" }];
  const history = [split("old", [person("Ravi", "r1")], 1), split("new", [person("Ravi", "r2")], 2)];

  it("uses a saved person directly", () => {
    expect(matchName("asha", saved, history)).toEqual({ kind: "saved", contact: { id: "a", name: "Asha" } });
  });

  it("offers the person from the most recent earlier split", () => {
    expect(matchName("RAVI", saved, history)).toEqual({ kind: "earlier", contactId: "r2", name: "Ravi" });
  });

  it("treats anyone else as new", () => {
    expect(matchName("Kiran", saved, history)).toEqual({ kind: "new" });
  });
});

describe("historyContacts", () => {
  it("lists everyone in saved splits once, with their latest name, most splits first", () => {
    const history = [
      split("1", [person("Asha", "a"), person("Ravi", "r", 1)], 1),
      split("2", [person("Asha", "a"), person("Ravi K", "r", 1)], 3),
      split("3", [person("Asha", "a")], 2)
    ];
    expect(historyContacts(history)).toEqual([{ id: "a", name: "Asha", splits: 3 }, { id: "r", name: "Ravi K", splits: 2 }]);
  });
});
