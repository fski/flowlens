/**
 * MODES registry — single source of per-mode metadata.
 * Guards completeness: adding a mode with a missing field previously meant
 * hunting six scattered lookup tables (MODE_LABELS, MODE_COLORS, DURATIONS,
 * PROGRESS_LABELS, SNAP_CTA, SNAP_CTA_RERUN); now one incomplete entry here
 * is a test failure.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import { createContext } from "./harness.mjs";

describe("MODES registry", () => {
  const ctx = createContext();
  new Script("this.__MODES = MODES;", { filename: "expose-modes.js" }).runInContext(ctx);
  const MODES = ctx.__MODES;

  it("covers exactly the five audit modes", () => {
    assert.deepEqual(Object.keys(MODES).sort(), ["contrast", "observe", "run", "tabWalk", "watch"]);
  });

  it("every mode entry is complete", () => {
    for (const [mode, m] of Object.entries(MODES)) {
      assert.ok(m.label && typeof m.label === "string", `${mode}.label`);
      assert.ok(m.color && typeof m.color === "string", `${mode}.color`);
      assert.ok(Number.isFinite(m.duration) && m.duration > 0, `${mode}.duration`);
      assert.ok(m.progressLabel, `${mode}.progressLabel`);
      assert.ok(m.busyLabel, `${mode}.busyLabel`);
      assert.ok(m.cta && m.cta.label && m.cta.rerun && m.cta.cls && m.cta.helper, `${mode}.cta complete`);
      assert.match(m.cta.cls, /^ctaBtn--/, `${mode}.cta.cls is a ctaBtn modifier`);
    }
  });

  it("modeLabel() resolves through the registry with a safe fallback", () => {
    assert.equal(ctx.modeLabel("tabWalk"), MODES.tabWalk.label);
    assert.equal(ctx.modeLabel("nonsense"), "nonsense");
    assert.equal(ctx.modeLabel(undefined), "run");
  });
});
