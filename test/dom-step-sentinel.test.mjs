/**
 * DOM-step sentinel — auto-capture for embedded widgets that navigate WITHOUT
 * touching the URL at all (Intercom Messenger, Zendesk messaging widget,
 * LiveChat/text.com — all DOM-state-only iframes). The panel polls a cheap
 * "screen fingerprint" of the audited frames (headings + visible action
 * labels + landmark skeleton, EXCLUDING live/log/feed subtrees so chat
 * messages never look like steps) and captures a step once a NEW fingerprint
 * holds stable for consecutive polls.
 *
 * decideDomStepAction is the pure decision core (pattern R2 — testable
 * outside the wireup); the SW side is a validated PROBE_DOM_FINGERPRINT
 * message handled per-frame so one dead frame can't sink the whole probe.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createContext } from "./harness.mjs";
import { createSwContext } from "./sw-harness.mjs";

// ── decideDomStepAction ─────────────────────────────────────────────────

describe("decideDomStepAction", () => {
  const ctx = createContext();
  const f = ctx.decideDomStepAction;
  const fresh = () => ({ baselineFp: null, candidateFp: null, candidateCount: 0, lastCaptureAt: 0, lastStepCount: 0 });

  it("adopts the first fingerprint as baseline without capturing", () => {
    const r = f("fpA", fresh(), 1, 10_000);
    assert.equal(r.action, "adopt");
    assert.equal(r.state.baselineFp, "fpA");
  });

  it("re-adopts silently after any captured step (URL nav must not double-fire)", () => {
    const s = { ...fresh(), baselineFp: "fpA", lastStepCount: 1 };
    const r = f("fpB", s, 2, 10_000);
    assert.equal(r.action, "adopt");
    assert.equal(r.state.baselineFp, "fpB");
    assert.equal(r.state.lastStepCount, 2);
  });

  it("does nothing while the fingerprint matches baseline", () => {
    const s = { ...fresh(), baselineFp: "fpA", lastStepCount: 1 };
    const r = f("fpA", s, 1, 10_000);
    assert.equal(r.action, "none");
  });

  it("waits for stability before capturing a new screen", () => {
    let s = { ...fresh(), baselineFp: "fpA", lastStepCount: 1 };
    let r = f("fpB", s, 1, 10_000);
    assert.equal(r.action, "wait", "first sighting arms the candidate");
    r = f("fpB", r.state, 1, 11_200);
    assert.equal(r.action, "capture", "second identical poll confirms the screen");
    assert.equal(r.state.baselineFp, "fpB", "captured screen becomes the new baseline");
    assert.equal(r.state.lastCaptureAt, 11_200);
  });

  it("never captures a churning screen (carousel / animation)", () => {
    let s = { ...fresh(), baselineFp: "fpA", lastStepCount: 1 };
    for (let i = 0; i < 10; i++) {
      const r = f("fp" + i, s, 1, 10_000 + i * 1200);
      assert.notEqual(r.action, "capture", `poll ${i} must not capture`);
      s = r.state;
    }
  });

  it("returning to baseline disarms the candidate", () => {
    let s = { ...fresh(), baselineFp: "fpA", lastStepCount: 1 };
    s = f("fpB", s, 1, 10_000).state;
    const r = f("fpA", s, 1, 11_200);
    assert.equal(r.action, "none");
    assert.equal(r.state.candidateFp, null);
  });

  it("enforces a minimum gap between DOM-step captures", () => {
    let s = { ...fresh(), baselineFp: "fpA", lastStepCount: 1, lastCaptureAt: 10_000 };
    s = f("fpB", s, 1, 11_000).state;
    const r = f("fpB", s, 1, 12_200); // stable, but only 2.2s after last capture
    assert.equal(r.action, "skip-gap");
    const r2 = f("fpB", r.state, 1, 14_500);
    assert.equal(r2.action, "capture");
  });
});

// ── SW: PROBE_DOM_FINGERPRINT ───────────────────────────────────────────

function swValidate(msg) {
  const ctx = createSwContext();
  return ctx.__validateIncomingMessage(msg, { id: "test-extension-id" });
}

describe("PROBE_DOM_FINGERPRINT validation", () => {
  it("accepts a well-formed probe", () => {
    assert.equal(swValidate({ type: "PROBE_DOM_FINGERPRINT", tabId: 3, frameIds: [0, 7] }).ok, true);
  });

  it("requires a tabId", () => {
    assert.equal(swValidate({ type: "PROBE_DOM_FINGERPRINT", frameIds: [0] }).ok, false);
  });

  it("rejects non-array / oversized / non-int frameIds", () => {
    assert.equal(swValidate({ type: "PROBE_DOM_FINGERPRINT", tabId: 3, frameIds: "0" }).ok, false);
    assert.equal(swValidate({ type: "PROBE_DOM_FINGERPRINT", tabId: 3, frameIds: [-1] }).ok, false);
    assert.equal(swValidate({ type: "PROBE_DOM_FINGERPRINT", tabId: 3, frameIds: Array.from({ length: 51 }, (_, i) => i) }).ok, false);
  });
});

describe("probeDomFingerprints handler", () => {
  it("returns per-frame fingerprints and survives a dead frame", async () => {
    const ctx = createSwContext({
      executeScript: (opts) => {
        const frameId = opts.target.frameIds[0];
        if (frameId === 9) return Promise.reject(new Error("No frame with id 9"));
        return Promise.resolve([{ frameId, result: `fp-of-${frameId}` }]);
      },
    });
    const out = await ctx.__probeDomFingerprints({ tabId: 3, frameIds: [0, 9, 7] });
    assert.deepEqual(JSON.parse(JSON.stringify(out)), {
      ok: true,
      frames: [
        { frameId: 0, fp: "fp-of-0" },
        { frameId: 9, fp: null },
        { frameId: 7, fp: "fp-of-7" },
      ],
    });
  });
});

// ── wireup + fingerprint wiring guards (source scan) ────────────────────

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));
const WIREUP_SRC = readFileSync(join(__dirname, "..", "src", "panel", "panel-90-wireup.js"), "utf8");
const SW_SRC = readFileSync(join(__dirname, "..", "src", "sw", "sw.js"), "utf8");

describe("dom-step wiring", () => {
  const poller = WIREUP_SRC.slice(WIREUP_SRC.indexOf("function pollDomStep"), WIREUP_SRC.indexOf("setInterval(pollDomStep"));
  const afterAwait = poller.slice(poller.indexOf("PROBE_DOM_FINGERPRINT"));

  it("poller is guarded by session, Auto toggle and in-flight state", () => {
    assert.match(WIREUP_SRC, /PROBE_DOM_FINGERPRINT/);
    for (const guard of ["sessionState.current", "autoCaptureNav", "sessionState.inFlight", "autoCapturePending", "state.running", "_domPollBusy"]) {
      assert.match(poller, new RegExp(guard), `poller must check ${guard}`);
    }
  });

  it("re-checks busy state and session identity AFTER the probe await (TOCTOU: queued duplicate step)", () => {
    assert.match(afterAwait, /_pollSessionId/, "session-id guard must run after the await");
    assert.match(afterAwait, /sessionState\.inFlight/, "inFlight re-check must run after the await");
    assert.match(afterAwait, /autoCapturePending/, "debounce re-check must run after the await");
  });

  it("applies the foreign-site privacy skip before capturing", () => {
    assert.match(afterAwait, /isForeignAutoCaptureOrigin/, "sentinel must honor the 2026-07-20 privacy decision");
    assert.match(afterAwait, /dom-step-skip-foreign/, "and log the skip (fail loud)");
  });

  it("labels the step against the BASELINE frame map, not the previous poll", () => {
    assert.match(afterAwait, /baselineByFrame/, "previous poll equals the current one at capture time by construction");
  });

  it("fingerprint excludes live/log/feed subtrees and carries no URL", () => {
    const fpFn = SW_SRC.slice(SW_SRC.indexOf("function computeDomFingerprint"), SW_SRC.indexOf("// ──────── End DOM step fingerprint"));
    assert.match(fpFn, /role='log'|role="log"/);
    assert.match(fpFn, /aria-live='polite'/, "bare [aria-live] would also exclude aria-live=off (means NOT live)");
    assert.doesNotMatch(fpFn, /location\.href/, "a URL field would resurrect every nav the URL pipeline deliberately rejects");
  });
});
