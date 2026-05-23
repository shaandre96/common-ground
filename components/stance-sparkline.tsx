/**
 * Inline sparkline: a chronological sequence of scores rendered as a tiny
 * connected line with dots. Used on the profile page to show how a user's
 * stance on a single proposition has shifted across conversations.
 */

type Props = {
  points: number[]; // scores in chronological order (1–7)
  width?: number;
  height?: number;
};

export function StanceSparkline({ points, width = 120, height = 32 }: Props) {
  // A single data point ("you have a baseline, haven't moved yet") makes a
  // visually pointless lone dot — especially cramped on mobile. The graph
  // only earns its space once there's actual movement to show.
  if (points.length < 2) return null;

  const padX = 4;
  const padY = 4;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const x = (i: number) => {
    if (points.length === 1) return width / 2;
    return padX + (i * innerW) / (points.length - 1);
  };
  const y = (score: number) => padY + ((7 - score) * innerH) / 6;

  const coords = points.map((s, i) => `${x(i)},${y(s)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
      width={width}
      height={height}
      role="img"
      aria-label={`Stance over ${points.length} data points`}
    >
      <title>Stance over time</title>

      {/* Subtle midline at score 4 (unsure) */}
      <line
        x1={padX}
        x2={width - padX}
        y1={y(4)}
        y2={y(4)}
        stroke="var(--border)"
        strokeWidth="0.5"
        strokeDasharray="2 2"
        opacity="0.6"
      />

      {points.length > 1 && (
        <polyline
          fill="none"
          stroke="var(--foreground)"
          strokeWidth="1.25"
          points={coords}
        />
      )}

      {points.map((s, i) => (
        <circle
          // biome-ignore lint/suspicious/noArrayIndexKey: positional points
          key={i}
          cx={x(i)}
          cy={y(s)}
          r="2.5"
          fill="var(--foreground)"
        />
      ))}
    </svg>
  );
}
