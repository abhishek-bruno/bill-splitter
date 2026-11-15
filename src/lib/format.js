export const formatDateTime = (ts) => new Intl.DateTimeFormat(undefined, {
  day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit"
}).format(ts);

export const maskKey = (k) => k.length <= 10 ? "••••••" : `${k.slice(0, 4)}••••••${k.slice(-4)}`;

export const newSplitId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
