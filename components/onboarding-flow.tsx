"use client";

import { useState } from "react";
import { completeOnboarding } from "@/app/onboarding/actions";
import { StanceSlider } from "@/components/stance-slider";

type Proposition = { id: string; text: string; slug: string };
type Topic = { id: string; name: string; slug: string };
type Group = { topic: Topic; propositions: Proposition[] };

const MIN_PICKS = 3;
const MAX_PICKS = 5;

export function OnboardingFlow({ groups }: { groups: Group[] }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const propositionById = new Map<
    string,
    { proposition: Proposition; topic: Topic }
  >();
  for (const g of groups) {
    for (const p of g.propositions) {
      propositionById.set(p.id, { proposition: p, topic: g.topic });
    }
  }

  const canContinue =
    selected.length >= MIN_PICKS && selected.length <= MAX_PICKS;

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      if (prev.length >= MAX_PICKS) return prev;
      return [...prev, id];
    });
  }

  function setScore(id: string, score: number) {
    setScores((prev) => ({ ...prev, [id]: score }));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);

    const payload = selected.map((id) => ({
      propositionId: id,
      score: scores[id] ?? null,
    }));

    const result = await completeOnboarding(payload);
    if (result?.error) {
      setError(result.error);
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-2xl flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <span className="text-xs uppercase tracking-widest text-terracotta">
          Step {step} of 2
        </span>
        <h1 className="font-serif text-3xl md:text-4xl">
          {step === 1 ? "What do you stand for?" : "Where do you stand?"}
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {step === 1
            ? `Pick ${MIN_PICKS} to ${MAX_PICKS} statements you'd want to discuss with someone who sees them differently.`
            : "Set your current position on each. Optional — you can leave any unset and decide in the conversation."}
        </p>
      </div>

      {step === 1 && (
        <>
          <div className="flex flex-col gap-8">
            {groups.map((g) => (
              <section key={g.topic.id} className="flex flex-col gap-3">
                <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
                  {g.topic.name}
                </h2>
                <div className="flex flex-col gap-2">
                  {g.propositions.map((p) => {
                    const isSelected = selected.includes(p.id);
                    const atLimit = selected.length >= MAX_PICKS;
                    const base =
                      "text-left text-sm leading-relaxed border px-4 py-3 rounded-sm transition-colors";
                    const cls = isSelected
                      ? `${base} bg-foreground text-primary-foreground border-foreground`
                      : `${base} border-border hover:bg-sand-dark disabled:opacity-40 disabled:hover:bg-transparent`;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggle(p.id)}
                        disabled={!isSelected && atLimit}
                        className={cls}
                      >
                        {p.text}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-border pt-6 sticky bottom-0 bg-background py-4">
            <span className="text-sm text-muted-foreground">
              {selected.length} / {MAX_PICKS} selected
              {selected.length < MIN_PICKS && ` · pick at least ${MIN_PICKS}`}
            </span>
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!canContinue}
              className="text-sm bg-foreground text-primary-foreground px-5 py-2.5 rounded-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div className="flex flex-col gap-6">
            {selected.map((id) => {
              const entry = propositionById.get(id);
              if (!entry) return null;
              const { proposition, topic } = entry;
              return (
                <div
                  key={id}
                  className="flex flex-col gap-3 border border-border rounded-sm p-4"
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-widest text-muted-foreground">
                      {topic.name}
                    </span>
                    <p className="text-sm leading-relaxed">
                      {proposition.text}
                    </p>
                  </div>
                  <StanceSlider
                    value={scores[id] ?? null}
                    onChange={(v) => setScore(id, v)}
                    size="compact"
                  />
                </div>
              );
            })}
          </div>

          {error && <p className="text-sm text-terracotta">{error}</p>}

          <div className="flex items-center justify-between border-t border-border pt-6">
            <button
              type="button"
              onClick={() => setStep(1)}
              disabled={submitting}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="text-sm bg-foreground text-primary-foreground px-5 py-2.5 rounded-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Finish"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
