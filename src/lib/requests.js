// Payment requests opened on this device: the pay page saves each link it opens, and the app lists them
// under History > Requests. Newest first, at most 50. Each entry:
//   { id: <link hash>, savedAt, title, c (currency), amount (bill total), payee,
//     group (a group link), me / who / share / payer (whose share; picked by the reader on a group link),
//     paid (the reader marked it paid), paidByPayer (the payer had marked it paid when the link was made) }
export const REQUESTS_KEY = "spliteasy:requests";
const MAX = 50;

const load = () => { try { return JSON.parse(localStorage.getItem(REQUESTS_KEY) || "[]"); } catch { return []; } };
const save = (list) => { try { localStorage.setItem(REQUESTS_KEY, JSON.stringify(list.slice(0, MAX))); } catch { /* storage unavailable */ } };

// The saved request for one link (by its hash), and ways to update it
export function requestStore(id) {
  const get = () => load().find(x => x.id === id) || {};
  return {
    get,
    // Save (or move to the top) this link, keeping what the reader already chose on it
    remember(entry) {
      const old = get();
      const kept = { paid: old.paid, ...(entry.group && { me: old.me, who: old.who, share: old.share, payer: old.payer }) };
      save([{ ...entry, ...kept, id, savedAt: Date.now() }, ...load().filter(x => x.id !== id)]);
    },
    patch(changes) {
      save(load().map(x => (x.id === id ? { ...x, ...changes } : x)));
    }
  };
}
