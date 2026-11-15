// Saved people ("contacts"): the people you split with, kept on this device, most recent first.
// Each has a permanent id; every person in a split records it as contactId, so renaming someone and
// filtering History by person work by id, not by spelling. Names on the saved list are unique (ignoring case).
//
//   contact      { id, name }
//   split person { id, name, color, contactId }   (id is local to that split)
//
// Older saves were plain name strings (and briefly carried a phone), so everything goes through asContact.

export const MAX_SAVED_NAMES = 30;

export const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();
export const tidy = (name) => name.trim().replace(/\s+/g, " ");
export const newContactId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const asContact = (x) => (typeof x === "string" ? { name: x } : { ...(x?.id && { id: x.id }), name: x?.name || "" });

// Put contacts at the front of the list (moving them if already there), keeping names unique
export const remember = (list, contacts, max = MAX_SAVED_NAMES) => {
  const out = [];
  [...contacts, ...list].map(asContact).forEach(c => {
    const name = tidy(c.name);
    if (!name || out.some(x => (c.id && x.id === c.id) || sameName(x.name, name))) return;
    out.push({ ...(c.id && { id: c.id }), name });
  });
  return out.slice(0, max);
};

export const forget = (list, name) => list.map(asContact).filter(x => !sameName(x.name, name));

// Rename a saved person in place. Returns the new list, or null when the new name is empty or
// already belongs to someone else on the list.
export const rename = (list, oldName, newName) => {
  const name = tidy(newName);
  const people = list.map(asContact);
  if (!name || people.some(x => sameName(x.name, name) && !sameName(x.name, oldName))) return null;
  return people.map(x => (sameName(x.name, oldName) ? { ...x, name } : x));
};

// Whether a split person is this contact (by id; by name for anyone without an id yet)
const isContact = (p, contact) => (p.contactId ? p.contactId === contact.id : sameName(p.name, contact.name));

// The same rename in a split's people. Left as is when the contact isn't in it, or when someone else
// in the split already has the new name (so a split never gets two people with one name).
export const renameInPeople = (people, contact, newName) => {
  const name = tidy(newName);
  if (!people.some(p => isContact(p, contact))) return people;
  if (people.some(p => sameName(p.name, name) && !isContact(p, contact))) return people;
  return people.map(p => (isContact(p, contact) ? { ...p, name } : p));
};

// The same rename across saved splits; returns the new list and how many splits changed
export const renameInHistory = (history, contact, newName) => {
  let changed = 0;
  const next = history.map(entry => {
    const people = renameInPeople(entry.people, contact, newName);
    if (people === entry.people) return entry;
    changed++;
    return { ...entry, people };
  });
  return { history: next, changed };
};

// Gives every saved person and every person in a split a contact id, treating the same name as the same
// person (the only thing older data has to go on). Safe to run on every start: returns the same objects
// when there is nothing to do.
export function assignContactIds({ savedNames, history, people }, makeId = newContactId) {
  const byName = new Map(); // lowercase name -> id
  const known = (name) => byName.get(name.toLowerCase());
  const learn = (name, id) => { if (!known(name)) byName.set(name.toLowerCase(), id); };
  savedNames.map(asContact).forEach(c => c.id && learn(c.name, c.id));
  [people, ...history.map(e => e.people)].forEach(list => list.forEach(p => p.contactId && learn(p.name, p.contactId)));

  const idFor = (name) => { if (!known(name)) learn(name, makeId()); return known(name); };
  const fixPeople = (list) => (list.every(p => p.contactId) ? list : list.map(p => (p.contactId ? p : { ...p, contactId: idFor(p.name) })));

  const nextSaved = savedNames.every(x => typeof x === "object" && x?.id) ? savedNames
    : savedNames.map(asContact).filter(c => c.name).map(c => (c.id ? c : { id: idFor(c.name), name: c.name }));
  let historyChanged = false;
  const nextHistory = history.map(e => {
    const fixed = fixPeople(e.people);
    if (fixed === e.people) return e;
    historyChanged = true;
    return { ...e, people: fixed };
  });
  return { savedNames: nextSaved, history: historyChanged ? nextHistory : history, people: fixPeople(people) };
}

// What to do when someone types a name on the People step:
//   { kind: "saved", contact }      it's on the saved list: use them
//   { kind: "earlier", contactId, name }  not saved, but someone with this name is in earlier splits: ask if
//                                         it's them (name as it was written there)
//   { kind: "new" }                 a new person
export function matchName(name, savedNames, history) {
  const saved = savedNames.map(asContact).find(c => sameName(c.name, name));
  if (saved) return { kind: "saved", contact: saved };
  // The most recent split with someone of this name
  const sorted = [...history].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  for (const e of sorted) {
    const p = e.people.find(x => sameName(x.name, name) && x.contactId);
    if (p) return { kind: "earlier", contactId: p.contactId, name: p.name };
  }
  return { kind: "new" };
}

// Everyone who appears in saved splits, by contact: { id, name (latest), splits }, most splits first
export function historyContacts(history) {
  const seen = new Map();
  const sorted = [...history].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  sorted.forEach(e => e.people.forEach(p => {
    if (!p.contactId) return;
    const c = seen.get(p.contactId) || { id: p.contactId, name: p.name, splits: 0 };
    c.splits++;
    seen.set(p.contactId, c);
  }));
  return [...seen.values()].sort((a, b) => b.splits - a.splits);
}
