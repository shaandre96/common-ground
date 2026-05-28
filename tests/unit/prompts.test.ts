import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_MESSAGES, promptFor, STAGES, stageById } from "../../lib/prompts";

describe("STAGES", () => {
  it("has three rounds named Opening / Deepening / Closing", () => {
    assert.deepEqual(
      STAGES.map((s) => s.name),
      ["Opening", "Deepening", "Closing"],
    );
  });

  it("has strictly increasing message thresholds", () => {
    const t = STAGES.map((s) => s.endAtMessages);
    for (let i = 1; i < t.length; i++) {
      assert.ok(t[i] > t[i - 1], `threshold ${t[i]} should exceed ${t[i - 1]}`);
    }
  });

  it("has at least 3 prompts per stage", () => {
    for (const stage of STAGES) {
      assert.ok(stage.prompts.length >= 3, `${stage.name} has < 3 prompts`);
    }
  });

  it("exposes MAX_MESSAGES equal to the final threshold", () => {
    assert.equal(MAX_MESSAGES, STAGES[STAGES.length - 1].endAtMessages);
  });
});

describe("stageById", () => {
  it("returns the matching stage for valid ids", () => {
    assert.equal(stageById(1).name, "Opening");
    assert.equal(stageById(2).name, "Deepening");
    assert.equal(stageById(3).name, "Closing");
  });

  it("falls back to stage 1 for an unknown id", () => {
    assert.equal(stageById(99).id, 1);
    assert.equal(stageById(0).id, 1);
  });
});

describe("promptFor", () => {
  it("is deterministic for the same (stage, matchId)", () => {
    const matchId = "11111111-1111-1111-1111-111111111111";
    for (const stage of STAGES) {
      assert.equal(promptFor(stage, matchId), promptFor(stage, matchId));
    }
  });

  it("returns a prompt from the stage's pool", () => {
    const matchId = "deadbeef-dead-beef-dead-beefdeadbeef";
    for (const stage of STAGES) {
      assert.ok(stage.prompts.includes(promptFor(stage, matchId)));
    }
  });

  it("varies across different match ids", () => {
    const stage = STAGES[0];
    const results = new Set<string>();
    for (let i = 0; i < 50; i++) {
      results.add(promptFor(stage, `match-${i}`));
    }
    assert.ok(results.size > 1, "expected more than one distinct prompt");
  });
});
