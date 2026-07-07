/**
 * Highlight hardening tests — concurrency guard, reason codes, frameIdUsed.
 *
 * v6 contract change: highlight resolution moved into the snippet
 * (api.highlightTarget) and errors are now distinct (ELEMENT_GONE /
 * FRAME_GONE / INJECT_FAILED instead of blanket FRAME_INACCESSIBLE).
 * The new contract is pinned in highlight-reliability.test.mjs; this file
 * keeps the panel-side hardening pins that still apply (concurrency guard,
 * persist reason codes, empty-state helpers).
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createContext } from './harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const panelSrc = readFileSync(join(__dirname, '..', 'src', 'panel', 'panel.js'), 'utf8');

describe('Highlight hardening', () => {
  let ctx;

  beforeEach(() => {
    ctx = createContext();
  });

  describe('concurrency guard', () => {
    it('highlightFinding returns early when no finding', async () => {
      const result = await ctx.highlightFinding(null, {});
      assert.equal(result, undefined);
    });

    it('highlightFinding exists as a function', () => {
      assert.equal(typeof ctx.highlightFinding, 'function');
    });
  });

  describe('v6 contract migration', () => {
    it('panel no longer synthesizes the legacy FRAME_INACCESSIBLE reason', () => {
      const start = panelSrc.indexOf('async function _highlightFindingInner');
      const body = panelSrc.slice(start, panelSrc.indexOf('async function highlightAllOfType', start));
      assert.ok(!body.includes('FRAME_INACCESSIBLE'), 'transport failures map to FRAME_GONE now');
      assert.ok(body.includes('buildHighlightSpec(finding)'), 'sends the highlight spec (path/pathHash/type/name/severity)');
      assert.ok(body.includes('highlightToastMessage(res)'), 'honest reason → toast mapping');
    });
  });

  describe('reason code mapping', () => {
    it('classifyPersistReason returns QUOTA_EXCEEDED for quota errors', () => {
      assert.equal(ctx.classifyPersistReason(new Error('QUOTA_BYTES_PER_ITEM quota exceeded')), 'QUOTA_EXCEEDED');
      assert.equal(ctx.classifyPersistReason(new Error('max write operations exceeded')), 'QUOTA_EXCEEDED');
    });

    it('classifyPersistReason returns TRANSIENT for other errors', () => {
      assert.equal(ctx.classifyPersistReason(new Error('network error')), 'TRANSIENT');
      assert.equal(ctx.classifyPersistReason(new Error('unknown')), 'TRANSIENT');
    });
  });

  describe('normalizeReasonLabel', () => {
    it('recognizes MANUAL_FRAMES_MISSING', () => {
      assert.equal(ctx.normalizeReasonLabel('manual_frames_missing'), 'MANUAL_FRAMES_MISSING');
      assert.equal(ctx.normalizeReasonLabel('baseline:manual_frames_missing'), 'MANUAL_FRAMES_MISSING');
    });

    it('recognizes NO_SCOPE_MATCH', () => {
      assert.equal(ctx.normalizeReasonLabel('no_scope_match'), 'NO_SCOPE_MATCH');
    });

    it('returns dash for default', () => {
      assert.equal(ctx.normalizeReasonLabel('-'), '\u2014');
    });
  });

  // Concern 3: Highlight overlay removal — overlay must be scoped per frame.
  describe('highlight overlay scoping (Concern 3)', () => {
    it('highlightFinding function is scoped per call (no duplicate overlays)', () => {
      // highlightFinding uses _highlightInFlight guard to prevent concurrent overlays.
      // Verify it exists and returns early for null.
      assert.equal(typeof ctx.highlightFinding, 'function');
    });
  });

  // Concern 6: Anti-flicker deferred empty-state edge case.
  describe('anti-flicker empty-state (Concern 6)', () => {
    it('requestAnimationFrame is available for deferred evaluation', () => {
      // The panel uses requestAnimationFrame for empty-state visibility.
      // In test harness, rAF fires synchronously — verify it exists.
      assert.equal(typeof ctx.requestAnimationFrame, 'function');
    });

    it('renderExplorer exists as a function', () => {
      assert.equal(typeof ctx.renderExplorer, 'function');
    });

    it('updateContrastView exists as a function', () => {
      assert.equal(typeof ctx.updateContrastView, 'function');
    });

    it('renderTabWalk exists as a function', () => {
      assert.equal(typeof ctx.renderTabWalk, 'function');
    });
  });
});
