// Saved people: most-recent-first { name }, deduped case-insensitively.
// Older saves are plain name strings (and briefly carried a phone), so everything goes through asContact.
export const asContact = (x) => ({ name: typeof x === "string" ? x : x?.name || "" });

export const remember = (list, values, max) => {
  const out = [];
  [...values, ...list].map(asContact).forEach(c => {
    const name = c.name.trim();
    if (name && !out.some(x => x.name.toLowerCase() === name.toLowerCase())) out.push({ name });
  });
  return out.slice(0, max);
};

export const forget = (list, name) => list.map(asContact).filter(x => x.name.toLowerCase() !== name.toLowerCase());

export const MAX_SAVED_NAMES = 30;

export const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();
