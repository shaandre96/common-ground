"use client";

/**
 * Stance trajectory chart — two lines (you + partner) plotted across four
 * data points (Before, R1, R2, R3) on a 1–7 y-axis.
 *
 * Editorial style to match the rest of the app: 1px borders, no gradients,
 * dashed reference line at y=4 (unsure), small dots at each data point. The
 * lines draw on and the dots pop in when the chart scrolls into view. Honors
 * prefers-reduced-motion by rendering the final state immediately.
 */

import { motion, useInView, useReducedMotion } from "motion/react";
import { useRef } from "react";

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
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const reduceMotion = useReducedMotion();
  // When reduced motion is requested, show the final state immediately.
  const show = reduceMotion || inView;

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

  // Line draws over ~1s; dots pop in left-to-right roughly as the line front
  // reaches them. The "you" line trails the "them" line slightly.
  const lineTransition = (delay: number) =>
    reduceMotion
      ? { duration: 0 }
      : {
          pathLength: { duration: 1, ease: "easeInOut" as const, delay },
          opacity: { duration: 0.2, delay },
        };
  const dotTransition = (delay: number) =>
    reduceMotion
      ? { duration: 0 }
      : { duration: 0.3, ease: "easeOut" as const, delay };
  const dotStyle = {
    transformBox: "fill-box",
    transformOrigin: "center",
  } as const;

  function dots(t: Trajectory, stroke: string, prefix: string, base: number) {
    return [t.baseline, t.r1, t.r2, t.r3].map((s, i) => (
      <motion.circle
        key={`${prefix}-${i}`}
        cx={x(i)}
        cy={y(s)}
        r="4"
        fill={stroke}
        style={dotStyle}
        initial={reduceMotion ? false : { scale: 0.4, opacity: 0 }}
        animate={show ? { scale: 1, opacity: 1 } : { scale: 0.4, opacity: 0 }}
        transition={dotTransition(base + i * 0.18)}
      />
    ));
  }

  return (
    <div className="w-full flex flex-col gap-3">
      <svg
        ref={ref}
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
        <motion.polyline
          fill="none"
          stroke={themStroke}
          strokeWidth="1.5"
          points={themPoints}
          initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
          animate={
            show ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }
          }
          transition={lineTransition(0)}
        />
        {dots(them, themStroke, "them", 0.25)}

        {/* YOU line + dots (drawn last so it's on top) */}
        <motion.polyline
          fill="none"
          stroke={youStroke}
          strokeWidth="1.5"
          points={youPoints}
          initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
          animate={
            show ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }
          }
          transition={lineTransition(0.12)}
        />
        {dots(you, youStroke, "you", 0.37)}
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
