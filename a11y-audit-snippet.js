/**
 * A11YFlowAudit — console snippet for quick WCAG-ish audits (with chat/help-center specifics) by @fski
 *
 * What it is
 * - A single, paste-once snippet you can share with the team.
 * - Runs lightweight static checks (names/labels/aria refs/headings/landmarks/tabindex, etc.)
 * - Adds flow checks for loader chains + focus loss (great for “multiple loaders in a row” pain).
 * - Adds chat-aware “soft” checks: role=log behavior + aria-live/status hook detection (so we don’t shout
 *   about missing aria-live if you’re doing manual announcements via a hidden live region).
 * - Includes a heuristic keyboard order walk + an approximate contrast scan.
 *
 * What it is NOT
 * - Not a replacement for axe/Lighthouse/manual testing.
 * - Contrast scan is approximate (won’t handle gradients/images perfectly).
 * - tabWalk is heuristic (still catches many real-world issues: focus falling to body, focus failures, etc.)
 *
 * How to use (copy/paste once in DevTools Console)
 * 1) Paste this whole snippet and hit Enter. You should see:
 *    ✅ A11YFlowAudit installed ...
 *
 * 2) Run a static audit any time:
 *    A11YFlowAudit.run({ strict: true })
 *
 * 3) During loader-heavy flows, run flow monitors:
 *    A11YFlowAudit.observe({ seconds: 12 })   // reruns checks every ~900ms for 12s
 *    A11YFlowAudit.watch({ seconds: 40 })     // measures loader bursts, silent loading, focus loss
 *
 * 4) Keyboard focus heuristic:
 *    A11YFlowAudit.tabWalk({ steps: 80 })
 *
 * 5) Approx contrast scan:
 *    A11YFlowAudit.contrastScan({ limit: 250 })
 *
 * Output
 * - Each command prints a table summary + logs raw data.
 * - Latest result objects are stored on:
 *   A11YFlowAudit.last / lastObserved / lastWatch / lastTabWalk / lastContrast
 *
 * Tips for your environment (iframe / microfrontend)
 * - If you open the “direct iframe URL”, that page is the iframe content (inIframe=false). This script still works.
 * - If you’re inside a parent page that embeds an iframe, you can only audit inside the iframe if same-origin and
 *   you run the snippet in the iframe’s DevTools context.
 *
 * Questions? If you must, reach me on Slack @fski.
 */
(() => {
  const KEY = "A11YFlowAudit";
  const w = window;
  const doc = document;

  // ---------------- utils ----------------
  const isEl = (x) => x && x.nodeType === 1;
  const txt = (s, n = 140) => (s || "").replace(/\s+/g, " ").trim().slice(0, n);
  const html = (el, n = 240) => (el?.outerHTML || "").replace(/\s+/g, " ").trim().slice(0, n);
  const nowIso = () => new Date().toISOString();

  const testId = (el) =>
    el?.getAttribute?.("data-testid") ||
    el?.closest?.("[data-testid]")?.getAttribute("data-testid") ||
    null;

  const cssPath = (el) => {
    if (!isEl(el)) return "";
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 9) {
      const id = node.id ? `#${CSS.escape(node.id)}` : "";
      const cls =
        node.classList && node.classList.length
          ? "." + [...node.classList].slice(0, 2).map(c => CSS.escape(c)).join(".")
          : "";
      let nth = "";
      if (!id) {
        const p = node.parentElement;
        if (p) {
          const sib = [...p.children].filter(c => c.tagName === node.tagName);
          if (sib.length > 1) nth = `:nth-of-type(${sib.indexOf(node) + 1})`;
        }
      }
      parts.unshift(`${node.tagName.toLowerCase()}${id}${cls}${nth}`);
      if (id) break;
      node = node.parentElement;
    }
    return parts.join(" > ");
  };

  const isHidden = (el) => {
    if (!isEl(el)) return true;
    if (el.hidden) return true;
    const s = w.getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") return true;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return true;
    return false;
  };

  const uniqBy = (arr, k) => {
    const seen = new Set();
    return arr.filter(x => {
      const key = k(x);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const getAccName = (el) => {
    if (!isEl(el)) return "";
    const aria = el.getAttribute("aria-label");
    if (aria?.trim()) return aria.trim();
    const labelledby = el.getAttribute("aria-labelledby");
    if (labelledby) {
      const t = labelledby
        .split(/\s+/)
        .map(id => doc.getElementById(id))
        .filter(Boolean)
        .map(n => n.textContent)
        .join(" ");
      if (t.trim()) return t.trim();
    }
    if ("labels" in el && el.labels && el.labels.length) {
      const lbl = [...el.labels].map(l => l.textContent).join(" ");
      if (lbl.trim()) return lbl.trim();
    }
    const title = el.getAttribute("title");
    if (title?.trim()) return title.trim();
    if (el.tagName === "IMG") {
      const alt = el.getAttribute("alt");
      if (alt?.trim()) return alt.trim();
    }
    const ph = el.getAttribute("placeholder");
    if (ph?.trim()) return `[placeholder] ${ph.trim()}`;
    return txt(el.textContent, 160) || "";
  };

  const add = (findings, { type, el, severity = "low", wcag = null, product = null, note = null, extra = null }) => {
    findings.push({
      type,
      severity,
      wcag,
      product,
      name: el ? getAccName(el) : null,
      role: el?.getAttribute?.("role") || null,
      tag: el?.tagName || null,
      testId: el ? testId(el) : null,
      path: el ? cssPath(el) : null,
      html: el ? html(el) : null,
      note,
      extra
    });
  };

  const hasAnnouncementHook = () =>
    !!doc.querySelector("[aria-live='polite'],[aria-live='assertive'],[role='status'],[role='alert']");

  const sanity = () => {
    const q = (sel) => doc.querySelectorAll(sel).length;
    return {
      href: w.location.href,
      inIframe: w.self !== w.top,
      focusables: q("button,a,input,textarea,select,[tabindex],[role='button'],[role='link']"),
      iframes: q("iframe"),
      ariaLiveHooks: q("[aria-live='polite'],[aria-live='assertive'],[role='status'],[role='alert']"),
      roleLog: q("[role='log']"),
      ariaBusy: q("[aria-busy='true']"),
      progressbar: q("[role='progressbar']"),
      dialogs: q("[role='dialog'],[role='alertdialog'],dialog"),
      regions: q("[role='region']"),
      landmarks: q("main,nav,header,footer,aside,[role='main'],[role='navigation'],[role='banner'],[role='contentinfo'],[role='complementary']"),
      headings: q("h1,h2,h3,h4,h5,h6"),
      appMarkers: q("[data-testid^='GST_CHAT__'], #GST_CHAT__FEED, [data-testid*='HELP'], [data-testid*='HC']"),
      shadowRoots: (() => { let n = 0; for (const el of doc.querySelectorAll("*")) { if (el.shadowRoot) n++; if (n >= 50) break; } return n; })()
    };
  };

  // Mode detection — ARIA/role patterns first, product-specific testIds as fallback.
  // Override via A11YFlowAudit.modeHints before running.
  const modeHints = {
    chat: {
      roles: ["[role='log']"],
      testIds: ["[data-testid^='GST_CHAT__']", "#GST_CHAT__FEED"],
      url: null,
    },
    "helpcenter-bot": {
      roles: [],
      testIds: ["[data-testid*='conversational']", "[data-testid*='BOT']"],
      url: /new-conversation/i,
    },
    "helpcenter-tree": {
      roles: ["[role='tree']", "[role='treeitem']"],
      testIds: ["[data-testid*='TREE']"],
      url: null,
    },
  };

  const detectMode = () => {
    for (const [mode, hints] of Object.entries(modeHints)) {
      if (hints.url && hints.url.test(w.location.href)) return mode;
      const sels = [...(hints.roles || []), ...(hints.testIds || [])];
      if (sels.length && doc.querySelector(sels.join(","))) return mode;
    }
    return "auto";
  };

  const looksLikeLoader = (el) => {
    if (!isEl(el) || isHidden(el)) return false;
    const role = el.getAttribute("role");
    if (role === "progressbar" || role === "status") return true;
    if (el.getAttribute("aria-busy") === "true") return true;
    const s = `${(el.className || "").toString()} ${el.id || ""} ${testId(el) || ""}`.toLowerCase();
    if (/(loader|loading|spinner|skeleton|progress|shimmer)/.test(s)) return true;
    const t = txt(el.textContent, 50).toLowerCase();
    if (/(loading|please wait|connecting|fetching)/.test(t)) return true;
    // CSS animation/transition detection (spinner/skeleton patterns)
    try {
      const cs = w.getComputedStyle(el);
      const anim = (cs.animationName || "").toLowerCase();
      if (anim !== "none" && /(spin|rotate|pulse|shimmer|skeleton|loading|bounce)/.test(anim)) return true;
      const tp = (cs.transitionProperty || "").toLowerCase();
      if (tp && tp !== "none" && tp !== "all" && /(transform|opacity|width|height)/.test(tp)) {
        const dur = parseFloat(cs.transitionDuration) || 0;
        if (dur >= 0.3 && dur <= 5) return true;
      }
    } catch {}
    // Empty container with fixed dimensions and background (skeleton pattern)
    if (!el.textContent?.trim() && el.children.length === 0) {
      const r = el.getBoundingClientRect();
      if (r.width > 40 && r.height > 10 && r.height < 200) {
        try {
          const cs = w.getComputedStyle(el);
          if (cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent") return true;
        } catch {}
      }
    }
    return false;
  };

  // ---------------- focusables (for tabWalk) ----------------
  const focusableSelector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "textarea:not([disabled])",
    "select:not([disabled])",
    "[role='button']",
    "[role='link']",
    "[tabindex]"
  ].join(",");

  const isFocusable = (el) => {
    if (!isEl(el) || isHidden(el)) return false;
    if (el.hasAttribute("disabled")) return false;
    const ti = el.getAttribute("tabindex");
    if (ti !== null) {
      const v = parseInt(ti, 10);
      if (Number.isFinite(v) && v < 0) return false;
    }
    if ((el.getAttribute("aria-disabled") || "").toLowerCase() === "true") return false;
    return true;
  };

  const getTabIndex = (el) => {
    const ti = el.getAttribute("tabindex");
    if (ti === null) return 0;
    const v = parseInt(ti, 10);
    return Number.isFinite(v) ? v : 0;
  };

  const computeTabOrder = () => {
    const all = [...doc.querySelectorAll(focusableSelector)].filter(isFocusable);
    const pos = all.filter(el => getTabIndex(el) > 0).sort((a,b) => getTabIndex(a) - getTabIndex(b));
    const zero = all.filter(el => getTabIndex(el) === 0);
    return [...pos, ...zero];
  };

  // ---------------- contrast utils (contrastScan) ----------------
  const parseRGBA = (c) => {
    if (!c) return null;
    c = c.trim();
    if (c === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
    const m = c.match(/^rgba?\(([^)]+)\)$/i);
    if (!m) return null;
    const parts = m[1].split(",").map(x => x.trim());
    const r = parseFloat(parts[0]);
    const g = parseFloat(parts[1]);
    const b = parseFloat(parts[2]);
    const a = parts.length >= 4 ? parseFloat(parts[3]) : 1;
    if (![r,g,b,a].every(n => Number.isFinite(n))) return null;
    return { r, g, b, a };
  };

  const blend = (fg, bg) => {
    const a = fg.a + bg.a * (1 - fg.a);
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    const r = (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a;
    const g = (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a;
    const b = (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a;
    return { r, g, b, a };
  };

  const srgbToLin = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };

  const relLuminance = ({ r, g, b }) => {
    const R = srgbToLin(r), G = srgbToLin(g), B = srgbToLin(b);
    return 0.2126 * R + 0.7152 * G + 0.0722 * B;
  };

  const contrastRatio = (c1, c2) => {
    const L1 = relLuminance(c1);
    const L2 = relLuminance(c2);
    const hi = Math.max(L1, L2);
    const lo = Math.min(L1, L2);
    return (hi + 0.05) / (lo + 0.05);
  };

  const getEffectiveBg = (el) => {
    const layers = [];
    let node = el.parentElement;
    while (node && node !== doc.documentElement) {
      const c = parseRGBA(w.getComputedStyle(node).backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a >= 1) break;
      }
      node = node.parentElement;
    }
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    const bodyBg = parseRGBA(w.getComputedStyle(doc.body).backgroundColor);
    if (bodyBg && bodyBg.a > 0) bg = bodyBg.a >= 1 ? bodyBg : blend(bodyBg, bg);
    for (let i = layers.length - 1; i >= 0; i--) bg = blend(layers[i], bg);
    return bg;
  };

  const isLargeText = (el) => {
    const s = w.getComputedStyle(el);
    const fs = parseFloat(s.fontSize) || 0;
    const fw = parseInt(s.fontWeight, 10) || 400;
    const bold = fw >= 700;
    return fs >= 24 || (bold && fs >= 18.66);
  };

  // ---------------- main checks ----------------
  const run = (cfg = {}) => {
    const config = {
      strict: cfg.strict ?? true,
      mode: cfg.mode ?? detectMode(),
      maxRows: cfg.maxRows ?? 140
    };

    const s = sanity();
    const findings = [];

    // If this looks like a "shell" state, warn (use observe/watch during navigation/loader phases).
    if (s.focusables <= 8 && s.landmarks <= 1 && s.headings === 0 && s.roleLog === 0) {
      add(findings, {
        type: "SHELL_OR_MINIMAL_UI",
        severity: "info",
        el: doc.body,
        note: "This looks like a minimal shell. You'll get more findings after content loads (use observe()/watch())."
      });
    }

    // Shadow DOM: warn that elements inside shadow roots are not audited
    if (s.shadowRoots > 0) {
      add(findings, {
        type: "SHADOW_DOM_DETECTED",
        severity: "info",
        el: doc.body,
        note: `${s.shadowRoots} element(s) with open shadow roots detected. Content inside shadow DOM is not audited — inspect manually.`
      });
    }

    // -------- Static checks --------

    // 1.1.1 Non-text Content: images missing alt
    doc.querySelectorAll("img").forEach(imgEl => {
      if (isHidden(imgEl)) return;
      if (!imgEl.hasAttribute("alt")) add(findings, { type: "IMG_MISSING_ALT", el: imgEl, severity: "medium", wcag: "1.1.1" });
      if (imgEl.getAttribute("alt") === "") add(findings, { type: "IMG_EMPTY_ALT", el: imgEl, severity: "low", wcag: "1.1.1", note: "OK if decorative; otherwise provide meaningful alt." });
    });

    // 4.1.2 Name, Role, Value: interactive controls without accessible name
    doc.querySelectorAll("button, a, [role='button'], [role='link']").forEach(el => {
      if (isHidden(el)) return;
      const name = getAccName(el);
      if (!name) add(findings, { type: "NO_ACCESSIBLE_NAME", el, severity: "high", wcag: "4.1.2" });
    });

    // 1.3.1 / 3.3.2 / 4.1.2: form controls without label/name
    doc.querySelectorAll("input:not([type='hidden']), textarea, select, [role='textbox']").forEach(el => {
      if (isHidden(el)) return;
      const isNative = ["INPUT","TEXTAREA","SELECT"].includes(el.tagName);
      const hasNativeLabel = isNative && ("labels" in el) && el.labels && el.labels.length > 0;
      const hasAria = !!(el.getAttribute("aria-label") || el.getAttribute("aria-labelledby"));
      if (!hasNativeLabel && !hasAria) add(findings, { type: "FORM_CONTROL_NO_LABEL", el, severity: "medium", wcag: "1.3.1 / 3.3.2 / 4.1.2" });
    });

    // 1.3.1 Info and Relationships: heading order sanity (detect skipped levels)
    const headingEls = [...doc.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(h => !isHidden(h));
    const levels = headingEls.map(h => parseInt(h.tagName.slice(1), 10)).filter(Boolean);
    if (levels.length) {
      let last = levels[0];
      for (let i = 1; i < levels.length; i++) {
        const cur = levels[i];
        if (cur > last + 1) {
          add(findings, {
            type: "HEADING_LEVEL_SKIP",
            severity: "low",
            wcag: "1.3.1",
            el: headingEls[i],
            note: `Heading jump: h${last} -> h${cur}`,
            extra: { from: last, to: cur }
          });
        }
        last = cur;
      }
      const h1s = headingEls.filter(h => h.tagName === "H1");
      if (h1s.length === 0) add(findings, { type: "NO_H1", severity: "info", wcag: "1.3.1", el: doc.body, note: "No H1 found (sometimes OK in embedded views; verify intent)." });
      if (h1s.length > 1) add(findings, { type: "MULTIPLE_H1", severity: "info", wcag: "1.3.1", el: h1s[1], note: `Found ${h1s.length} H1 elements.` });
    }

    // Landmarks: missing main (common in microfrontends)
    const hasMain = !!doc.querySelector("main,[role='main']");
    if (!hasMain) add(findings, { type: "NO_MAIN_LANDMARK", severity: "low", wcag: "1.3.1", el: doc.body });

    // Regions should be named (best practice; 1.3.1 / 4.1.2)
    doc.querySelectorAll("[role='region']").forEach(el => {
      if (isHidden(el)) return;
      const hasName = !!((el.getAttribute("aria-label") || "").trim() || (el.getAttribute("aria-labelledby") || "").trim());
      if (!hasName) add(findings, { type: "REGION_NO_NAME", el, severity: "low", wcag: "1.3.1 / 4.1.2" });
    });

    // 4.1.2: broken ARIA references
    ["aria-labelledby","aria-describedby","aria-controls","aria-owns","aria-activedescendant"].forEach(attr => {
      doc.querySelectorAll(`[${attr}]`).forEach(el => {
        if (isHidden(el)) return;
        const val = el.getAttribute(attr);
        if (!val) return;
        val.split(/\s+/).filter(Boolean).forEach(id => {
          if (!doc.getElementById(id)) {
            add(findings, { type: "BROKEN_ARIA_REFERENCE", el, severity: "medium", wcag: "4.1.2", note: `${attr} -> missing "${id}"`, extra: { attr, id } });
          }
        });
      });
    });

    // 4.1.2: aria-labelledby points to aria-hidden=true (often breaks naming)
    doc.querySelectorAll("[aria-labelledby]").forEach(el => {
      if (isHidden(el)) return;
      (el.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean).forEach(id => {
        const lbl = doc.getElementById(id);
        if (lbl && lbl.getAttribute("aria-hidden") === "true") {
          add(findings, { type: "ARIA_LABELLEDBY_POINTS_TO_ARIA_HIDDEN", el, severity: "medium", wcag: "4.1.2", extra: { labelId: id } });
        }
      });
    });

    // 2.4.3 Focus Order (heuristic): positive tabindex
    doc.querySelectorAll("[tabindex]").forEach(el => {
      if (isHidden(el)) return;
      const v = parseInt(el.getAttribute("tabindex"), 10);
      if (Number.isFinite(v) && v > 0) add(findings, { type: "POSITIVE_TABINDEX", el, severity: "low", wcag: "2.4.3", extra: { tabindex: v } });
    });

    // -------- Chat-aware “soft” checks --------
    const mode = config.mode;
    if (mode === "chat" || mode === "auto") {
      const liveHook = hasAnnouncementHook();

      // 4.1.3 Status Messages: role=log usually expects announcements; soft-flag if no aria-live on log.
      doc.querySelectorAll("[role='log']").forEach(log => {
        if (isHidden(log)) return;
        if (!log.getAttribute("aria-live")) {
          add(findings, {
            type: "CHAT_LOG_NO_ARIA_LIVE_SOFT",
            el: log,
            severity: liveHook ? "low" : "medium",
            wcag: "4.1.3",
            product: "chat",
            note: liveHook
              ? "role=log has no aria-live, but a live/status hook exists in DOM (manual announcer likely)."
              : "role=log has no aria-live and no live/status hook detected — risk of missing message announcements."
          });
        }
      });

      // Disabled message input: add explanation via aria-describedby (nice-to-have)
      doc.querySelectorAll("textarea[disabled], input[disabled]").forEach(inp => {
        if (isHidden(inp)) return;
        const hasDesc = !!(inp.getAttribute("aria-describedby") || inp.getAttribute("title"));
        if (!hasDesc) {
          add(findings, {
            type: "DISABLED_INPUT_NO_EXPLANATION",
            el: inp,
            severity: "low",
            wcag: "3.3.2 / 3.2.2",
            product: "chat",
            note: "Disabled input without aria-describedby/title explaining why."
          });
        }
      });
    }

    // -------- Loader/status smell (4.1.3) --------
    const loaders = [...doc.querySelectorAll("[aria-busy='true'],[role='progressbar'],[role='status'],div,section,main")]
      .filter(looksLikeLoader)
      .slice(0, 40);

    if (loaders.length && !hasAnnouncementHook()) {
      add(findings, {
        type: "LOADER_WITHOUT_ANNOUNCEMENT_HOOK",
        el: loaders[0],
        severity: "medium",
        wcag: "4.1.3",
        note: "Loaders detected, but no aria-live/status/alert hook found in DOM."
      });
    }

    // -------- Additional checks --------

    // 4.1.1 Parsing: duplicate IDs (breaks ARIA references in microfrontends)
    const idMap = new Map();
    doc.querySelectorAll("[id]").forEach(el => {
      const id = el.id;
      if (!id) return;
      if (idMap.has(id)) {
        add(findings, { type: "DUPLICATE_ID", el, severity: "medium", wcag: "4.1.1", note: `Duplicate id="${id}" — breaks aria-labelledby/describedby references.`, extra: { id } });
      } else {
        idMap.set(id, el);
      }
    });

    // 2.4.7 Focus Visible: interactive elements suppressing outline without replacement
    doc.querySelectorAll("a[href],button,[role='button'],[role='link'],[tabindex='0']").forEach(el => {
      if (isHidden(el)) return;
      try {
        const cs = w.getComputedStyle(el);
        const outlineStyle = cs.outlineStyle;
        const outlineWidth = parseFloat(cs.outlineWidth) || 0;
        const hasOutline = outlineStyle !== "none" && outlineWidth > 0;
        if (!hasOutline) {
          const boxShadow = cs.boxShadow;
          const hasBoxShadowFocus = boxShadow && boxShadow !== "none";
          if (!hasBoxShadowFocus) {
            add(findings, { type: "FOCUS_VISIBLE_SUPPRESSED", el, severity: "low", wcag: "2.4.7", note: "outline:none without visible box-shadow replacement. Verify :focus-visible styles exist." });
          }
        }
      } catch {}
    });

    // 2.4.1 Bypass Blocks: skip navigation link
    const skipLink = doc.querySelector("a[href='#main'],a[href='#content'],a[href='#maincontent'],[class*='skip-nav'],[class*='skipnav'],[class*='skip-link'],a[class*='skip']");
    if (!skipLink && s.landmarks >= 3) {
      add(findings, { type: "NO_SKIP_NAV", severity: "low", wcag: "2.4.1", el: doc.body, note: "No skip-navigation link detected. Important for keyboard users, especially in webview." });
    }

    // 1.3.5 Identify Input Purpose: autocomplete on common form fields
    doc.querySelectorAll("input[type='text'],input[type='email'],input[type='tel'],input[type='url'],input:not([type])").forEach(el => {
      if (isHidden(el)) return;
      if (el.closest("form") || el.closest("[role='form']")) {
        const name = (el.getAttribute("name") || el.getAttribute("id") || "").toLowerCase();
        const autocompleteable = /(name|email|phone|tel|address|city|zip|postal|country|username)/.test(name);
        if (autocompleteable && !el.getAttribute("autocomplete")) {
          add(findings, { type: "MISSING_AUTOCOMPLETE", el, severity: "low", wcag: "1.3.5", note: `Input "${name}" likely needs autocomplete attribute for autofill support.` });
        }
      }
    });

    // 2.1.1 Keyboard: clickable non-interactive elements without keyboard access
    doc.querySelectorAll("[onclick],div[role='button'],span[role='button'],div[role='link'],span[role='link']").forEach(el => {
      if (isHidden(el)) return;
      const tag = el.tagName;
      if (["BUTTON","A","INPUT","TEXTAREA","SELECT"].includes(tag)) return;
      const ti = el.getAttribute("tabindex");
      if (ti === null || parseInt(ti, 10) < 0) {
        add(findings, { type: "CLICK_WITHOUT_KEYBOARD", el, severity: "high", wcag: "2.1.1", note: `${tag.toLowerCase()} with click/role but no tabindex — not keyboard accessible.` });
      }
    });

    // 4.1.2: aria-hidden="true" containing focusable elements
    doc.querySelectorAll("[aria-hidden='true']").forEach(container => {
      if (isHidden(container)) return;
      container.querySelectorAll(focusableSelector).forEach(el => {
        if (isHidden(el)) return;
        const ti = el.getAttribute("tabindex");
        if (ti !== null && parseInt(ti, 10) < 0) return;
        add(findings, { type: "ARIA_HIDDEN_FOCUSABLE", el, severity: "high", wcag: "4.1.2", note: "Focusable inside aria-hidden=true — keyboard reachable but invisible to screen readers." });
      });
    });

    // 4.1.2: ARIA required properties missing
    const ariaRequired = {
      checkbox: ["aria-checked"], switch: ["aria-checked"], radio: ["aria-checked"],
      combobox: ["aria-expanded"], slider: ["aria-valuenow"],
      scrollbar: ["aria-valuenow"], menuitemcheckbox: ["aria-checked"],
      menuitemradio: ["aria-checked"], tab: ["aria-selected"]
    };
    Object.entries(ariaRequired).forEach(([role, attrs]) => {
      doc.querySelectorAll(`[role="${role}"]`).forEach(el => {
        if (isHidden(el)) return;
        for (const attr of attrs) {
          if (!el.hasAttribute(attr)) {
            add(findings, { type: "ARIA_REQUIRED_ATTR_MISSING", el, severity: "medium", wcag: "4.1.2", note: `role="${role}" requires ${attr}.`, extra: { role, attr } });
          }
        }
      });
    });

    // 2.5.5 Target Size: interactive elements smaller than 24x24px
    doc.querySelectorAll("button,a[href],[role='button'],[role='link'],input:not([type='hidden']),select,textarea").forEach(el => {
      if (isHidden(el)) return;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24)) {
        add(findings, { type: "TOUCH_TARGET_TOO_SMALL", el, severity: "low", wcag: "2.5.5", note: `Size ${Math.round(r.width)}x${Math.round(r.height)}px — min 24x24px (AA).`, extra: { width: Math.round(r.width), height: Math.round(r.height) } });
      }
    });

    // 1.3.1: Data tables without headers
    doc.querySelectorAll("table").forEach(table => {
      if (isHidden(table)) return;
      const role = table.getAttribute("role");
      if (role === "presentation" || role === "none") return;
      const ths = table.querySelectorAll("th");
      const tds = table.querySelectorAll("td");
      if (tds.length > 0 && ths.length === 0) {
        add(findings, { type: "TABLE_NO_HEADERS", el: table, severity: "medium", wcag: "1.3.1", note: "Data table has no <th> elements." });
      }
    });

    // 2.5.3 Label in Name: visible text not included in accessible name
    doc.querySelectorAll("button[aria-label],a[aria-label],[role='button'][aria-label],[role='link'][aria-label]").forEach(el => {
      if (isHidden(el)) return;
      const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase().trim();
      const visibleText = txt(el.textContent, 100).toLowerCase().trim();
      if (visibleText && ariaLabel && visibleText.length > 2 && !ariaLabel.includes(visibleText)) {
        add(findings, { type: "LABEL_NOT_IN_NAME", el, severity: "medium", wcag: "2.5.3", note: `Visible text "${txt(el.textContent,40)}" not in aria-label "${txt(el.getAttribute("aria-label"),40)}".` });
      }
    });

    // 3.1.1 Language of Page
    if (!doc.documentElement.getAttribute("lang")) {
      add(findings, { type: "MISSING_LANG", severity: "medium", wcag: "3.1.1", el: doc.documentElement, note: "html element missing lang attribute." });
    }

    // 1.4.4 / 1.4.10: viewport restricting zoom (important in webview)
    const viewport = doc.querySelector("meta[name='viewport']");
    if (viewport) {
      const content = (viewport.getAttribute("content") || "").toLowerCase();
      if (/user-scalable\s*=\s*no/.test(content) || /maximum-scale\s*=\s*1([^.]|$)/.test(content)) {
        add(findings, { type: "VIEWPORT_ZOOM_DISABLED", severity: "medium", wcag: "1.4.4", el: viewport, note: "Viewport disables user zoom — fails WCAG in webview contexts." });
      }
    }

    // -------- Output --------
    const dedup = uniqBy(findings, x => `${x.type}|${x.severity}|${x.product||""}|${x.path||""}|${JSON.stringify(x.extra||{})}`);
    const order = { high: 3, medium: 2, low: 1, info: 0 };
    const top = [...dedup].sort((a,b)=>(order[b.severity]??0)-(order[a.severity]??0)).slice(0, config.maxRows);

    const res = {
      timestamp: nowIso(),
      env: { href: s.href, inIframe: s.inIframe },
      mode,
      config,
      sanity: s,
      lists: {
        ul: doc.querySelectorAll("ul").length,
        ol: doc.querySelectorAll("ol").length,
        dl: doc.querySelectorAll("dl").length
      },
      headings: headingEls.slice(0, 80).map(h => ({ level: h.tagName, text: txt(h.textContent, 70) })),
      findings: dedup
    };

    api.last = res;

    console.groupCollapsed(`🧩 A11YFlowAudit.run — findings=${dedup.length} — mode=${mode} — ${s.href}`);
    console.table(top.map(x => ({
      severity: x.severity,
      product: x.product,
      type: x.type,
      wcag: x.wcag,
      name: x.name,
      role: x.role,
      testId: x.testId,
      note: x.note
    })));
    console.log("Sanity:", s);
    console.log("Lists:", res.lists);
    console.log("Headings:", res.headings);
    console.log("Raw findings:", dedup);
    console.groupEnd();

    return res;
  };

  // ---------------- observe (periodic run) ----------------
  const observe = ({ seconds = 10, intervalMs = 900, runConfig = { strict: true } } = {}) => {
    return new Promise((resolve) => {
      const startedAt = performance.now();
      const snapshots = [];
      const merged = [];

      const tick = () => {
        const r = run(runConfig);
        snapshots.push({ t: +(performance.now() - startedAt).toFixed(0), count: r.findings.length, mode: r.mode });
        merged.push(...r.findings);
      };

      tick();
      const timer = setInterval(tick, intervalMs);

      setTimeout(() => {
        clearInterval(timer);
        const unique = uniqBy(merged, x => `${x.type}|${x.severity}|${x.product||""}|${x.path||""}|${JSON.stringify(x.extra||{})}`);
        const result = { timestamp: nowIso(), seconds, intervalMs, snapshots, findings: unique, href: w.location.href };
        api.lastObserved = result;

        console.groupCollapsed(`🧠 A11YFlowAudit.observe — ${seconds}s — totalUniqueFindings=${unique.length}`);
        console.table(snapshots);
        console.log("Unique findings:", unique);
        console.groupEnd();

        resolve(result);
      }, seconds * 1000);

      console.info(`🧠 A11YFlowAudit.observe started (${seconds}s). Trigger loader/remount flow now.`);
    });
  };

  // ---------------- watch (loader chain + focus loss + silent loading) ----------------
  const watch = ({ seconds = 20, tickMs = 200, budget = {} } = {}) => {
    return new Promise((resolve) => {
      const B = {
        maxBursts: 3,
        maxSilentMs: 2500,
        maxTotalLoadingMs: 7000,
        maxFocusLossEvents: 1,
        ...budget
      };

      const start = performance.now();
      let totalLoadingMs = 0;
      let silentMs = 0;
      let bursts = 0;
      let focusLoss = 0;
      let lastLoader = false;
      let bodyFocusSince = null;
      let bodyFocusCounted = false;

      const events = [];

      const timer = setInterval(() => {
        const t = +(performance.now() - start).toFixed(0);

        const loaderNow = !![...doc.querySelectorAll("[aria-busy='true'],[role='progressbar'],[role='status'],div,section,main")]
          .slice(0, 250)
          .find(looksLikeLoader);

        if (loaderNow) totalLoadingMs += tickMs;
        if (loaderNow && !hasAnnouncementHook()) silentMs += tickMs;

        if (loaderNow && !lastLoader) bursts += 1;
        lastLoader = loaderNow;

        if (doc.activeElement === doc.body) {
          if (bodyFocusSince === null) { bodyFocusSince = performance.now(); bodyFocusCounted = false; }
          if (!bodyFocusCounted && performance.now() - bodyFocusSince > 350) {
            focusLoss += 1;
            bodyFocusCounted = true;
            events.push({ t, type: "focus_on_body", note: "Focus stayed on <body> >350ms (often remount/loader chain)." });
          }
        } else {
          bodyFocusSince = null;
          bodyFocusCounted = false;
        }

        if (t >= seconds * 1000) {
          clearInterval(timer);
          const verdicts = [];
          if (bursts > B.maxBursts) verdicts.push({ metric: "bursts", value: bursts, budget: B.maxBursts });
          if (silentMs > B.maxSilentMs) verdicts.push({ metric: "silentMs", value: silentMs, budget: B.maxSilentMs });
          if (totalLoadingMs > B.maxTotalLoadingMs) verdicts.push({ metric: "totalLoadingMs", value: totalLoadingMs, budget: B.maxTotalLoadingMs });
          if (focusLoss > B.maxFocusLossEvents) verdicts.push({ metric: "focusLossEvents", value: focusLoss, budget: B.maxFocusLossEvents });

          const result = { timestamp: nowIso(), seconds, bursts, totalLoadingMs, silentMs, focusLossCount: focusLoss, budget: B, verdicts, events, href: w.location.href };
          api.lastWatch = result;

          console.groupCollapsed(`⏱️ A11YFlowAudit.watch — ${seconds}s — bursts=${bursts} loading=${totalLoadingMs}ms silent=${silentMs}ms focusLoss=${focusLoss}`);
          if (verdicts.length) console.warn("OVER budget:", verdicts);
          else console.info("Budgets OK ✅");
          console.table(events.slice(0, 120));
          console.log("Raw:", api.lastWatch);
          console.groupEnd();

          resolve(result);
        }
      }, tickMs);

      console.info(`👀 A11YFlowAudit.watch started (${seconds}s). Trigger the loader-heavy flow now.`);
    });
  };

  // ---------------- tabWalk (heuristic keyboard order) ----------------
  const tabWalk = ({ steps = 60, includePositiveTabindex = true } = {}) => {
    const order = computeTabOrder();
    const filtered = includePositiveTabindex ? order : order.filter(el => getTabIndex(el) === 0);
    const max = Math.min(steps, filtered.length);

    const original = doc.activeElement;
    const events = [];
    const seen = new Set();

    const focusOne = (el, i) => {
      try { el.focus({ preventScroll: true }); } catch (_) { try { el.focus(); } catch (_) {} }
      const after = doc.activeElement;
      const ok = after === el;

      const key = cssPath(el);
      if (seen.has(key)) {
        events.push({ i, type: "duplicate_in_order", path: key, name: getAccName(el), tabIndex: getTabIndex(el), note: "Element appears multiple times in computed order (heuristic)." });
      } else {
        seen.add(key);
      }

      if (!ok) {
        events.push({
          i,
          type: "focus_failed",
          path: cssPath(el),
          name: getAccName(el),
          tabIndex: getTabIndex(el),
          note: "Tried to focus but activeElement did not change."
        });
      }

      if (after === doc.body) {
        events.push({ i, type: "focus_on_body", note: "Focus ended up on <body> during tabWalk." });
      }

      const role = el.getAttribute("role");
      if ((role === "button" || role === "link") && !ok) {
        events.push({ i, type: "role_interactive_not_focusable", path: cssPath(el), role, note: "role=button/link but cannot be focused." });
      }
    };

    for (let i = 0; i < max; i++) focusOne(filtered[i], i);

    // Focus trap detection: elements that cycle with short period
    const cycleCheck = new Map();
    for (let i = 0; i < max; i++) {
      const p = cssPath(filtered[i]);
      if (cycleCheck.has(p)) {
        const firstIdx = cycleCheck.get(p);
        if (i - firstIdx < 5) {
          events.push({ i, type: "possible_focus_trap", path: p, name: getAccName(filtered[i]), tabIndex: getTabIndex(filtered[i]), note: `Element appeared at indices ${firstIdx} and ${i} — possible focus trap (cycle length ${i - firstIdx}).` });
        }
      }
      cycleCheck.set(p, i);
    }

    // Dialog focus containment check
    doc.querySelectorAll("[role='dialog'],[role='alertdialog'],dialog[open]").forEach(dialog => {
      if (isHidden(dialog)) return;
      const dialogFocusables = [...dialog.querySelectorAll(focusableSelector)].filter(isFocusable);
      if (dialogFocusables.length === 0) {
        events.push({ i: -1, type: "dialog_no_focusables", path: cssPath(dialog), name: getAccName(dialog), tabIndex: 0, note: "Open dialog has no focusable elements inside it." });
      }
      const walkedOutside = filtered.slice(0, max).filter(el => !dialog.contains(el));
      if (dialogFocusables.length > 0 && walkedOutside.length > 0) {
        events.push({ i: -1, type: "dialog_focus_not_trapped", path: cssPath(dialog), name: getAccName(dialog), tabIndex: 0, note: "Open dialog present but focus can reach elements outside it." });
      }
    });

    if (original && original !== doc.body) {
      try { original.focus({ preventScroll: true }); } catch (_) {}
    }

    const summary = {
      timestamp: nowIso(),
      href: w.location.href,
      totalFocusables: order.length,
      walked: max,
      events
    };
    api.lastTabWalk = summary;

    console.groupCollapsed(`⌨️ A11YFlowAudit.tabWalk — walked=${max}/${order.length} — events=${events.length}`);
    console.table(events.slice(0, 140));
    console.log("Raw:", summary);
    console.groupEnd();

    return summary;
  };

  // ---------------- contrastScan (approx) ----------------
  const contrastScan = ({ limit = 200, minTextLen = 2 } = {}) => {
    const nodes = [...doc.querySelectorAll("p,span,a,button,label,li,td,th,h1,h2,h3,h4,h5,h6")]
      .filter(isEl)
      .filter(el => !isHidden(el))
      .filter(el => txt(el.textContent).length >= minTextLen)
      .slice(0, limit);

    const failures = [];
    const samples = [];

    for (const el of nodes) {
      const s = w.getComputedStyle(el);
      if (!s) continue;

      // Check cumulative opacity from ancestors
      let cumulativeOpacity = parseFloat(s.opacity) || 1;
      let ancestor = el.parentElement;
      while (ancestor && ancestor !== doc.documentElement && cumulativeOpacity > 0) {
        const ancestorOpacity = parseFloat(w.getComputedStyle(ancestor).opacity);
        if (Number.isFinite(ancestorOpacity)) cumulativeOpacity *= ancestorOpacity;
        ancestor = ancestor.parentElement;
      }
      if (cumulativeOpacity === 0) continue;

      const fg = parseRGBA(s.color);
      if (!fg || fg.a === 0) continue;

      const bg = getEffectiveBg(el);
      // Factor in cumulative opacity: effective fg blends toward bg at reduced opacity
      const effectiveFg = cumulativeOpacity < 1
        ? blend({ r: fg.r, g: fg.g, b: fg.b, a: fg.a * cumulativeOpacity }, bg)
        : { r: fg.r, g: fg.g, b: fg.b };
      const ratio = contrastRatio(effectiveFg, bg);

      const large = isLargeText(el);
      const req = large ? 3.0 : 4.5;

      const item = {
        ratio: +ratio.toFixed(2),
        required: req,
        largeText: large,
        text: txt(el.textContent, 60),
        tag: el.tagName,
        testId: testId(el),
        path: cssPath(el),
        note: cumulativeOpacity < 1 ? `Effective opacity: ${(cumulativeOpacity * 100).toFixed(0)}% — ratio adjusted for opacity blending.` : null
      };

      samples.push(item);
      if (ratio + 1e-6 < req) {
        failures.push({
          ...item,
          wcag: "1.4.3",
          note: item.note || "Approx contrast check (may be off with gradients/images). Verify manually for blockers."
        });
      }
    }

    const res = {
      timestamp: nowIso(),
      href: w.location.href,
      scanned: nodes.length,
      failuresCount: failures.length,
      failures,
      samples: samples.slice(0, 30)
    };
    api.lastContrast = res;

    console.groupCollapsed(`🎚️ A11YFlowAudit.contrastScan — failures=${failures.length}/${nodes.length}`);
    console.table(failures.slice(0, 120));
    console.log("Samples (first 30):", res.samples);
    console.log("Raw:", res);
    console.groupEnd();

    return res;
  };

  const api = {
    run,
    observe,
    watch,
    tabWalk,
    contrastScan,
    modeHints,
    last: null,
    lastObserved: null,
    lastWatch: null,
    lastTabWalk: null,
    lastContrast: null,
    help() {
      console.log("A11YFlowAudit.run({ strict:true })");
      console.log("A11YFlowAudit.observe({ seconds: 12 })  // loaders/remounts");
      console.log("A11YFlowAudit.watch({ seconds: 40 })     // loader chain + focus loss + silent loading budgets");
      console.log("A11YFlowAudit.tabWalk({ steps: 80 })     // heuristic keyboard order");
      console.log("A11YFlowAudit.contrastScan({ limit: 250 }) // approx contrast");
      console.log("A11YFlowAudit.last / lastObserved / lastWatch / lastTabWalk / lastContrast");
    }
  };

  w[KEY] = api;
  console.log(`✅ ${KEY} installed`, w.location.href, "inIframe=", w.self !== w.top, "mode=", detectMode());
})();