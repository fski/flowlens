/**
 * Hash-route navigation detection — microfrontends like the DH help center
 * (helpcenter-webclient…usehurrier.com) navigate exclusively via the URL
 * fragment (`#?screen=…`, `#/route`). Two gaps hid every such step:
 *
 * 1. The SW nav port only watched onHistoryStateUpdated + onCommitted;
 *    pure fragment changes fire onReferenceFragmentUpdated, which nobody
 *    subscribed to — zero FRAME_NAV/SPA_NAV events reached the panel.
 * 2. classifyNavForCapture rejected every hash-only change as an in-page
 *    anchor. Route-like hashes (#/…, #!…, #?…, key=value) are real steps;
 *    plain anchors (#section) stay rejected.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createContext } from "./harness.mjs";
import { createSwContext } from "./sw-harness.mjs";

// ── classifyNavForCapture: route-like hash handling ─────────────────────

describe("classifyNavForCapture hash routes", () => {
  const ctx = createContext();
  const f = ctx.classifyNavForCapture;

  it("accepts a #/path route change (hash router)", () => {
    assert.equal(f("https://x.com/a#/contact", "https://x.com/a#/home"), true);
  });

  it("accepts a #!/path route change (hashbang router)", () => {
    assert.equal(f("https://x.com/a#!/step2", "https://x.com/a#!/step1"), true);
  });

  it("accepts a #?param route change (DH helpcenter pattern)", () => {
    assert.equal(
      f("https://hc.usehurrier.com/?g=1#?screen=contact&user_id=x", "https://hc.usehurrier.com/?g=1#?screen=home&user_id=x"),
      true,
    );
  });

  it("accepts entering a hash route from no hash", () => {
    assert.equal(f("https://x.com/a#/contact", "https://x.com/a"), true);
  });

  it("accepts leaving a hash route back to no hash", () => {
    assert.equal(f("https://x.com/a", "https://x.com/a#/contact"), true);
  });

  it("still rejects plain in-page anchors", () => {
    assert.equal(f("https://x.com/a#section2", "https://x.com/a#section1"), false);
    assert.equal(f("https://x.com/a#top", "https://x.com/a"), false);
  });

  it("still rejects identical urls", () => {
    assert.equal(f("https://x.com/a#/contact", "https://x.com/a#/contact"), false);
  });
});

// ── SW nav port: onReferenceFragmentUpdated forwarding ──────────────────

function mkEvent() {
  const listeners = [];
  return {
    addListener: (fn) => listeners.push(fn),
    removeListener: (fn) => {
      const i = listeners.indexOf(fn);
      if (i !== -1) listeners.splice(i, 1);
    },
    fire: (details) => listeners.slice().forEach((fn) => fn(details)),
    count: () => listeners.length,
  };
}

function connectNavPort() {
  const connectHandlers = [];
  const webNavEvents = {
    onHistoryStateUpdated: mkEvent(),
    onCommitted: mkEvent(),
    onReferenceFragmentUpdated: mkEvent(),
  };
  createSwContext({
    onConnect: { addListener: (fn) => connectHandlers.push(fn) },
    webNavEvents,
  });
  assert.equal(connectHandlers.length, 1, "nav-port onConnect handler registered");
  const messages = [];
  let onMsg = null;
  const port = {
    name: "flowlens-nav",
    onMessage: { addListener: (fn) => { onMsg = fn; } },
    onDisconnect: { addListener: () => {} },
    postMessage: (m) => messages.push(m),
  };
  connectHandlers[0](port);
  onMsg({ tabId: 5 });
  return { webNavEvents, messages };
}

describe("SW nav port fragment routing", () => {
  it("forwards top-level fragment changes as SPA_NAV", () => {
    const { webNavEvents, messages } = connectNavPort();
    webNavEvents.onReferenceFragmentUpdated.fire({ tabId: 5, frameId: 0, url: "https://x.com/a#/contact" });
    assert.deepEqual(JSON.parse(JSON.stringify(messages)), [{ type: "SPA_NAV", url: "https://x.com/a#/contact" }]);
  });

  it("forwards subframe fragment changes as FRAME_NAV (MFE hash router)", () => {
    const { webNavEvents, messages } = connectNavPort();
    webNavEvents.onReferenceFragmentUpdated.fire({ tabId: 5, frameId: 7, url: "https://hc.usehurrier.com/#?screen=contact" });
    assert.deepEqual(JSON.parse(JSON.stringify(messages)), [{ type: "FRAME_NAV", url: "https://hc.usehurrier.com/#?screen=contact", frameId: 7 }]);
  });

  it("ignores fragment changes from other tabs", () => {
    const { webNavEvents, messages } = connectNavPort();
    webNavEvents.onReferenceFragmentUpdated.fire({ tabId: 6, frameId: 0, url: "https://x.com/a#/x" });
    assert.equal(messages.length, 0);
  });

  it("unsubscribes on disconnect", () => {
    const connectHandlers = [];
    const webNavEvents = {
      onHistoryStateUpdated: mkEvent(),
      onCommitted: mkEvent(),
      onReferenceFragmentUpdated: mkEvent(),
    };
    createSwContext({ onConnect: { addListener: (fn) => connectHandlers.push(fn) }, webNavEvents });
    let onDisconnect = null;
    const port = {
      name: "flowlens-nav",
      onMessage: { addListener: () => {} },
      onDisconnect: { addListener: (fn) => { onDisconnect = fn; } },
      postMessage: () => {},
    };
    connectHandlers[0](port);
    assert.equal(webNavEvents.onReferenceFragmentUpdated.count(), 1, "subscribed on connect");
    onDisconnect();
    assert.equal(webNavEvents.onReferenceFragmentUpdated.count(), 0, "unsubscribed on disconnect");
  });
});
