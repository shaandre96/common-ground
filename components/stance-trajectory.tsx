/**
 * Stance trajectory chart — two lines (you + partner) plotted across four
 * data points (Before, R1, R2, R3) on a 1–7 y-axis. Pure server-rendered SVG.
 *
 * Editorial style to match the rest of the app: 1px borders, no gradients,
 * dashed reference line at y=4 (unsure), small dots at each data point.
 */

type Trajectory = {
  baseline: number;
  r1: number;
  r2: number;
  r3: number;
};

export function StanceTrajectory({
  you,
  them,
}: {
  you: Trajectory;
  them: Trajectory;
}) {
  // viewBox math
  const W = 340;
  const H = 200;
  const padL = 40;
  const padR = 20;
  const padT = 20;
  const padB = 40;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  // x positions for 4 data points (0..3)
  const x = (i: number) => padL + (i * innerW) / 3;
  // y positions for scores (7 at top, 1 at bottom)
  const y = (score: number) => padT + ((7 - score) * innerH) / 6;

  function pointsFor(t: Trajectory): string {
    return `${x(0)},${y(t.baseline)} ${x(1)},${y(t.r1)} ${x(2)},${y(t.r2)} ${x(3)},${y(t.r3)}`;
  }

  const youPoints = pointsFor(you);
  const themPoints = pointsFor(them);

  // Grid line styling
  const gridStroke = "var(--border)";
  // Brand line colors
  const youStroke = "var(--foreground)";
  const themStroke = "var(--terracotta)";

  const xLabels = ["Before", "R1", "R2", "R3"];

  return (
    <div className="w-full flex flex-col gap-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label="Stance trajectory chart showing both participants' scores across four points"
      >
        <title>Stance trajectory</title>

        {/* Y-axis labels + horizontal grid */}
        {[1, 2, 3, 4, 5, 6, 7].map((s) => (
          <g key={s}>
            <line
              x1={padL}
              x2={W - padR}
              y1={y(s)}
              y2={y(s)}
              stroke={gridStroke}
              strokeWidth={s === 4 ? 1 : 0.5}
              strokeDasharray={s === 4 ? "3 3" : undefined}
              opacity={s === 4 ? 0.6 : 0.3}
            />
            <text
              x={padL - 8}
              y={y(s) + 3}
              textAnchor="end"
              fontSize="10"
              fill="var(--muted-foreground)"
            >
              {s}
            </text>
          </g>
        ))}

        {/* X-axis labels */}
        {xLabels.map((label, i) => (
          <text
            // biome-ignore lint/suspicious/noArrayIndexKey: static label array
            key={i}
            x={x(i)}
            y={H - padB + 16}
            textAnchor="middle"
            fontSize="10"
            fill="var(--muted-foreground)"
            className="uppercase tracking-widest"
          >
            {label}
          </text>
        ))}

        {/* THEM line + dots */}
        <polyline
          fill="none"
          stroke={themStroke}
          strokeWidth="1.5"
          points={themPoints}
        />
        {[them.baseline, them.r1, them.r2, them.r3].map((s, i) => (
          <circle
            // biome-ignore lint/suspicious/noArrayIndexKey: positional points
            key={`them-${i}`}
            cx={x(i)}
            cy={y(s)}
            r="4"
            fill={themStroke}
          />
        ))}

        {/* YOU line + dots (drawn last so it's on top) */}
        <polyline
          fill="none"
          stroke={youStroke}
          strokeWidth="1.5"
          points={youPoints}
        />
        {[you.baseline, you.r1, you.r2, you.r3].map((s, i) => (
          <circle
            // biome-ignore lint/suspicious/noArrayIndexKey: positional points
            key={`you-${i}`}
            cx={x(i)}
            cy={y(s)}
            r="4"
            fill={youStroke}
          />
        ))}
      </svg>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{ background: "var(--foreground)" }}
          />
          <span>You</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{ background: "var(--terracotta)" }}
          />
          <span>Them</span>
        </div>
      </div>
    </div>
  );
}
