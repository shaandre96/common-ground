import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scoreLabel, stanceFromScore } from "../../lib/stance";

describe("scoreLabel", () => {
  it("maps each 1-7 score to its label", () => {
    const cases: Array<[number, string]> = [
      [1, "strongly disagree"],
      [2, "disagree"],
      [3, "lean disagree"],
      [4, "are unsure"],
      [5, "lean agree"],
      [6, "agree"],
      [7, "strongly agree"],
    ];
    for (const [score, label] of cases) {
      assert.equal(scoreLabel(score), label);
    }
  });

  it("returns the default label for null", () => {
    assert.equal(scoreLabel(null), "haven't decided");
  });

  it("returns the default label for out-of-range scores", () => {
    assert.equal(scoreLabel(0), "haven't decided");
    assert.equal(scoreLabel(8), "haven't decided");
  });
});

describe("stanceFromScore", () => {
  it("maps scores to coarse stance buckets", () => {
    const cases: Array<[number, "agree" | "disagree" | "unsure"]> = [
      [1, "disagree"],
      [2, "disagree"],
      [3, "disagree"],
      [4, "unsure"],
      [5, "agree"],
      [6, "agree"],
      [7, "agree"],
    ];
    for (const [score, stance] of cases) {
      assert.equal(stanceFromScore(score), stance);
    }
  });

  it("returns null for null", () => {
    assert.equal(stanceFromScore(null), null);
  });

  it("treats the midpoint 4 as 'unsure'", () => {
    assert.equal(stanceFromScore(4), "unsure");
  });
});
