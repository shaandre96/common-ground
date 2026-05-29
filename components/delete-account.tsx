"use client";

import { useState, useTransition } from "react";
import { deleteAccount } from "@/app/profile/actions";

// Two-step confirm so a stray click can't wipe an account. On success the
// server action redirects home; we only surface the error path here.
export function DeleteAccount() {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteAccount();
      if (result?.error) setError(result.error);
    });
  }

  return (
    <section className="flex flex-col gap-3 border border-terracotta/30 rounded-sm p-4">
      <h2 className="text-xs uppercase tracking-widest text-terracotta">
        Danger zone
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Deleting your account is permanent. It erases your profile, statements,
        messages, reactions, votes, and reflections. This can't be undone.
      </p>
      {error && <p className="text-sm text-terracotta">{error}</p>}
      {confirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground">
            Delete everything?
          </span>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="text-sm font-medium text-terracotta hover:opacity-80 transition-opacity disabled:opacity-40"
          >
            {pending ? "Deleting…" : "Yes, delete my account"}
          </button>
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="text-sm border border-terracotta/40 text-terracotta px-4 py-2 rounded-sm hover:bg-terracotta/5 transition-colors"
          >
            Delete account
          </button>
        </div>
      )}
    </section>
  );
}
