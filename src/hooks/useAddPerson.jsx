import { useState } from "react";
import { ConfirmModal } from "../components/ConfirmModal.jsx";
import { matchName, newContactId, tidy } from "../lib/savedPeople.js";

// Adding someone by a typed name, the same way everywhere (People step, Settings):
//   on the saved list        -> onAdd(contact, "saved")
//   only in earlier splits   -> asks "Same Ravi as before?"; Same person -> onAdd(theirContact, "earlier"),
//                               Someone new -> a hint to pick a name that tells them apart
//   anyone else              -> onAdd({ id: new, name }, "new")
// onAdd returns true when the typed name was used (so the input can be cleared).
// Render `dialog` and `hint` where they belong; inputRef gets focus back after "Someone new".
export function useAddPerson({ savedNames, history, onAdd, inputRef }) {
  const [ask, setAsk] = useState(null); // { name, contactId }
  const [hint, setHint] = useState("");

  const submit = (raw) => {
    const name = tidy(raw);
    if (!name) return false;
    setHint("");
    const match = matchName(name, savedNames, history);
    if (match.kind === "saved") return onAdd(match.contact, "saved");
    if (match.kind === "earlier") { setAsk({ name: match.name, contactId: match.contactId }); return false; }
    return onAdd({ id: newContactId(), name }, "new");
  };

  const dialog = ask && (
    <ConfirmModal
      title={`Same ${ask.name} as before?`}
      message={`${ask.name} is in your earlier splits. Is this the same person?`}
      confirmLabel="Same person" cancelLabel="Someone new" tone="accent"
      onConfirm={() => { onAdd({ id: ask.contactId, name: ask.name }, "earlier"); setAsk(null); }}
      onCancel={() => {
        setHint(`To add someone new, give them a name that tells them apart from ${ask.name}, like ${ask.name} K.`);
        setAsk(null);
        setTimeout(() => inputRef?.current?.focus(), 0);
      }}
    />
  );

  return { submit, dialog, hint, clearHint: () => setHint("") };
}
