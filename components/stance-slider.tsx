"use client";

type Props = {
  value: number | null;
  onChange: (value: number) => void;
  disabled?: boolean;
  size?: "default" | "compact";
};

const VALUES = [1, 2, 3, 4, 5, 6, 7] as const;

/**
 * 7-point Likert slider rendered as segmented buttons. Used in onboarding,
 * round vote panels, and (eventually) the results view.
 */
export function StanceSlider({
  value,
  onChange,
  disabled,
  size = "default",
}: Props) {
  const buttonHeight = size === "compact" ? "py-2" : "py-3";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
        <span>Strongly disagree</span>
        <span>Unsure</span>
        <span>Strongly agree</span>
      </div>
      <div className="flex gap-1">
        {VALUES.map((v) => {
          const isSelected = value === v;
          const cls = isSelected
            ? `flex-1 border border-foreground bg-foreground text-primary-foreground ${buttonHeight} rounded-sm text-sm font-medium transition-colors`
            : `flex-1 border border-border ${buttonHeight} rounded-sm text-sm hover:bg-sand-dark transition-colors disabled:opacity-40 disabled:hover:bg-transparent`;
          return (
            <button
              key={v}
              type="button"
              onClick={() => onChange(v)}
              disabled={disabled}
              className={cls}
              aria-label={`Stance ${v} of 7`}
              aria-pressed={isSelected}
            >
              {v}
            </button>
          );
        })}
      </div>
    </div>
  );
}
