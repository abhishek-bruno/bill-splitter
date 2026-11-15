// Finding saved splits: by text (the bill's name, the people in it, or what was ordered) and by person.

const words = (q) => q.toLowerCase().split(/\s+/).filter(Boolean);

// Every word typed must appear somewhere in the split ("taj ravi" finds Ravi's splits at Taj)
export function matchesSearch(entry, query) {
  const needles = words(query);
  if (!needles.length) return true;
  const haystack = [
    entry.bill?.restaurant || "",
    ...(entry.people || []).map(p => p.name),
    ...(entry.bill?.items || []).map(i => i.name)
  ].join(" ").toLowerCase();
  return needles.every(w => haystack.includes(w));
}

// Splits that match the search and include the person (contact id), when one is picked
export function filterSplits(history, { query = "", person = null } = {}) {
  return history.filter(e => (!person || e.people.some(p => p.contactId === person)) && matchesSearch(e, query));
}
