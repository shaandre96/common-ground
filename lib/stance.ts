/**
 * Pure stance helpers shared by both server and client code. Kept out of
 * `components/stance-slider.tsx` because that file is `"use client"` — server
 * components can render client components but cannot import functions from
 * them.
 */

export type Stance = "agree" | "disagree" | "unsure";

/** Coarse label derived from a 7-point score, or null if no score is set. */
export function stanceFromScore(score: number | null): Stance | null {
  if (score == null) return null;
  if (score >= 5) return "agree";
  if (score <= 3) return "disagree";
  return "unsure";
}

/** Human-readable label for inline display. */
export function scoreLabel(score: number | null): string {
  switch (score) {
    case 1:
      return "strongly disagree";
    case 2:
      return "disagree";
    case 3:
      return "lean disagree";
    case 4:
      return "are unsure";
    case 5:
      return "lean agree";
    case 6:
      return "agree";
    case 7:
      return "strongly agree";
    default:
      return "haven't decided";
  }
}
