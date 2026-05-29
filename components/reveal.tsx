"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  /** Delay before the reveal starts, in seconds. Use for staggering siblings. */
  delay?: number;
  /** Distance the element rises from, in px. */
  y?: number;
  /** Animate on mount instead of when scrolled into view. */
  immediate?: boolean;
};

// Subtle fade-up reveal. Triggers once when scrolled into view (or on mount
// when `immediate`). Honors prefers-reduced-motion by rendering statically.
export function Reveal({
  children,
  className,
  delay = 0,
  y = 8,
  immediate = false,
}: Props) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  const shown = { opacity: 1, y: 0 };

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      {...(immediate
        ? { animate: shown }
        : {
            whileInView: shown,
            viewport: { once: true, margin: "0px 0px -10% 0px" },
          })}
    >
      {children}
    </motion.div>
  );
}
