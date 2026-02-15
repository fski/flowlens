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

  const commonAncestorDepth = (a, b) => {
    if (!isEl(a) || !isEl(b)) return Infinity;
    const pathA = [];
    let n = a;
    while (n) { pathA.push(n); n = n.parentElement; }
    const setA = new Set(pathA);
    let depth = 0;
    n = b;
    while (n) {
      if (setA.has(n)) return depth;
      depth++;
      n = n.parentElement;
    }
    return Infinity;
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

  const createPassCache = () => ({
    styles: new WeakMap(),
    rects: new WeakMap(),
    hidden: new WeakMap(),
  });

  const getStyleCached = (el, cache) => {
    if (!cache) return w.getComputedStyle(el);
    if (cache.styles.has(el)) return cache.styles.get(el);
    const style = w.getComputedStyle(el);
    cache.styles.set(el, style);
    return style;
  };

  const getRectCached = (el, cache) => {
    if (!cache) return el.getBoundingClientRect();
    if (cache.rects.has(el)) return cache.rects.get(el);
    const rect = el.getBoundingClientRect();
    cache.rects.set(el, rect);
    return rect;
  };

  const isHiddenCached = (el, cache) => {
    if (!cache) return isHidden(el);
    if (cache.hidden.has(el)) return cache.hidden.get(el);
    let hidden = true;
    if (isEl(el) && !el.hidden) {
      const s = getStyleCached(el, cache);
      if (!(s.display === "none" || s.visibility === "hidden")) {
        const r = getRectCached(el, cache);
        hidden = r.width === 0 || r.height === 0;
      }
    }
    cache.hidden.set(el, hidden);
    return hidden;
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

  const FIX_SUGGESTIONS = {
    IMG_MISSING_ALT: 'Add alt="description of image" to the <img> tag. Use alt="" only if purely decorative.',
    IMG_EMPTY_ALT: 'If decorative, alt="" is correct. If meaningful, add a descriptive alt text.',
    NO_ACCESSIBLE_NAME: (f) => `Add aria-label="descriptive label" or visible text content to this ${f.role || f.tag?.toLowerCase() || 'element'}.`,
    FORM_CONTROL_NO_LABEL: 'Add a visible <label for="id"> associated with the input, or use aria-label if a visible label is not possible.',
    HEADING_LEVEL_SKIP: (f) => `Insert an h${(f.extra?.from || 1) + 1} heading before this h${f.extra?.to || '?'} to maintain heading hierarchy.`,
    NO_H1: 'Add an <h1> element describing the primary content of the page.',
    MULTIPLE_H1: 'Use only one <h1> per page. Demote extra H1s to <h2> or lower.',
    NO_MAIN_LANDMARK: 'Wrap the primary page content in a <main> element.',
    REGION_NO_NAME: 'Add aria-label="Section name" or aria-labelledby pointing to a visible heading.',
    BROKEN_ARIA_REFERENCE: (f) => `Ensure an element with id="${f.extra?.id}" exists in the DOM, or remove the ${f.extra?.attr} attribute.`,
    ARIA_LABELLEDBY_POINTS_TO_ARIA_HIDDEN: 'Remove aria-hidden="true" from the referenced label element, or use a different labelling strategy.',
    POSITIVE_TABINDEX: 'Remove the positive tabindex value. Use tabindex="0" for natural order, or restructure the DOM order instead.',
    CHAT_LOG_NO_ARIA_LIVE_SOFT: 'Add aria-live="polite" to the role="log" container so new messages are announced.',
    DISABLED_INPUT_NO_EXPLANATION: 'Add aria-describedby pointing to text explaining why the input is disabled, or add a title attribute.',
    LOADER_WITHOUT_ANNOUNCEMENT_HOOK: 'Add an aria-live="polite" region and update its text when loading starts/ends (e.g., "Loading…" / "Content loaded").',
    DUPLICATE_ID: (f) => {
      const base = `Make id="${f.extra?.id}" unique across the page. In microfrontend contexts, add a scope prefix (e.g., "mfe1-${f.extra?.id}").`;
      return f.extra?.ariaReferenced
        ? `${base} This ID is referenced by ARIA attributes — duplicates will break accessible name/description resolution.`
        : base;
    },
    FOCUS_VISIBLE_SUPPRESSED: 'Add a visible :focus-visible style (e.g., outline: 2px solid #005fcc; outline-offset: 2px) or use box-shadow for the focus indicator.',
    NO_SKIP_NAV: 'Add a visually hidden skip link as the first focusable element: <a href="#main" class="skip-link">Skip to main content</a>.',
    MISSING_AUTOCOMPLETE: 'Add the appropriate autocomplete attribute (e.g., autocomplete="email") to help browsers autofill this field.',
    CLICK_WITHOUT_KEYBOARD: (f) => `Ensure this ${f.tag?.toLowerCase() || 'element'} is keyboard reachable and activates on Enter/Space. If handling is delegated, verify behavior manually.`,
    ARIA_HIDDEN_FOCUSABLE: 'Add tabindex="-1" to focusable elements inside aria-hidden="true", or remove aria-hidden from the container.',
    ARIA_REQUIRED_ATTR_MISSING: (f) => `Add ${f.extra?.attr}="..." to this role="${f.extra?.role}" element as required by the ARIA spec.`,
    TOUCH_TARGET_TOO_SMALL: 'Verify effective hit-area is at least 24x24px (WCAG 2.2 AA 2.5.8). Increase padding/min-size, or confirm a larger wrapper hit target exists.',
    TABLE_NO_HEADERS: 'Add <th scope="col"> for column headers and <th scope="row"> for row headers.',
    LABEL_NOT_IN_NAME: 'Ensure the aria-label includes the visible text. E.g., if button says "Search", use aria-label="Search products" not "Find items".',
    MISSING_LANG: 'Add lang="en" (or the appropriate language code) to the <html> element.',
    VIEWPORT_ZOOM_DISABLED: 'Remove user-scalable=no and maximum-scale=1 from the viewport meta tag to allow pinch-to-zoom.',
    SHELL_OR_MINIMAL_UI: null,
    SHADOW_DOM_DETECTED: 'Inspect shadow DOM content manually using DevTools element inspector.',
    // Microfrontend checks
    COMPETING_ASSERTIVE_LIVE: 'Consolidate aria-live="assertive" regions into one shared announcer. Use aria-live="polite" where possible.',
    DUPLICATE_MAIN_LANDMARK: 'Coordinate between microfrontends so only one <main> element exists. Others should use <section> or role="region".',
    DUPLICATE_NAV_NO_LABEL: 'Add unique aria-label to each <nav> (e.g., aria-label="Primary navigation", aria-label="Footer navigation").',
    DUPLICATE_BANNER: 'Coordinate MFEs so only one top-level <header> exists, or scope additional headers inside <article> or <section>.',
    DUPLICATE_CONTENTINFO: 'Coordinate MFEs so only one top-level <footer> exists, or scope additional footers inside <article> or <section>.',
    HEADING_HIERARCHY_FRAGMENTED: 'Establish a shared heading hierarchy across MFEs. The host page should provide H1, MFEs start at H2 or deeper.',
    COMPETING_SKIP_NAV: 'Use a single skip link from the host page. Remove skip links from individual MFEs.',
    SHADOW_DOM_FOCUS_ISSUE: 'Add delegatesFocus: true to the shadow root, or set explicit tabindex on focusable shadow DOM elements.',
    IFRAME_MISSING_TITLE: 'Add title="Description of embedded content" to the <iframe> element.',
    IFRAME_CROSS_ORIGIN: 'Check the parent page to verify this iframe has a title attribute.',
    // WCAG 2.2
    DRAGGABLE_NO_ALTERNATIVE: 'Provide a button-based alternative (e.g., move up/down buttons) alongside the drag interaction.',
    CONSISTENT_HELP_CHECK: 'Ensure help/contact links appear in the same relative order on every page.',
    FOCUS_MAY_BE_OBSCURED: 'Use scroll-padding-top/bottom or scroll-margin to offset focused elements past sticky headers/footers.',
    REDUNDANT_ENTRY: 'Add autocomplete attributes to repeated fields, or pre-fill values from prior entries.',
    // Help center / chat / general
    HC_TREE_ITEM_NO_NAME: 'Add aria-label or visible text content to each role="treeitem" so screen readers can announce the item.',
    HC_TREE_NO_ARIA_EXPANDED: 'Add aria-expanded="true" or aria-expanded="false" to treeitem elements that own a child role="group".',
    CHAT_MESSAGE_NO_ROLE: 'Add role="listitem", role="article", or a semantic element to direct children of role="log" so screen readers convey message boundaries.',
    CHAT_INPUT_NO_LABEL: 'Add a visible <label> or aria-label to the chat input/textarea so screen readers announce its purpose.',
    CHAT_TIMESTAMP_INACCESSIBLE: 'Remove aria-hidden from the timestamp, or provide the same information in an sr-only element or aria-label on the parent message.',
    HC_ARTICLE_NO_HEADING: 'Add an <h2> or <h3> heading inside the article to give it a navigable structure for screen reader users.',
    LIVE_REGION_HIDDEN: 'An aria-live region with display:none or visibility:hidden will never announce. Make it visible (use clip-rect for visual hiding) or remove aria-live.',
    COMBOBOX_NO_LISTBOX: 'Add aria-owns or aria-controls pointing to a role="listbox" (or role="tree"/"grid") element that appears when the combobox is expanded.',
    // AAA
    TARGET_SIZE_AAA: 'Increase the target size to at least 44x44px to meet AAA requirements.',
    // Tier 1 extended rules
    NESTED_INTERACTIVE: 'Remove the nested interactive element, or replace the outer <button>/<a> with a non-interactive wrapper like <div> with role and keyboard handling.',
    DOCUMENT_TITLE_MISSING: 'Add a <title>Page Title</title> element inside <head> that describes the page purpose.',
    ARIA_VALID_ATTR: (f) => `"${f.extra?.attr}" is not a valid ARIA attribute. Check for typos${f.extra?.suggestion ? ` — did you mean "${f.extra.suggestion}"?` : '.'}`,
    ARIA_VALID_ROLE: (f) => `role="${f.extra?.role}" is not a valid WAI-ARIA role. Remove it or use a valid role value.`,
    ARIA_REQUIRED_CHILDREN: (f) => `role="${f.extra?.role}" requires at least one child with role="${f.extra?.expected}". Add the missing child element.`,
    ARIA_REQUIRED_PARENT: (f) => `role="${f.extra?.role}" must be contained in a parent with role="${f.extra?.expected}". Wrap it in the appropriate parent.`,
    META_REFRESH: 'Remove <meta http-equiv="refresh">. Use server-side redirects or give the user a link to navigate.',
    NO_AUTOPLAY_AUDIO: 'Add muted attribute, or ensure audio does not play for more than 3 seconds, or provide a mechanism to pause/stop/mute.',
    HTML_LANG_VALID: (f) => `lang="${f.extra?.lang}" is not a valid BCP 47 language tag. Use a valid code like "en", "fr", "es", "de".`,
    SCROLLABLE_NOT_FOCUSABLE: 'Add tabindex="0" and an accessible label (aria-label or aria-labelledby) to the scrollable container.',
    LINK_SUSPICIOUS_TEXT: (f) => `Link text "${f.extra?.text}" is not descriptive. Use text that describes the link destination (e.g., "View pricing details" instead of "click here").`,
    EMPTY_HEADING: 'Add text content to the heading, or remove it if not needed.',
    EMPTY_TABLE_HEADER: 'Add text content to the <th> element, or use aria-label if visual text is not appropriate.',
    DIALOG_NO_ACCESSIBLE_NAME: 'Add aria-label="Dialog purpose" or aria-labelledby pointing to the dialog title element.',
    ARIA_ALLOWED_ATTR: (f) => `"${f.extra?.attr}" is not allowed on role="${f.extra?.role}". Remove the attribute or change the element's role.`,
    ARIA_HIDDEN_ON_BODY: 'Remove aria-hidden="true" from <body> or <html>. This hides the entire page from assistive technology.',
    // Tier 2 extended rules
    MARQUEE_ELEMENT: 'Replace <marquee> with CSS animation or a static alternative. The <marquee> element is deprecated and causes reading difficulty.',
    INPUT_IMAGE_ALT: 'Add alt="description" to the <input type="image"> element describing its action (e.g., alt="Submit form").',
    AREA_ALT_MISSING: 'Add alt="description" to the <area> element describing the linked region.',
    OBJECT_NO_ALT: 'Add a text alternative inside the <object> element as fallback content, or use aria-label.',
    FIELDSET_NO_LEGEND: 'Add a <legend> as the first child of the <fieldset> to describe the group of controls.',
    SVG_IMG_NO_ALT: 'Add aria-label="description" to the <svg>, or include a <title> element as first child of the SVG.',
    VIDEO_NO_CAPTIONS: 'Add <track kind="captions" src="..."> inside the <video> element to provide synchronized captions.',
    LIST_STRUCTURE: (f) => `Move the <${f.extra?.tag}> inside a <ul>, <ol>, or <menu> element. List items must be children of a list container.`,
    DL_STRUCTURE: (f) => `Move the <${f.extra?.tag}> inside a <dl> element. Definition terms/descriptions must be children of a definition list.`,
    ACCESSKEY_DUPLICATE: (f) => `accesskey="${f.extra?.key}" is used on ${f.extra?.count} elements. Each accesskey must be unique on the page.`,
    FORM_FIELD_MULTIPLE_LABELS: 'Remove extra <label> elements so each input has exactly one associated label.',
    AUTOCOMPLETE_VALID: (f) => `autocomplete="${f.extra?.value}" is not a valid token. Use a recognized value like "name", "email", "tel", etc.`,
    TH_MISSING_SCOPE: 'Add scope="col" or scope="row" to <th> elements in tables with multiple rows and columns.',
    VIDEO_AUTOPLAY: 'Add muted attribute to <video autoplay>, or provide a mechanism to pause/stop the video.',
    // Tier 3 extended rules
    BLINK_ELEMENT: 'Remove the <blink> element. It is deprecated and causes seizure/readability issues. Use CSS animation with prefers-reduced-motion support if needed.',
    SERVER_IMAGE_MAP: 'Replace the server-side image map (<img ismap>) with a client-side <map> using <area> elements, so each region has its own accessible name.',
    SCOPE_ATTR_VALID: (f) => `scope="${f.extra?.value}" is not valid. Use "col", "row", "colgroup", or "rowgroup".`,
    TD_HEADERS_INVALID: (f) => `headers attribute references id="${f.extra?.id}" which does not exist. Fix the id reference or remove the headers attribute.`,
    TABLE_DUPLICATE_NAME: 'The table caption and aria-label are identical. Remove one to avoid redundant announcements.',
    AUDIO_NO_TRANSCRIPT: 'Provide a text transcript for the audio content, or link to one near the <audio> element.',
    ARIA_VALID_ATTR_VALUE: (f) => `"${f.extra?.value}" is not a valid value for ${f.extra?.attr}. ${f.extra?.expected || 'Check the WAI-ARIA spec for allowed values.'}`,
    IDENTICAL_LINKS_SAME_TEXT: (f) => `${f.extra?.count} links use text "${f.extra?.text}" but point to different URLs. Differentiate the link text or add aria-label to clarify purpose.`,
    P_AS_HEADING: 'If this text acts as a heading, use an <h2>–<h6> element instead of styling a <p> or <div> with bold/large text.',
    // Chat & Help Center extended rules
    CHAT_SEND_NO_LABEL: 'Add aria-label="Send message" (or similar) to the send button, or ensure it has visible text content.',
    CHAT_AVATAR_NO_ALT: 'Add alt="Agent name" or alt="" (if decorative) to avatar images inside the chat log.',
    CHAT_NO_ARIA_RELEVANT: 'Add aria-relevant="additions" to role="log" so assistive technology correctly announces only new messages.',
    CHAT_TYPING_NO_ANNOUNCEMENT: 'Wrap the typing indicator in an aria-live="polite" region, or announce "Agent is typing" via a live region.',
    HC_SEARCH_NO_LABEL: 'Add a visible <label> or aria-label to the help center search input.',
    HC_BREADCRUMB_NO_LABEL: 'Add aria-label="Breadcrumb" to the <nav> element containing breadcrumb links.',
    HC_ACCORDION_NO_STATE: 'Add aria-expanded="true" or aria-expanded="false" to the accordion trigger button.',
  };

  const RULE_REGISTRY = {
    FOCUS_VISIBLE_SUPPRESSED: {
      id: "FOCUS_VISIBLE_SUPPRESSED",
      wcag: "2.4.7",
      level: "AA",
      confidence: "heuristic",
      run: null,
    },
    LOADER_WITHOUT_ANNOUNCEMENT_HOOK: {
      id: "LOADER_WITHOUT_ANNOUNCEMENT_HOOK",
      wcag: "4.1.3",
      level: "AA",
      confidence: "heuristic",
      run: null,
    },
    TOUCH_TARGET_TOO_SMALL: {
      id: "TOUCH_TARGET_TOO_SMALL",
      wcag: "2.5.8",
      wcagVersion: "2.2",
      level: "AA",
      confidence: "heuristic",
      run: null,
    },
    CLICK_WITHOUT_KEYBOARD: {
      id: "CLICK_WITHOUT_KEYBOARD",
      wcag: "2.1.1",
      level: "A",
      confidence: "heuristic",
      run: null,
    },
    FOCUS_MAY_BE_OBSCURED: {
      id: "FOCUS_MAY_BE_OBSCURED",
      wcag: "2.4.11",
      level: "AA",
      confidence: "advisory",
      run: null,
    },
    CONSISTENT_HELP_CHECK: {
      id: "CONSISTENT_HELP_CHECK",
      wcag: "3.2.6",
      level: "A",
      confidence: "advisory",
      run: null,
    },
    ARIA_HIDDEN_FOCUSABLE: {
      id: "ARIA_HIDDEN_FOCUSABLE",
      wcag: "4.1.2",
      level: "A",
      confidence: "strict",
      run: null,
    },
    IFRAME_MISSING_TITLE: {
      id: "IFRAME_MISSING_TITLE",
      wcag: "4.1.2",
      level: "A",
      confidence: "strict",
      run: null,
    },
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
    if (el.tagName === "IMG") {
      const alt = el.getAttribute("alt");
      if (alt?.trim()) return alt.trim();
    }
    const title = el.getAttribute("title");
    if (title?.trim()) return title.trim();
    const ph = el.getAttribute("placeholder");
    if (ph?.trim()) return `[placeholder] ${ph.trim()}`;
    return txt(el.textContent, 160) || "";
  };

  const add = (findings, params) => {
    const { type, el, severity = "low", wcag = null, wcagVersion = null, level = null, confidence = null, product = null, note = null, extra = null, fix = null } = params;
    const ruleMeta = RULE_REGISTRY[type] || null;
    const entry = {
      type, severity,
      wcag: wcag ?? ruleMeta?.wcag ?? null,
      wcagVersion: wcagVersion ?? ruleMeta?.wcagVersion ?? null,
      level: level ?? ruleMeta?.level ?? null,
      confidence: confidence ?? ruleMeta?.confidence ?? null,
      product,
      name: el ? getAccName(el) : null,
      role: el?.getAttribute?.("role") || null,
      tag: el?.tagName || null,
      testId: el ? testId(el) : null,
      path: el ? cssPath(el) : null,
      html: el ? html(el) : null,
      note, extra, fix: fix ?? null
    };
    if (!entry.fix && FIX_SUGGESTIONS[type]) {
      const s = FIX_SUGGESTIONS[type];
      entry.fix = typeof s === "function" ? s(entry) : s;
    }
    findings.push(entry);
  };

  RULE_REGISTRY.FOCUS_VISIBLE_SUPPRESSED.run = ({ findings }) => {
    const focusHints = (() => {
      const hints = [];
      let scannedRules = 0;
      let inaccessibleSheets = 0;

      const hasVisibleIndicator = (styleDecl) => {
        const outlineStyle = (styleDecl?.outlineStyle || "").toLowerCase();
        const outlineWidth = parseFloat(styleDecl?.outlineWidth) || 0;
        if (outlineStyle && outlineStyle !== "none" && outlineWidth > 0) return true;
        if ((styleDecl?.boxShadow || "").toLowerCase() !== "none" && !!styleDecl?.boxShadow) return true;
        const borderStyle = (styleDecl?.borderStyle || "").toLowerCase();
        const borderWidth = parseFloat(styleDecl?.borderWidth) || 0;
        if (borderStyle && borderStyle !== "none" && borderWidth > 0) return true;
        return /(underline|overline|line-through)/.test((styleDecl?.textDecorationLine || "").toLowerCase());
      };

      const addSelectorHint = (selector, styleDecl) => {
        if (!selector || /::/.test(selector)) return;
        if (!/:(focus-visible|focus)(?![-\w])/i.test(selector)) return;
        const baseSelector = selector
          .replace(/:(focus-visible|focus)(?![-\w])/gi, "")
          .replace(/\s+/g, " ")
          .trim();
        if (!baseSelector) return;
        hints.push({
          baseSelector,
          rawSelector: selector.trim().slice(0, 200),
          hasIndicator: hasVisibleIndicator(styleDecl),
        });
      };

      const walkRules = (rules) => {
        if (!rules) return;
        for (const rule of rules) {
          scannedRules++;
          if (scannedRules > 4000) break;
          if (rule?.type === CSSRule.STYLE_RULE) {
            const selectors = String(rule.selectorText || "").split(",").map(s => s.trim()).filter(Boolean);
            selectors.forEach(sel => addSelectorHint(sel, rule.style));
            continue;
          }
          if (rule?.cssRules && (rule.type === CSSRule.MEDIA_RULE || rule.type === CSSRule.SUPPORTS_RULE || rule.type === CSSRule.LAYER_BLOCK_RULE)) {
            walkRules(rule.cssRules);
          }
        }
      };

      for (const sheet of [...doc.styleSheets]) {
        try {
          if (sheet?.cssRules) walkRules(sheet.cssRules);
        } catch {
          inaccessibleSheets++;
        }
      }

      return { hints, scannedRules, inaccessibleSheets };
    })();

    const candidates = [...doc.querySelectorAll("a[href],button,[role='button'],[role='link'],[tabindex],input:not([type='hidden']),select,textarea")]
      .filter(isEl)
      .slice(0, 220);

    candidates.forEach(el => {
      if (isHidden(el) || hasInertAncestor(el)) return;
      if (!isKeyboardReachable(el)) return;
      try {
        const cs = w.getComputedStyle(el);
        const outlineStyle = cs.outlineStyle;
        const outlineWidth = parseFloat(cs.outlineWidth) || 0;
        const hasOutlineAtRest = outlineStyle !== "none" && outlineWidth > 0;
        const boxShadow = cs.boxShadow;
        const hasBoxShadowAtRest = boxShadow && boxShadow !== "none";
        const hasIndicatorAtRest = hasOutlineAtRest || hasBoxShadowAtRest;
        if (hasIndicatorAtRest) return;

        let matchedFocusRules = 0;
        let matchedIndicatorRules = 0;
        let matcherErrors = 0;
        for (const hint of focusHints.hints) {
          try {
            if (el.matches(hint.baseSelector)) {
              matchedFocusRules++;
              if (hint.hasIndicator) matchedIndicatorRules++;
            }
          } catch {
            matcherErrors++;
          }
        }

        if (matchedIndicatorRules > 0) return;

        add(findings, {
          type: "FOCUS_VISIBLE_SUPPRESSED",
          el,
          severity: "low",
          confidence: "advisory",
          note: "No visible focus indicator detected at rest and no matching :focus/:focus-visible indicator rule found. Verify manually.",
          extra: {
            outlineStyle: outlineStyle || null,
            outlineWidth,
            boxShadow: boxShadow === "none" ? "none" : "set",
            keyboardReachable: true,
            matchedFocusRules,
            matchedIndicatorRules,
            scannedFocusRules: focusHints.scannedRules,
            inaccessibleStylesheets: focusHints.inaccessibleSheets,
            matcherErrors,
          },
          fix: "Verify a visible :focus-visible style exists for this control. If focus style is delegated or injected at runtime, this finding can be ignored."
        });
      } catch {}
    });
  };

  RULE_REGISTRY.LOADER_WITHOUT_ANNOUNCEMENT_HOOK.run = ({ findings }) => {
    const cache = createPassCache();
    const loaders = collectLoaderCandidates(doc, 120).filter(el => looksLikeLoader(el, cache)).slice(0, 40);
    if (loaders.length && !hasAnnouncementHook()) {
      add(findings, {
        type: "LOADER_WITHOUT_ANNOUNCEMENT_HOOK",
        el: loaders[0],
        severity: "medium",
        note: "Loaders detected, but no aria-live/status/alert hook found in DOM."
      });
    }
  };

  const hasAnnouncementHook = () =>
    !!doc.querySelector("[aria-live='polite'],[aria-live='assertive'],[role='status'],[role='alert']");

  const DEFAULT_APP_MARKERS = "[data-testid^='GST_CHAT__'], #GST_CHAT__FEED, [data-testid*='HELP'], [data-testid*='HC']";

  const sanity = (appMarkersSel) => {
    const q = (sel) => { try { return doc.querySelectorAll(sel).length; } catch { return 0; } };
    const markers = appMarkersSel || DEFAULT_APP_MARKERS;
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
      appMarkers: q(markers),
      shadowRoots: (() => { let n = 0; for (const el of doc.querySelectorAll("*")) { if (el.shadowRoot) n++; if (n >= 50) break; } return n; })()
    };
  };

  // Mode detection — ARIA/role patterns first, product-specific testIds as fallback.
  // Can be overridden at runtime via cfg.modeHints in run() or via A11YFlowAudit.modeHints.
  const defaultModeHints = {
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

  // modeHints is the mutable reference used by detectMode.
  // It can be replaced at runtime by the panel via cfg.modeHints.
  let modeHints = defaultModeHints;

  const detectMode = () => {
    for (const [mode, hints] of Object.entries(modeHints)) {
      try {
        if (hints.url) {
          const pattern = hints.url instanceof RegExp ? hints.url : new RegExp(hints.url, "i");
          if (pattern.test(w.location.href)) return mode;
        }
        const sels = [...(hints.roles || []), ...(hints.testIds || [])];
        if (sels.length && doc.querySelector(sels.join(","))) return mode;
      } catch { /* invalid regex or selector — skip this hint */ }
    }
    return "auto";
  };

  const LOADER_CANDIDATE_SELECTOR = [
    "[aria-busy='true']",
    "[role='progressbar']",
    "[role='status']",
    "[class*='loader' i]",
    "[class*='loading' i]",
    "[class*='spinner' i]",
    "[class*='skeleton' i]",
    "[class*='shimmer' i]",
    "[id*='loader' i]",
    "[id*='loading' i]",
    "[data-testid*='load' i]",
    "[data-testid*='spinner' i]",
    "[data-testid*='skeleton' i]",
  ].join(",");

  const collectLoaderCandidates = (root = doc, limit = 120) => {
    const out = [];
    const seen = new Set();
    let list = [];
    try { list = root.querySelectorAll ? root.querySelectorAll(LOADER_CANDIDATE_SELECTOR) : []; } catch { list = []; }
    for (const el of list) {
      if (!isEl(el)) continue;
      const key = cssPath(el);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(el);
      if (out.length >= limit) break;
    }
    return out;
  };

  const looksLikeLoader = (el, cache = null) => {
    if (!isEl(el) || isHiddenCached(el, cache)) return false;
    const role = el.getAttribute("role");
    if (role === "progressbar" || role === "status") return true;
    if (el.getAttribute("aria-busy") === "true") return true;
    const s = `${(el.className || "").toString()} ${el.id || ""} ${testId(el) || ""}`.toLowerCase();
    if (/(loader|loading|spinner|skeleton|progress|shimmer)/.test(s)) return true;
    const t = txt(el.textContent, 50).toLowerCase();
    if (/(loading|please wait|connecting|fetching)/.test(t)) return true;
    // CSS animation/transition detection (spinner/skeleton patterns)
    try {
      const cs = getStyleCached(el, cache);
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
      const r = getRectCached(el, cache);
      if (r.width > 40 && r.height > 10 && r.height < 200) {
        try {
          const cs = getStyleCached(el, cache);
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

  const INTERACTIVE_ROLES = new Set([
    "button", "link", "checkbox", "switch", "radio", "menuitem", "menuitemcheckbox",
    "menuitemradio", "option", "tab", "textbox", "combobox", "slider", "spinbutton"
  ]);

  // WAI-ARIA 1.2 valid aria-* attributes
  const VALID_ARIA_ATTRS = new Set([
    "aria-activedescendant","aria-atomic","aria-autocomplete","aria-braillelabel",
    "aria-brailleroledescription","aria-busy","aria-checked","aria-colcount",
    "aria-colindex","aria-colindextext","aria-colspan","aria-controls","aria-current",
    "aria-describedby","aria-description","aria-details","aria-disabled",
    "aria-dropeffect","aria-errormessage","aria-expanded","aria-flowto","aria-grabbed",
    "aria-haspopup","aria-hidden","aria-invalid","aria-keyshortcuts","aria-label",
    "aria-labelledby","aria-level","aria-live","aria-modal","aria-multiline",
    "aria-multiselectable","aria-orientation","aria-owns","aria-placeholder",
    "aria-posinset","aria-pressed","aria-readonly","aria-relevant","aria-required",
    "aria-roledescription","aria-rowcount","aria-rowindex","aria-rowindextext",
    "aria-rowspan","aria-selected","aria-setsize","aria-sort","aria-valuemax",
    "aria-valuemin","aria-valuenow","aria-valuetext"
  ]);

  // WAI-ARIA 1.2 valid role values
  const VALID_ROLES = new Set([
    "alert","alertdialog","application","article","banner","blockquote","button",
    "caption","cell","checkbox","code","columnheader","combobox","command","comment",
    "complementary","composite","contentinfo","definition","deletion","dialog",
    "directory","document","emphasis","feed","figure","form","generic","grid",
    "gridcell","group","heading","img","input","insertion","landmark","link","list",
    "listbox","listitem","log","main","mark","marquee","math","menu","menubar",
    "menuitem","menuitemcheckbox","menuitemradio","meter","navigation","none","note",
    "option","paragraph","presentation","progressbar","radio","radiogroup","range",
    "region","roletype","row","rowgroup","rowheader","scrollbar","search","searchbox",
    "section","sectionhead","select","separator","slider","spinbutton","status",
    "strong","structure","subscript","superscript","switch","tab","table","tablist",
    "tabpanel","term","textbox","time","timer","toolbar","tooltip","tree","treegrid",
    "treeitem","widget","window"
  ]);

  // Required owned elements (children) by parent role
  const REQUIRED_CHILDREN = {
    tablist: [["tab"]], menu: [["menuitem","menuitemcheckbox","menuitemradio"]],
    menubar: [["menuitem","menuitemcheckbox","menuitemradio"]],
    list: [["listitem"]], listbox: [["option"]],
    tree: [["treeitem","group"]], treegrid: [["row"]],
    grid: [["row","rowgroup"]], table: [["row","rowgroup"]],
    radiogroup: [["radio"]], feed: [["article"]], rowgroup: [["row"]]
  };

  // Required context (parent) by child role
  const REQUIRED_PARENT = {
    tab: ["tablist"], menuitem: ["menu","menubar","group"],
    menuitemcheckbox: ["menu","menubar","group"],
    menuitemradio: ["menu","menubar","group"],
    option: ["listbox","group"], treeitem: ["tree","group"],
    listitem: ["list","group"], row: ["table","grid","treegrid","rowgroup"],
    cell: ["row"], gridcell: ["row"], columnheader: ["row"], rowheader: ["row"]
  };

  // WCAG 1.3.5 valid autocomplete tokens (HTML spec)
  const VALID_AUTOCOMPLETE = new Set([
    "off","on","name","honorific-prefix","given-name","additional-name","family-name",
    "honorific-suffix","nickname","email","username","new-password","current-password",
    "one-time-code","organization-title","organization","street-address","address-line1",
    "address-line2","address-line3","address-level4","address-level3","address-level2",
    "address-level1","country","country-name","postal-code","cc-name","cc-given-name",
    "cc-additional-name","cc-family-name","cc-number","cc-exp","cc-exp-month","cc-exp-year",
    "cc-csc","cc-type","transaction-currency","transaction-amount","language","bday",
    "bday-day","bday-month","bday-year","sex","tel","tel-country-code","tel-national",
    "tel-area-code","tel-local","tel-extension","impp","url","photo","webauthn"
  ]);

  // ARIA attribute value type validators
  const ARIA_BOOL_ATTRS = new Set([
    "aria-atomic","aria-busy","aria-disabled","aria-expanded","aria-grabbed",
    "aria-hidden","aria-modal","aria-multiline","aria-multiselectable","aria-readonly",
    "aria-required","aria-selected"
  ]);
  const ARIA_TRISTATE_ATTRS = new Set(["aria-checked","aria-pressed"]);
  const ARIA_INT_ATTRS = new Set([
    "aria-level","aria-posinset","aria-setsize","aria-colcount","aria-colindex",
    "aria-colspan","aria-rowcount","aria-rowindex","aria-rowspan"
  ]);
  const ARIA_NUM_ATTRS = new Set(["aria-valuenow","aria-valuemax","aria-valuemin"]);
  const ARIA_TOKEN_ATTRS = {
    "aria-autocomplete": new Set(["none","inline","list","both"]),
    "aria-current": new Set(["page","step","location","date","time","true","false"]),
    "aria-haspopup": new Set(["true","false","menu","listbox","tree","grid","dialog"]),
    "aria-invalid": new Set(["grammar","spelling","true","false"]),
    "aria-live": new Set(["off","polite","assertive"]),
    "aria-orientation": new Set(["horizontal","vertical","undefined"]),
    "aria-sort": new Set(["ascending","descending","none","other"]),
    "aria-relevant": new Set(["additions","removals","text","all","additions text"]),
    "aria-dropeffect": new Set(["copy","execute","link","move","none","popup"]),
  };
  const VALID_SCOPE_VALUES = new Set(["col","row","colgroup","rowgroup"]);

  const isNativeInteractiveControl = (el) => {
    if (!isEl(el)) return false;
    const tag = el.tagName;
    if (tag === "BUTTON") return true;
    if (tag === "A" && el.hasAttribute("href")) return true;
    if (tag === "SUMMARY") return true;
    if (tag === "INPUT") return (el.getAttribute("type") || "").toLowerCase() !== "hidden";
    return tag === "TEXTAREA" || tag === "SELECT";
  };

  const hasInertAncestor = (el) => {
    let node = el;
    while (isEl(node) && node !== doc.documentElement) {
      if (node.inert || node.hasAttribute?.("inert")) return true;
      node = node.parentElement;
    }
    return false;
  };

  const inlineKeyboardAttributes = ["onkeydown", "onkeyup", "onkeypress"];

  const extractActivationKeys = (handlerCode) => {
    const src = String(handlerCode || "").toLowerCase();
    const keys = [];
    if (!src) return keys;
    if (/\benter\b|key\s*===\s*['"]enter['"]|keycode\s*===\s*13|which\s*===\s*13/.test(src)) keys.push("Enter");
    if (/\bspace\b|key\s*===\s*['"] ['"]|keycode\s*===\s*32|which\s*===\s*32/.test(src)) keys.push("Space");
    return [...new Set(keys)];
  };

  const getInlineKeyboardMeta = (el) => {
    if (!isEl(el)) return { hasHandler: false, activationKeys: [] };
    let hasHandler = false;
    const activation = new Set();
    for (const attr of inlineKeyboardAttributes) {
      const code = el.getAttribute(attr);
      if (!code) continue;
      hasHandler = true;
      extractActivationKeys(code).forEach(k => activation.add(k));
    }
    return { hasHandler, activationKeys: [...activation] };
  };

  const getAncestorKeyboardMeta = (el, maxDepth = 3) => {
    let node = el?.parentElement || null;
    let depth = 0;
    while (node && depth < maxDepth) {
      const meta = getInlineKeyboardMeta(node);
      if (meta.hasHandler) return { hasHandler: true, distance: depth + 1, activationKeys: meta.activationKeys };
      node = node.parentElement;
      depth++;
    }
    return { hasHandler: false, distance: null, activationKeys: [] };
  };

  const getGlobalKeyboardMeta = () => {
    const activation = new Set();
    let hasHandler = false;
    [doc.body, doc.documentElement].forEach(node => {
      if (!isEl(node)) return;
      const meta = getInlineKeyboardMeta(node);
      if (!meta.hasHandler) return;
      hasHandler = true;
      meta.activationKeys.forEach(k => activation.add(k));
    });
    if (typeof w.onkeydown === "function" || typeof w.onkeyup === "function" || typeof w.onkeypress === "function") {
      hasHandler = true;
    }
    return { hasHandler, activationKeys: [...activation] };
  };

  const hasInlineKeyboardHandler = (el) => getInlineKeyboardMeta(el).hasHandler;

  const hasAncestorKeyboardHandler = (el, maxDepth = 3) => getAncestorKeyboardMeta(el, maxDepth).hasHandler;

  const getAncestorClickMeta = (el, maxDepth = 3) => {
    let node = el?.parentElement || null;
    let depth = 0;
    while (node && depth < maxDepth) {
      if (node.hasAttribute?.("onclick")) return { hasHandler: true, distance: depth + 1 };
      node = node.parentElement;
      depth++;
    }
    return { hasHandler: false, distance: null };
  };

  const hasPointerCursor = (el) => {
    try {
      return w.getComputedStyle(el).cursor === "pointer";
    } catch {
      return false;
    }
  };

  const hasInteractiveRole = (el) => INTERACTIVE_ROLES.has((el?.getAttribute?.("role") || "").toLowerCase());

  const isKeyboardReachable = (el) => {
    if (!isFocusable(el) || hasInertAncestor(el)) return false;
    if (isNativeInteractiveControl(el)) return true;
    const ti = el.getAttribute("tabindex");
    if (ti !== null) {
      const v = parseInt(ti, 10);
      return Number.isFinite(v) ? v >= 0 : false;
    }
    return false;
  };

  const isLikelyActionable = (el) => {
    if (!isEl(el)) return false;
    if (isNativeInteractiveControl(el)) return true;
    if (hasInteractiveRole(el)) return true;
    if (el.hasAttribute("onclick")) return true;
    return hasPointerCursor(el);
  };

  const isLikelyFocusSentinel = (el) => {
    if (!isEl(el)) return false;
    const attrSig = `${el.id || ""} ${(el.className || "").toString()} ${el.getAttribute("data-testid") || ""}`.toLowerCase();
    if (el.hasAttribute("data-focus-guard")) return true;
    if (/(focus-guard|focusguard|sentinel|focus-trap-guard|trap-focus)/.test(attrSig)) return true;
    const r = el.getBoundingClientRect();
    if (r.width <= 2 && r.height <= 2 && !getAccName(el) && !hasInteractiveRole(el) && !el.hasAttribute("onclick")) return true;
    return false;
  };

  const isInlineTextLinkException = (el) => {
    if (!isEl(el) || el.tagName !== "A" || !el.hasAttribute("href")) return false;
    const role = (el.getAttribute("role") || "").toLowerCase();
    if (role && role !== "link") return false;
    let cs;
    try { cs = w.getComputedStyle(el); } catch { return false; }
    if (!cs || cs.display !== "inline") return false;
    const ownText = txt(el.textContent, 120);
    if (ownText.length < 2) return false;
    const p = el.parentElement;
    if (!p) return false;
    const parentText = txt(p.textContent, 240);
    if (!parentText) return false;
    return ownText.length < parentText.length;
  };

  const hasLargerInteractiveAncestor = (el) => {
    const parentInteractive = el.parentElement?.closest?.("button,a[href],[role='button'],[role='link'],label");
    if (!parentInteractive || parentInteractive === el || !isEl(parentInteractive)) return false;
    try {
      const r = parentInteractive.getBoundingClientRect();
      return r.width >= 24 && r.height >= 24;
    } catch {
      return false;
    }
  };

  const parseCssTimeMaxSeconds = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return 0;
    const parts = raw.split(",").map(s => s.trim()).filter(Boolean);
    let max = 0;
    for (const part of parts) {
      const lower = part.toLowerCase();
      if (lower.endsWith("ms")) {
        const n = parseFloat(lower);
        if (Number.isFinite(n)) max = Math.max(max, n / 1000);
        continue;
      }
      if (lower.endsWith("s")) {
        const n = parseFloat(lower);
        if (Number.isFinite(n)) max = Math.max(max, n);
      }
    }
    return max;
  };

  const isLikelyTransitioning = (el) => {
    if (!isEl(el)) return false;
    try {
      const cs = w.getComputedStyle(el);
      const transitionSec = parseCssTimeMaxSeconds(cs.transitionDuration);
      const animationSec = parseCssTimeMaxSeconds(cs.animationDuration);
      if (transitionSec > 0) return true;
      if (animationSec > 0 && (cs.animationName || "").toLowerCase() !== "none") return true;
    } catch {}
    return false;
  };

  const keyboardReachabilityReason = (el) => {
    if (!isEl(el)) return "not_reachable";
    if (isNativeInteractiveControl(el)) return "native";
    const ti = el.getAttribute("tabindex");
    if (ti !== null) {
      const v = parseInt(ti, 10);
      if (Number.isFinite(v) && v >= 0) return "tabindex";
    }
    return "implicit_or_unknown";
  };

  const focusableTypeForEvidence = (el) => {
    if (!isEl(el)) return "unknown";
    if (isNativeInteractiveControl(el)) return `native:${el.tagName.toLowerCase()}`;
    const role = (el.getAttribute("role") || "").toLowerCase();
    if (role) return `role:${role}`;
    const ti = el.getAttribute("tabindex");
    if (ti !== null) return `tabindex:${ti}`;
    return el.tagName.toLowerCase();
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
    let node = el;
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

  let observeInFlight = null;
  let watchInFlight = null;

  // ---------------- main checks ----------------
  const run = (cfg = {}) => {
    // Apply runtime mode hints if provided (from panel profiles)
    if (cfg.modeHints && typeof cfg.modeHints === "object") {
      modeHints = { ...defaultModeHints, ...cfg.modeHints };
    }

    const config = {
      strict: cfg.strict ?? true,
      mode: cfg.mode ?? detectMode(),
      maxRows: cfg.maxRows ?? 140,
      wcagLevel: cfg.wcagLevel ?? "2.1-AA"
    };
    const transitionCtx = {
      duringTransition: !!cfg.duringTransition,
      source: cfg.transitionSource || "none",
    };

    const [wcagVersionStr, wcagConformance] = config.wcagLevel.split("-");
    const wcagVersion = parseFloat(wcagVersionStr) || 2.1;
    const isAAA = wcagConformance === "AAA";
    const is22 = wcagVersion >= 2.2;

    const s = sanity(cfg.appMarkers || null);
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

      // CHAT_MESSAGE_NO_ROLE: Direct children of role=log without semantic role
      doc.querySelectorAll("[role='log']").forEach(log => {
        if (isHidden(log)) return;
        [...log.children].forEach(child => {
          if (!isEl(child) || isHidden(child)) return;
          const role = child.getAttribute("role");
          const tag = child.tagName;
          const isSemantic = role || ["LI","ARTICLE","SECTION","P"].includes(tag);
          if (!isSemantic) {
            add(findings, {
              type: "CHAT_MESSAGE_NO_ROLE", el: child, severity: "low", wcag: "1.3.1",
              product: "chat",
              note: `Direct child of role="log" (${tag.toLowerCase()}) has no semantic role — screen readers may not convey message boundaries.`
            });
          }
        });
      });

      // CHAT_INPUT_NO_LABEL: Textarea/input near role=log without label
      const seenChatInputs = new Set();
      doc.querySelectorAll("[role='log']").forEach(log => {
        if (isHidden(log)) return;
        const container = log.parentElement || doc.body;
        container.querySelectorAll("textarea, input[type='text'], input:not([type])").forEach(inp => {
          if (seenChatInputs.has(inp)) return;
          seenChatInputs.add(inp);
          if (isHidden(inp)) return;
          const name = getAccName(inp);
          if (!name || name.startsWith("[placeholder]")) {
            add(findings, {
              type: "CHAT_INPUT_NO_LABEL", el: inp, severity: "medium", wcag: "1.3.1 / 4.1.2",
              product: "chat",
              note: "Chat input/textarea near role=\"log\" has no accessible label (placeholder alone is insufficient)."
            });
          }
        });
      });

      // CHAT_TIMESTAMP_INACCESSIBLE: Timestamp elements in role=log that are aria-hidden with no alt
      doc.querySelectorAll("[role='log']").forEach(log => {
        if (isHidden(log)) return;
        log.querySelectorAll("[aria-hidden='true']").forEach(hidden => {
          const text = (hidden.textContent || "").trim();
          if (!text) return;
          if (!/\d/.test(text)) return; // likely not a timestamp
          if (/(am|pm|:\d{2}|ago|yesterday|today|\d{1,2}\/\d{1,2})/i.test(text)) {
            const parent = hidden.parentElement;
            const parentHasAlt = parent && (parent.getAttribute("aria-label") || parent.getAttribute("title"));
            if (!parentHasAlt) {
              add(findings, {
                type: "CHAT_TIMESTAMP_INACCESSIBLE", el: hidden, severity: "low", wcag: "1.3.1",
                product: "chat",
                note: `Timestamp "${txt(text, 40)}" is aria-hidden with no accessible alternative on parent.`
              });
            }
          }
        });
      });

      // CHAT_SEND_NO_LABEL: Send/submit button near chat input with no accessible name (icon-only)
      doc.querySelectorAll("[role='log']").forEach(log => {
        if (isHidden(log)) return;
        const container = log.parentElement || doc.body;
        container.querySelectorAll("button,[role='button'],input[type='submit']").forEach(btn => {
          if (isHidden(btn)) return;
          const name = getAccName(btn);
          if (!name) {
            add(findings, { type: "CHAT_SEND_NO_LABEL", el: btn, severity: "medium", wcag: "4.1.2",
              product: "chat",
              note: "Button near chat log has no accessible name — likely an icon-only send button." });
          }
        });
      });

      // CHAT_AVATAR_NO_ALT: Avatar images inside role=log without alt
      doc.querySelectorAll("[role='log'] img").forEach(img => {
        if (isHidden(img)) return;
        if (!img.hasAttribute("alt")) {
          const src = (img.getAttribute("src") || "").toLowerCase();
          if (/(avatar|profile|photo|user|agent|bot)/i.test(src) || img.closest("[class*='avatar'],[class*='Avatar']")) {
            add(findings, { type: "CHAT_AVATAR_NO_ALT", el: img, severity: "low", wcag: "1.1.1",
              product: "chat",
              note: "Avatar image in chat log has no alt attribute. AT will read the filename." });
          }
        }
      });

      // CHAT_NO_ARIA_RELEVANT: role=log without aria-relevant
      doc.querySelectorAll("[role='log']").forEach(log => {
        if (isHidden(log)) return;
        if (!log.hasAttribute("aria-relevant")) {
          add(findings, { type: "CHAT_NO_ARIA_RELEVANT", el: log, severity: "low", wcag: "4.1.3",
            product: "chat",
            note: 'role="log" without aria-relevant. Add aria-relevant="additions" so only new messages are announced.' });
        }
      });

      // CHAT_TYPING_NO_ANNOUNCEMENT: Typing indicator with no live region
      doc.querySelectorAll("[role='log']").forEach(log => {
        if (isHidden(log)) return;
        const container = log.parentElement || doc.body;
        const typingEls = container.querySelectorAll("[class*='typing'],[class*='Typing'],[data-testid*='typing'],[data-testid*='Typing']");
        typingEls.forEach(el => {
          const inLive = el.closest("[aria-live]");
          if (!inLive) {
            add(findings, { type: "CHAT_TYPING_NO_ANNOUNCEMENT", el, severity: "low", wcag: "4.1.3",
              product: "chat",
              note: "Typing indicator is not inside an aria-live region. Screen readers won't announce when someone is typing." });
          }
        });
      });
    }

    // -------- Help center tree checks --------
    if (mode === "helpcenter-tree" || mode === "auto") {
      // HC_TREE_ITEM_NO_NAME: treeitem without accessible name
      doc.querySelectorAll("[role='treeitem']").forEach(el => {
        if (isHidden(el)) return;
        const name = getAccName(el);
        if (!name) {
          add(findings, {
            type: "HC_TREE_ITEM_NO_NAME", el, severity: "high", wcag: "4.1.2",
            product: "helpcenter",
            note: "role=\"treeitem\" has no accessible name — screen readers cannot announce this item."
          });
        }
      });

      // HC_TREE_NO_ARIA_EXPANDED: treeitem with child group but no aria-expanded
      doc.querySelectorAll("[role='treeitem']").forEach(el => {
        if (isHidden(el)) return;
        const hasGroup = el.querySelector("[role='group']") || (el.nextElementSibling && el.nextElementSibling.getAttribute("role") === "group");
        if (hasGroup && !el.hasAttribute("aria-expanded")) {
          add(findings, {
            type: "HC_TREE_NO_ARIA_EXPANDED", el, severity: "medium", wcag: "4.1.2",
            product: "helpcenter",
            note: "role=\"treeitem\" has a child role=\"group\" but no aria-expanded — screen readers cannot convey expand/collapse state."
          });
        }
      });
    }

    // -------- Help center article check --------
    if (mode === "helpcenter-bot" || mode === "helpcenter-tree" || mode === "auto") {
      doc.querySelectorAll("article, [role='article']").forEach(el => {
        if (isHidden(el)) return;
        const textLen = (el.textContent || "").trim().length;
        if (textLen < 100) return;
        const hasHeading = !!el.querySelector("h1,h2,h3,h4,h5,h6,[role='heading']");
        if (!hasHeading) {
          add(findings, {
            type: "HC_ARTICLE_NO_HEADING", el, severity: "medium", wcag: "1.3.1 / 2.4.6",
            product: "helpcenter",
            note: `Article with ${textLen} chars of text has no heading — screen reader users cannot navigate its structure.`
          });
        }
      });

      // HC_SEARCH_NO_LABEL: Search input without accessible label
      doc.querySelectorAll("input[type='search'],input[placeholder*='earch' i],input[placeholder*='Find' i],[role='searchbox']").forEach(inp => {
        if (isHidden(inp)) return;
        const name = getAccName(inp);
        if (!name || name.startsWith("[placeholder]")) {
          add(findings, { type: "HC_SEARCH_NO_LABEL", el: inp, severity: "medium", wcag: "1.3.1 / 4.1.2",
            product: "helpcenter",
            note: "Search input has no accessible label (placeholder alone is insufficient)." });
        }
      });

      // HC_BREADCRUMB_NO_LABEL: Breadcrumb nav without aria-label
      doc.querySelectorAll("nav").forEach(nav => {
        if (isHidden(nav)) return;
        const links = nav.querySelectorAll("a[href]");
        if (links.length < 2) return;
        const hasSep = nav.textContent.match(/[›»>\/]/);
        const hasBreadcrumbClass = /breadcrumb/i.test(nav.className || "");
        if ((hasSep || hasBreadcrumbClass) && !nav.hasAttribute("aria-label") && !nav.hasAttribute("aria-labelledby")) {
          add(findings, { type: "HC_BREADCRUMB_NO_LABEL", el: nav, severity: "low", wcag: "1.3.1",
            product: "helpcenter",
            note: 'Breadcrumb <nav> has no aria-label. Add aria-label="Breadcrumb" to distinguish from other nav elements.' });
        }
      });

      // HC_ACCORDION_NO_STATE: Accordion/FAQ trigger button without aria-expanded
      doc.querySelectorAll("button,[role='button']").forEach(btn => {
        if (isHidden(btn)) return;
        if (btn.hasAttribute("aria-expanded")) return;
        const next = btn.nextElementSibling;
        const parent = btn.parentElement;
        const isAccordionLike =
          /accordion|faq|collaps|expand/i.test(btn.className || "") ||
          /accordion|faq|collaps|expand/i.test(parent?.className || "") ||
          (next && (next.hasAttribute("hidden") || /accordion|panel|collaps/i.test(next.className || "")));
        if (isAccordionLike) {
          add(findings, { type: "HC_ACCORDION_NO_STATE", el: btn, severity: "medium", wcag: "4.1.2",
            product: "helpcenter",
            note: "Accordion trigger button has no aria-expanded. Screen readers cannot convey open/closed state." });
        }
      });
    }

    // -------- General checks (any mode) --------

    // LIVE_REGION_HIDDEN: aria-live region with display:none or visibility:hidden
    doc.querySelectorAll("[aria-live]").forEach(el => {
      if (!el.getAttribute("aria-live")) return;
      try {
        const cs = w.getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") {
          add(findings, {
            type: "LIVE_REGION_HIDDEN", el, severity: "medium", wcag: "4.1.3",
            note: `aria-live="${el.getAttribute("aria-live")}" region is hidden (${cs.display === "none" ? "display:none" : "visibility:hidden"}) — announcements will never fire.`
          });
        }
      } catch {}
    });

    // COMBOBOX_NO_LISTBOX: role=combobox without associated listbox/tree/grid
    doc.querySelectorAll("[role='combobox']").forEach(el => {
      if (isHidden(el)) return;
      const owns = el.getAttribute("aria-owns") || el.getAttribute("aria-controls") || "";
      const ownedIds = owns.split(/\s+/).filter(Boolean);
      const hasPopup = ownedIds.some(id => {
        const target = doc.getElementById(id);
        if (!target) return false;
        const r = target.getAttribute("role");
        return r === "listbox" || r === "tree" || r === "grid";
      });
      // Also check for a listbox/tree/grid child
      const hasChild = !!el.querySelector("[role='listbox'],[role='tree'],[role='grid']");
      if (!hasPopup && !hasChild) {
        add(findings, {
          type: "COMBOBOX_NO_LISTBOX", el, severity: "medium", wcag: "4.1.2",
          note: "role=\"combobox\" has no associated listbox/tree/grid via aria-owns/aria-controls or as a descendant."
        });
      }
    });

    // -------- Loader/status smell --------
    RULE_REGISTRY.LOADER_WITHOUT_ANNOUNCEMENT_HOOK.run({ findings });

    // -------- Additional checks --------

    // 4.1.1 Parsing: duplicate IDs (breaks ARIA references in microfrontends)
    // Pass 1: collect all elements per ID
    const idElements = new Map();
    doc.querySelectorAll("[id]").forEach(el => {
      const id = el.id;
      if (!id) return;
      if (!idElements.has(id)) idElements.set(id, []);
      idElements.get(id).push(el);
    });
    // Pass 1.5: build set of IDs referenced by ARIA attrs
    const ariaReferencedIds = new Set();
    ["aria-labelledby","aria-describedby","aria-controls","aria-owns","aria-activedescendant"].forEach(attr => {
      doc.querySelectorAll(`[${attr}]`).forEach(el => {
        (el.getAttribute(attr) || "").split(/\s+/).filter(Boolean).forEach(id => ariaReferencedIds.add(id));
      });
    });
    // Pass 2: report every occurrence of duplicated IDs
    for (const [id, elements] of idElements) {
      if (elements.length < 2) continue;
      const ariaReferenced = ariaReferencedIds.has(id);
      const sev = ariaReferenced ? "high" : "medium";
      elements.forEach((el, idx) => {
        add(findings, {
          type: "DUPLICATE_ID", el, severity: sev, wcag: "4.1.1",
          note: `Duplicate id="${id}" (${idx + 1}/${elements.length})${ariaReferenced ? " — referenced by ARIA attributes" : ""}.`,
          extra: { id, occurrence: idx + 1, total: elements.length, ariaReferenced }
        });
      });
    }

    // 2.4.7 Focus Visible: interactive elements suppressing outline without replacement
    RULE_REGISTRY.FOCUS_VISIBLE_SUPPRESSED.run({ findings });

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

    // 2.1.1 Keyboard: clickable custom controls missing reliable keyboard support
    doc.querySelectorAll("[onclick],[role='button'],[role='link']").forEach(el => {
      if (isHidden(el) || hasInertAncestor(el)) return;
      if ((el.getAttribute("aria-hidden") || "").toLowerCase() === "true") return;
      if ((el.getAttribute("aria-disabled") || "").toLowerCase() === "true") return;
      if (el.hasAttribute("disabled")) return;
      if (isNativeInteractiveControl(el)) return;

      const role = (el.getAttribute("role") || "").toLowerCase();
      const clickSelf = el.hasAttribute("onclick");
      const clickAncestor = getAncestorClickMeta(el, 3);
      const hasClickHint = clickSelf || clickAncestor.hasHandler || hasPointerCursor(el) || role === "button" || role === "link";
      if (!hasClickHint) return;

      const clickHandlerScope = clickSelf ? "self" : (clickAncestor.hasHandler ? "ancestor" : "delegated");
      const tabIndex = el.getAttribute("tabindex");
      const keyboardReachable = isKeyboardReachable(el);
      const selfKeyMeta = getInlineKeyboardMeta(el);
      const ancestorKeyMeta = getAncestorKeyboardMeta(el, 3);
      const globalKeyMeta = getGlobalKeyboardMeta();
      const hasKeyHandlerSelf = selfKeyMeta.hasHandler;
      const hasKeyHandlerAncestor = ancestorKeyMeta.hasHandler;
      const hasKeyHandlerGlobal = globalKeyMeta.hasHandler;
      const selfHasActivation = selfKeyMeta.activationKeys.includes("Enter") || selfKeyMeta.activationKeys.includes("Space");
      const keydownScope = hasKeyHandlerSelf
        ? "self"
        : hasKeyHandlerAncestor
          ? "ancestor"
          : hasKeyHandlerGlobal
            ? "global"
            : "none";
      const activationKeysObserved = keydownScope === "self"
        ? selfKeyMeta.activationKeys
        : keydownScope === "ancestor"
          ? ancestorKeyMeta.activationKeys
          : keydownScope === "global"
            ? globalKeyMeta.activationKeys
            : [];

      if (!keyboardReachable) {
        add(findings, {
          type: "CLICK_WITHOUT_KEYBOARD",
          el,
          severity: "low",
          wcag: "2.1.1",
          confidence: "advisory",
          note: "Clickable custom control is not keyboard reachable. Verify tabindex/focus order and keyboard activation manually.",
          extra: {
            role: role || null,
            tabIndex,
            hasClickHandler: hasClickHint,
            clickHandlerScope,
            keyboardReachable,
            hasKeyHandlerSelf,
            hasKeyHandlerAncestor,
            keyHandlerScope: keydownScope,
            handlerDistance: ancestorKeyMeta.distance,
            activationKeysObserved,
            activationUnproven: true,
          },
          fix: "Make this control keyboard reachable (tabindex=0 when appropriate) and ensure Enter/Space activation."
        });
        return;
      }

      if (selfHasActivation) return;

      if (hasKeyHandlerAncestor || hasKeyHandlerGlobal) {
        add(findings, {
          type: "CLICK_WITHOUT_KEYBOARD",
          el,
          severity: "low",
          wcag: "2.1.1",
          confidence: "advisory",
          note: "Keyboard handling appears to be delegated on ancestor/global scope. Activation for this element is not proven.",
          extra: {
            role: role || null,
            tabIndex,
            hasClickHandler: hasClickHint,
            clickHandlerScope,
            keyboardReachable,
            hasKeyHandlerSelf,
            hasKeyHandlerAncestor,
            keyHandlerScope: keydownScope,
            handlerDistance: ancestorKeyMeta.distance,
            activationKeysObserved,
            activationUnproven: true,
          },
          fix: "Verify Enter/Space activates this control. Keep delegated handlers tied to explicit target checks."
        });
        return;
      }

      add(findings, {
        type: "CLICK_WITHOUT_KEYBOARD",
        el,
        severity: role === "button" || role === "link" ? "high" : "medium",
        wcag: "2.1.1",
        confidence: "strict",
        note: "Clickable custom control is focusable but no keyboard activation handler was detected.",
        extra: {
          role: role || null,
          tabIndex,
          hasClickHandler: hasClickHint,
          clickHandlerScope,
          keyboardReachable,
          hasKeyHandlerSelf,
          hasKeyHandlerAncestor,
          keyHandlerScope: "none",
          handlerDistance: null,
          activationKeysObserved: [],
          activationUnproven: false,
        },
      });
    });

    // 4.1.2: aria-hidden="true" containing focusable elements
    const seenAriaHiddenFocusable = new Set();
    doc.querySelectorAll("[aria-hidden='true']").forEach(container => {
      if (container.parentElement?.closest?.("[aria-hidden='true']")) return;
      if (isHidden(container)) return;
      if (hasInertAncestor(container)) return;
      const containerPath = cssPath(container);
      const containerRole = container.getAttribute("role") || null;
      const ariaHiddenValue = container.getAttribute("aria-hidden");
      const inertPresent = !!(container.inert || container.hasAttribute("inert"));
      const containerTransitioning = transitionCtx.duringTransition || isLikelyTransitioning(container);
      container.querySelectorAll(focusableSelector).forEach(el => {
        if (isHidden(el) || hasInertAncestor(el)) return;
        if (isLikelyFocusSentinel(el)) return;
        const childPath = cssPath(el);
        const dedupeKey = `${containerPath}=>${childPath}`;
        if (seenAriaHiddenFocusable.has(dedupeKey)) return;
        seenAriaHiddenFocusable.add(dedupeKey);
        if (!isKeyboardReachable(el)) return;
        if (!isLikelyActionable(el)) return;
        const ti = el.getAttribute("tabindex");
        if (ti !== null && parseInt(ti, 10) < 0) return;
        const strictViolation = !containerTransitioning && !inertPresent;
        add(findings, {
          type: "ARIA_HIDDEN_FOCUSABLE",
          el,
          severity: strictViolation ? "high" : "low",
          wcag: "4.1.2",
          confidence: strictViolation ? "strict" : "advisory",
          note: strictViolation
            ? "Keyboard-reachable actionable element exists inside aria-hidden=true content."
            : "Focusable element found in aria-hidden container during transition-like state; verify final focus state.",
          extra: {
            containerPath,
            focusableChildPath: childPath,
            containerRole,
            ariaHiddenValue,
            inertPresent,
            focusableType: focusableTypeForEvidence(el),
            reachabilityReason: keyboardReachabilityReason(el),
            tabIndex: ti,
            keyboardReachable: true,
            actionable: true,
            duringTransition: containerTransitioning,
            transitionSource: transitionCtx.source,
          }
        });
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

    // 2.5.8 Target Size (Minimum): interactive elements smaller than 24x24px
    doc.querySelectorAll("button,a[href],[role='button'],[role='link'],input:not([type='hidden']),select,textarea").forEach(el => {
      if (isHidden(el) || hasInertAncestor(el)) return;
      if ((el.getAttribute("aria-disabled") || "").toLowerCase() === "true") return;
      if (el.hasAttribute("disabled")) return;
      const hasProxyTarget = hasLargerInteractiveAncestor(el);
      if (hasProxyTarget) return;
      if (!isLikelyActionable(el) && !isNativeInteractiveControl(el)) return;
      const r = el.getBoundingClientRect();
      const width = Math.round(r.width);
      const height = Math.round(r.height);
      if (width > 0 && height > 0 && (width < 24 || height < 24)) {
        const inlineTextLink = isInlineTextLinkException(el);
        if (inlineTextLink) return;
        let display = null;
        try { display = w.getComputedStyle(el).display; } catch {}
        add(findings, {
          type: "TOUCH_TARGET_TOO_SMALL",
          el,
          severity: "low",
          note: `Size ${width}x${height}px is below 24x24px. Verify target size/hit area meets WCAG 2.2.`,
          extra: {
            width,
            height,
            display,
            inlineTextLinkException: inlineTextLink,
            proxyTargetAncestor: hasProxyTarget,
          },
          fix: "Verify clickable hit-area is at least 24x24px. If hit-area is expanded by wrapper/pseudo-element, this finding may be ignored."
        });
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

    // -------- Tier 1: Extended checks --------

    // 4.1.2: aria-hidden on body/html hides entire page from AT
    if (doc.body?.getAttribute("aria-hidden") === "true" || doc.documentElement.getAttribute("aria-hidden") === "true") {
      add(findings, { type: "ARIA_HIDDEN_ON_BODY", severity: "high", wcag: "4.1.2",
        el: doc.body?.getAttribute("aria-hidden") === "true" ? doc.body : doc.documentElement,
        note: 'aria-hidden="true" on <body> or <html> hides the entire page from assistive technology.' });
    }

    // 2.4.2: Document title missing or empty
    const titleEl = doc.querySelector("title");
    if (!titleEl || !titleEl.textContent.trim()) {
      add(findings, { type: "DOCUMENT_TITLE_MISSING", severity: "medium", wcag: "2.4.2",
        el: doc.head || doc.documentElement, note: "Page has no <title> or title is empty." });
    }

    // 2.2.1: Meta refresh auto-redirect
    const metaRefresh = doc.querySelector("meta[http-equiv='refresh' i]");
    if (metaRefresh) {
      add(findings, { type: "META_REFRESH", severity: "high", wcag: "2.2.1", el: metaRefresh,
        note: "meta refresh detected. This can disorient users and cause content to change unexpectedly." });
    }

    // 1.4.2: Autoplay audio/video without muted
    doc.querySelectorAll("audio[autoplay],video[autoplay]").forEach(el => {
      if (isHidden(el)) return;
      if (!el.hasAttribute("muted")) {
        add(findings, { type: "NO_AUTOPLAY_AUDIO", severity: "high", wcag: "1.4.2", el,
          note: `<${el.tagName.toLowerCase()}> has autoplay without muted. May play audio automatically.` });
      }
    });

    // 3.1.1: HTML lang attribute has invalid value
    const langVal = doc.documentElement.getAttribute("lang");
    if (langVal) {
      const langPrimary = langVal.split("-")[0].toLowerCase();
      if (!/^[a-z]{2,3}$/.test(langPrimary)) {
        add(findings, { type: "HTML_LANG_VALID", severity: "medium", wcag: "3.1.1",
          el: doc.documentElement, note: `lang="${langVal}" is not a valid language tag.`,
          extra: { lang: langVal } });
      }
    }

    // 4.1.2: Nested interactive elements (button inside link, link inside button, etc.)
    doc.querySelectorAll("button,a[href],[role='button'],[role='link']").forEach(outer => {
      if (isHidden(outer)) return;
      const nested = outer.querySelectorAll("button,a[href],input:not([type='hidden']),select,textarea,[role='button'],[role='link'],[role='checkbox'],[role='radio'],[tabindex]");
      nested.forEach(inner => {
        if (inner === outer) return;
        const ti = inner.getAttribute("tabindex");
        if (ti !== null && parseInt(ti, 10) < 0) return;
        add(findings, { type: "NESTED_INTERACTIVE", severity: "high", wcag: "4.1.2", el: inner,
          note: `Interactive <${inner.tagName.toLowerCase()}> nested inside <${outer.tagName.toLowerCase()}>. Creates unpredictable AT behavior.`,
          extra: { outer: outer.tagName.toLowerCase(), inner: inner.tagName.toLowerCase() } });
      });
    });

    // 1.3.1: Empty headings
    doc.querySelectorAll("h1,h2,h3,h4,h5,h6,[role='heading']").forEach(el => {
      if (isHidden(el)) return;
      if (!getAccName(el).trim()) {
        add(findings, { type: "EMPTY_HEADING", severity: "medium", wcag: "1.3.1", el,
          note: `Empty ${el.tagName?.toLowerCase() || 'heading'} element provides no navigation value for AT users.` });
      }
    });

    // 1.3.1: Empty table headers
    doc.querySelectorAll("th").forEach(el => {
      if (isHidden(el)) return;
      if (!getAccName(el).trim() && !el.textContent.trim()) {
        add(findings, { type: "EMPTY_TABLE_HEADER", severity: "medium", wcag: "1.3.1", el,
          note: "Empty <th> element. Screen readers use header text to describe table cell context." });
      }
    });

    // 4.1.2: Dialog without accessible name
    doc.querySelectorAll("dialog,[role='dialog'],[role='alertdialog']").forEach(el => {
      if (isHidden(el)) return;
      if (!getAccName(el).trim()) {
        add(findings, { type: "DIALOG_NO_ACCESSIBLE_NAME", severity: "high", wcag: "4.1.2", el,
          note: "Dialog has no accessible name. Add aria-label or aria-labelledby." });
      }
    });

    // 2.4.4: Suspicious link text
    const suspiciousLinkRe = /^(click here|here|read more|more|learn more|link|this|go|download|details|continue|info|page|this page|this link)$/i;
    doc.querySelectorAll("a[href]").forEach(el => {
      if (isHidden(el)) return;
      const linkText = (el.textContent || "").trim();
      if (linkText && suspiciousLinkRe.test(linkText)) {
        add(findings, { type: "LINK_SUSPICIOUS_TEXT", severity: "low", wcag: "2.4.4", el,
          note: `Link text "${txt(linkText, 30)}" is not descriptive of the destination.`,
          extra: { text: txt(linkText, 30) } });
      }
    });

    // 2.1.1: Scrollable container not keyboard-accessible
    doc.querySelectorAll("div,section,article,aside,nav,ul,ol").forEach(el => {
      if (isHidden(el)) return;
      try {
        const cs = w.getComputedStyle(el);
        const scrollable = cs.overflowY === "scroll" || cs.overflowY === "auto" || cs.overflowX === "scroll" || cs.overflowX === "auto";
        if (!scrollable) return;
        if (el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth) return;
        if (el.getAttribute("tabindex") !== null) return;
        if (el.querySelector("a[href],button,input,select,textarea,[tabindex]")) return;
        add(findings, { type: "SCROLLABLE_NOT_FOCUSABLE", severity: "medium", wcag: "2.1.1", el,
          note: "Scrollable container is not keyboard-accessible. Mouse-only users can scroll; keyboard users cannot." });
      } catch {}
    });

    // 4.1.2: Invalid ARIA role value
    doc.querySelectorAll("[role]").forEach(el => {
      if (isHidden(el)) return;
      const roleRaw = (el.getAttribute("role") || "").trim().toLowerCase();
      if (!roleRaw) return;
      const rolePrimary = roleRaw.split(/\s+/)[0];
      if (!VALID_ROLES.has(rolePrimary)) {
        add(findings, { type: "ARIA_VALID_ROLE", severity: "high", wcag: "4.1.2", el,
          note: `role="${rolePrimary}" is not a valid WAI-ARIA role.`, extra: { role: rolePrimary } });
      }
    });

    // 4.1.2: Invalid aria-* attribute names (typos)
    {
      const allEls = doc.querySelectorAll("*");
      const elLimit = Math.min(allEls.length, 3000);
      for (let i = 0; i < elLimit; i++) {
        const el = allEls[i];
        for (const attr of el.attributes) {
          if (!attr.name.startsWith("aria-")) continue;
          if (VALID_ARIA_ATTRS.has(attr.name)) continue;
          let suggestion = null;
          for (const valid of VALID_ARIA_ATTRS) {
            if (Math.abs(valid.length - attr.name.length) <= 2 && valid.startsWith(attr.name.slice(0, 6))) {
              suggestion = valid; break;
            }
          }
          add(findings, { type: "ARIA_VALID_ATTR", severity: "high", wcag: "4.1.2", el,
            note: `"${attr.name}" is not a recognized ARIA attribute.`,
            extra: { attr: attr.name, suggestion } });
        }
      }
    }

    // 1.3.1: ARIA required children missing
    for (const [parentRole, childRoleSets] of Object.entries(REQUIRED_CHILDREN)) {
      doc.querySelectorAll(`[role="${parentRole}"]`).forEach(el => {
        if (isHidden(el)) return;
        const children = el.querySelectorAll("[role]");
        const childRoles = new Set([...children].map(c => c.getAttribute("role")));
        for (const acceptable of childRoleSets) {
          if (acceptable.some(r => childRoles.has(r))) continue;
          const hasNativeChild = (parentRole === "list" && el.querySelector("li")) ||
            (parentRole === "table" && el.querySelector("tr")) ||
            (parentRole === "grid" && el.querySelector("tr")) ||
            (parentRole === "radiogroup" && el.querySelector("input[type='radio']"));
          if (hasNativeChild) return;
          add(findings, { type: "ARIA_REQUIRED_CHILDREN", severity: "high", wcag: "1.3.1", el,
            note: `role="${parentRole}" requires child with role="${acceptable.join('" or "')}".`,
            extra: { role: parentRole, expected: acceptable.join("|") } });
        }
      });
    }

    // 1.3.1: ARIA required parent context missing
    for (const [childRole, parentRoles] of Object.entries(REQUIRED_PARENT)) {
      doc.querySelectorAll(`[role="${childRole}"]`).forEach(el => {
        if (isHidden(el)) return;
        let parent = el.parentElement;
        let found = false;
        while (parent && parent !== doc.body) {
          const pRole = parent.getAttribute("role");
          if (pRole && parentRoles.includes(pRole)) { found = true; break; }
          const tag = parent.tagName;
          if (childRole === "listitem" && (tag === "UL" || tag === "OL")) { found = true; break; }
          if (childRole === "row" && (tag === "TABLE" || tag === "THEAD" || tag === "TBODY" || tag === "TFOOT")) { found = true; break; }
          if ((childRole === "cell" || childRole === "columnheader" || childRole === "rowheader") && tag === "TR") { found = true; break; }
          parent = parent.parentElement;
        }
        if (!found) {
          add(findings, { type: "ARIA_REQUIRED_PARENT", severity: "high", wcag: "1.3.1", el,
            note: `role="${childRole}" must be owned by role="${parentRoles.join('" or "')}".`,
            extra: { role: childRole, expected: parentRoles.join("|") } });
        }
      });
    }

    // 4.1.2: ARIA attribute not allowed on this role
    {
      const DENIED_ATTRS = {
        textbox: new Set(["aria-checked","aria-selected","aria-pressed"]),
        img: new Set(["aria-expanded","aria-checked","aria-pressed","aria-selected"]),
        heading: new Set(["aria-checked","aria-pressed","aria-selected","aria-expanded"]),
        separator: new Set(["aria-checked","aria-pressed","aria-selected"]),
        alert: new Set(["aria-checked","aria-pressed","aria-selected","aria-expanded"]),
        progressbar: new Set(["aria-checked","aria-pressed","aria-selected","aria-expanded"]),
        status: new Set(["aria-checked","aria-pressed","aria-selected","aria-expanded"]),
      };
      doc.querySelectorAll("[role]").forEach(el => {
        if (isHidden(el)) return;
        const role = (el.getAttribute("role") || "").trim().toLowerCase();
        const denied = DENIED_ATTRS[role];
        if (!denied) return;
        for (const attr of el.attributes) {
          if (attr.name.startsWith("aria-") && denied.has(attr.name)) {
            add(findings, { type: "ARIA_ALLOWED_ATTR", severity: "medium", wcag: "4.1.2", el,
              note: `"${attr.name}" is not allowed on role="${role}".`,
              extra: { attr: attr.name, role } });
          }
        }
      });
    }

    // -------- Tier 2: Extended checks --------

    // 2.2.2: Deprecated <marquee> element
    doc.querySelectorAll("marquee").forEach(el => {
      if (isHidden(el)) return;
      add(findings, { type: "MARQUEE_ELEMENT", severity: "high", wcag: "2.2.2", el,
        note: "<marquee> is deprecated. Auto-scrolling content is difficult to read and cannot be paused." });
    });

    // 1.1.1: <input type="image"> without alt
    doc.querySelectorAll("input[type='image']").forEach(el => {
      if (isHidden(el)) return;
      if (!el.hasAttribute("alt") || !el.getAttribute("alt").trim()) {
        add(findings, { type: "INPUT_IMAGE_ALT", severity: "medium", wcag: "1.1.1", el,
          note: '<input type="image"> missing alt text describing its action.' });
      }
    });

    // 1.1.1: <area> without alt
    doc.querySelectorAll("area").forEach(el => {
      if (!el.hasAttribute("alt") || !el.getAttribute("alt").trim()) {
        add(findings, { type: "AREA_ALT_MISSING", severity: "medium", wcag: "1.1.1", el,
          note: "<area> in image map missing alt text." });
      }
    });

    // 1.1.1: <object> without accessible text
    doc.querySelectorAll("object").forEach(el => {
      if (isHidden(el)) return;
      if (!getAccName(el).trim() && !el.textContent.trim()) {
        add(findings, { type: "OBJECT_NO_ALT", severity: "medium", wcag: "1.1.1", el,
          note: "<object> has no accessible name or fallback text content." });
      }
    });

    // 1.3.1: <fieldset> without <legend>
    doc.querySelectorAll("fieldset").forEach(el => {
      if (isHidden(el)) return;
      if (!el.querySelector("legend")) {
        add(findings, { type: "FIELDSET_NO_LEGEND", severity: "medium", wcag: "1.3.1", el,
          note: "<fieldset> has no <legend>. Screen readers need a legend to describe the group of controls." });
      }
    });

    // 1.1.1: SVG used as image without accessible name
    doc.querySelectorAll("svg[role='img'],svg[role='graphics-document']").forEach(el => {
      if (isHidden(el)) return;
      const hasTitle = el.querySelector("title");
      const hasAriaLabel = el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby");
      if (!hasTitle && !hasAriaLabel) {
        add(findings, { type: "SVG_IMG_NO_ALT", severity: "medium", wcag: "1.1.1", el,
          note: "SVG with role=\"img\" has no accessible name. Add aria-label or a <title> child element." });
      }
    });

    // 1.2.2: <video> without captions track
    doc.querySelectorAll("video").forEach(el => {
      if (isHidden(el)) return;
      const hasCaptions = el.querySelector("track[kind='captions'],track[kind='subtitles']");
      if (!hasCaptions) {
        add(findings, { type: "VIDEO_NO_CAPTIONS", severity: "medium", wcag: "1.2.2", el,
          note: "<video> has no <track kind=\"captions\">. Provide synchronized captions for audio content." });
      }
    });

    // 1.4.2: <video autoplay> without muted (extends audio check)
    doc.querySelectorAll("video[autoplay]").forEach(el => {
      if (isHidden(el)) return;
      if (!el.hasAttribute("muted")) {
        add(findings, { type: "VIDEO_AUTOPLAY", severity: "medium", wcag: "1.4.2", el,
          note: "<video> has autoplay without muted. May play audio automatically." });
      }
    });

    // 1.3.1: <li> not inside <ul>, <ol>, or <menu>
    doc.querySelectorAll("li").forEach(el => {
      if (isHidden(el)) return;
      const parent = el.parentElement;
      if (parent && parent.tagName !== "UL" && parent.tagName !== "OL" && parent.tagName !== "MENU") {
        add(findings, { type: "LIST_STRUCTURE", severity: "medium", wcag: "1.3.1", el,
          note: `<li> is not inside a <ul>, <ol>, or <menu>. Parent is <${parent.tagName.toLowerCase()}>.`,
          extra: { tag: "li", parent: parent.tagName.toLowerCase() } });
      }
    });

    // 1.3.1: <dt>/<dd> not inside <dl>
    doc.querySelectorAll("dt,dd").forEach(el => {
      if (isHidden(el)) return;
      const parent = el.parentElement;
      if (parent && parent.tagName !== "DL" && parent.tagName !== "DIV") {
        // DIV is allowed as grouping wrapper inside DL per HTML spec
        add(findings, { type: "DL_STRUCTURE", severity: "medium", wcag: "1.3.1", el,
          note: `<${el.tagName.toLowerCase()}> is not inside a <dl>. Parent is <${parent.tagName.toLowerCase()}>.`,
          extra: { tag: el.tagName.toLowerCase(), parent: parent.tagName.toLowerCase() } });
      }
    });

    // 4.1.1: Duplicate accesskey values
    {
      const accesskeyMap = new Map();
      doc.querySelectorAll("[accesskey]").forEach(el => {
        const key = (el.getAttribute("accesskey") || "").toLowerCase();
        if (!key) return;
        if (!accesskeyMap.has(key)) accesskeyMap.set(key, []);
        accesskeyMap.get(key).push(el);
      });
      for (const [key, els] of accesskeyMap) {
        if (els.length > 1) {
          add(findings, { type: "ACCESSKEY_DUPLICATE", severity: "low", wcag: "4.1.1", el: els[1],
            note: `accesskey="${key}" is used on ${els.length} elements. Only the first will be activated.`,
            extra: { key, count: els.length } });
        }
      }
    }

    // 1.3.1: Input associated with multiple <label> elements
    doc.querySelectorAll("input,select,textarea").forEach(el => {
      if (isHidden(el)) return;
      const id = el.getAttribute("id");
      if (!id) return;
      const labels = doc.querySelectorAll(`label[for="${CSS.escape(id)}"]`);
      if (labels.length > 1) {
        add(findings, { type: "FORM_FIELD_MULTIPLE_LABELS", severity: "low", wcag: "1.3.1", el,
          note: `Input has ${labels.length} <label> elements pointing to it. Use exactly one label per input.`,
          extra: { labelCount: labels.length } });
      }
    });

    // 1.3.5: Invalid autocomplete value
    doc.querySelectorAll("input[autocomplete],select[autocomplete],textarea[autocomplete]").forEach(el => {
      if (isHidden(el)) return;
      const raw = (el.getAttribute("autocomplete") || "").trim().toLowerCase();
      if (!raw || raw === "off" || raw === "on") return;
      // autocomplete can have section-* prefix and billing/shipping modifier
      const tokens = raw.split(/\s+/);
      const last = tokens[tokens.length - 1];
      if (!VALID_AUTOCOMPLETE.has(last)) {
        add(findings, { type: "AUTOCOMPLETE_VALID", severity: "medium", wcag: "1.3.5", el,
          note: `autocomplete="${raw}" contains unrecognized token "${last}".`,
          extra: { value: raw, token: last } });
      }
    });

    // 1.3.1: <th> without scope in multi-row/col tables
    doc.querySelectorAll("table").forEach(table => {
      if (isHidden(table)) return;
      const role = table.getAttribute("role");
      if (role === "presentation" || role === "none") return;
      const rows = table.querySelectorAll("tr");
      const ths = table.querySelectorAll("th");
      if (rows.length > 1 && ths.length > 0) {
        ths.forEach(th => {
          if (!th.hasAttribute("scope")) {
            add(findings, { type: "TH_MISSING_SCOPE", severity: "low", wcag: "1.3.1", el: th,
              note: "<th> without scope attribute in a multi-row table. Add scope=\"col\" or scope=\"row\"." });
          }
        });
      }
    });

    // -------- Tier 3: Extended checks --------

    // 2.2.2: Deprecated <blink> element
    doc.querySelectorAll("blink").forEach(el => {
      if (isHidden(el)) return;
      add(findings, { type: "BLINK_ELEMENT", severity: "high", wcag: "2.2.2", el,
        note: "<blink> is deprecated. Blinking content can cause seizures and is unreadable." });
    });

    // 1.1.1: Server-side image map without client-side alternative
    doc.querySelectorAll("img[ismap]").forEach(el => {
      if (isHidden(el)) return;
      const usemap = el.getAttribute("usemap");
      if (!usemap) {
        add(findings, { type: "SERVER_IMAGE_MAP", severity: "medium", wcag: "1.1.1", el,
          note: "<img ismap> uses a server-side image map with no client-side <map> alternative." });
      }
    });

    // 1.3.1: <th scope> with invalid value
    doc.querySelectorAll("th[scope]").forEach(el => {
      if (isHidden(el)) return;
      const val = (el.getAttribute("scope") || "").toLowerCase();
      if (val && !VALID_SCOPE_VALUES.has(val)) {
        add(findings, { type: "SCOPE_ATTR_VALID", severity: "low", wcag: "1.3.1", el,
          note: `scope="${val}" is not a valid value.`, extra: { value: val } });
      }
    });

    // 1.3.1: <td headers="..."> referencing non-existent IDs
    doc.querySelectorAll("td[headers]").forEach(el => {
      const headerIds = (el.getAttribute("headers") || "").trim().split(/\s+/);
      for (const id of headerIds) {
        if (id && !doc.getElementById(id)) {
          add(findings, { type: "TD_HEADERS_INVALID", severity: "medium", wcag: "1.3.1", el,
            note: `headers attribute references id="${id}" which does not exist in the document.`,
            extra: { id } });
        }
      }
    });

    // 4.1.2: Table where caption and aria-label are identical (redundant)
    doc.querySelectorAll("table[aria-label]").forEach(table => {
      if (isHidden(table)) return;
      const caption = table.querySelector("caption");
      if (caption) {
        const capText = caption.textContent.trim().toLowerCase();
        const ariaLabel = (table.getAttribute("aria-label") || "").trim().toLowerCase();
        if (capText && ariaLabel && capText === ariaLabel) {
          add(findings, { type: "TABLE_DUPLICATE_NAME", severity: "low", wcag: "4.1.2", el: table,
            note: "Table caption and aria-label are identical. Remove one to avoid redundant AT announcements." });
        }
      }
    });

    // 1.2.1: <audio> without transcript (heuristic)
    doc.querySelectorAll("audio").forEach(el => {
      if (isHidden(el)) return;
      const parent = el.parentElement;
      const nearbyLink = parent?.querySelector("a[href*='transcript'],a[href*='text']");
      const hasTrack = el.querySelector("track");
      if (!nearbyLink && !hasTrack) {
        add(findings, { type: "AUDIO_NO_TRANSCRIPT", severity: "medium", wcag: "1.2.1", el,
          note: "<audio> has no nearby transcript link or <track> element. Provide a text alternative." });
      }
    });

    // 4.1.2: ARIA attribute values that don't match expected type
    {
      const allEls2 = doc.querySelectorAll("[aria-checked],[aria-pressed],[aria-expanded],[aria-hidden],[aria-disabled],[aria-selected],[aria-busy],[aria-modal],[aria-required],[aria-readonly],[aria-multiline],[aria-multiselectable],[aria-grabbed],[aria-atomic],[aria-level],[aria-posinset],[aria-setsize],[aria-colcount],[aria-colindex],[aria-colspan],[aria-rowcount],[aria-rowindex],[aria-rowspan],[aria-valuenow],[aria-valuemax],[aria-valuemin],[aria-autocomplete],[aria-current],[aria-haspopup],[aria-invalid],[aria-live],[aria-orientation],[aria-sort],[aria-relevant],[aria-dropeffect]");
      allEls2.forEach(el => {
        for (const attr of el.attributes) {
          if (!attr.name.startsWith("aria-")) continue;
          const val = attr.value.trim().toLowerCase();
          if (!val) continue;
          if (ARIA_TRISTATE_ATTRS.has(attr.name)) {
            if (val !== "true" && val !== "false" && val !== "mixed") {
              add(findings, { type: "ARIA_VALID_ATTR_VALUE", severity: "high", wcag: "4.1.2", el,
                note: `${attr.name}="${attr.value}" is invalid.`,
                extra: { attr: attr.name, value: attr.value, expected: 'Use "true", "false", or "mixed".' } });
            }
          } else if (ARIA_BOOL_ATTRS.has(attr.name)) {
            if (val !== "true" && val !== "false") {
              add(findings, { type: "ARIA_VALID_ATTR_VALUE", severity: "high", wcag: "4.1.2", el,
                note: `${attr.name}="${attr.value}" is invalid.`,
                extra: { attr: attr.name, value: attr.value, expected: 'Use "true" or "false".' } });
            }
          } else if (ARIA_INT_ATTRS.has(attr.name)) {
            if (!/^-?\d+$/.test(val)) {
              add(findings, { type: "ARIA_VALID_ATTR_VALUE", severity: "high", wcag: "4.1.2", el,
                note: `${attr.name}="${attr.value}" is not a valid integer.`,
                extra: { attr: attr.name, value: attr.value, expected: "Must be an integer." } });
            }
          } else if (ARIA_NUM_ATTRS.has(attr.name)) {
            if (isNaN(parseFloat(val))) {
              add(findings, { type: "ARIA_VALID_ATTR_VALUE", severity: "high", wcag: "4.1.2", el,
                note: `${attr.name}="${attr.value}" is not a valid number.`,
                extra: { attr: attr.name, value: attr.value, expected: "Must be a number." } });
            }
          } else if (ARIA_TOKEN_ATTRS[attr.name]) {
            if (!ARIA_TOKEN_ATTRS[attr.name].has(val)) {
              add(findings, { type: "ARIA_VALID_ATTR_VALUE", severity: "high", wcag: "4.1.2", el,
                note: `${attr.name}="${attr.value}" is not a recognized value.`,
                extra: { attr: attr.name, value: attr.value, expected: `Allowed: ${[...ARIA_TOKEN_ATTRS[attr.name]].join(", ")}.` } });
            }
          }
        }
      });
    }

    // 2.4.4: Multiple links with same text pointing to different URLs
    {
      const linkTextMap = new Map();
      doc.querySelectorAll("a[href]").forEach(el => {
        if (isHidden(el)) return;
        const text = (el.textContent || "").trim().toLowerCase();
        if (!text || text.length < 2) return;
        const href = el.getAttribute("href") || "";
        if (!linkTextMap.has(text)) linkTextMap.set(text, new Set());
        linkTextMap.get(text).add(href);
      });
      for (const [text, hrefs] of linkTextMap) {
        if (hrefs.size > 1) {
          const firstEl = doc.querySelector(`a[href]`);
          add(findings, { type: "IDENTICAL_LINKS_SAME_TEXT", severity: "low", wcag: "2.4.4",
            el: firstEl || doc.body,
            note: `${hrefs.size} different destinations share link text "${txt(text, 30)}".`,
            extra: { text: txt(text, 30), count: hrefs.size } });
        }
      }
    }

    // 1.3.1: <p>/<div>/<span> styled as heading but not using heading semantics (heuristic)
    {
      const pCandidates = doc.querySelectorAll("p,div,span");
      const limit3 = Math.min(pCandidates.length, 2000);
      for (let i = 0; i < limit3; i++) {
        const el = pCandidates[i];
        if (isHidden(el)) continue;
        const text = (el.textContent || "").trim();
        if (!text || text.length > 80 || text.length < 2) continue;
        if (el.querySelector("h1,h2,h3,h4,h5,h6")) continue;
        try {
          const cs = w.getComputedStyle(el);
          const fontSize = parseFloat(cs.fontSize);
          const fontWeight = parseInt(cs.fontWeight, 10) || (cs.fontWeight === "bold" ? 700 : 400);
          if (fontSize >= 20 && fontWeight >= 600 && el.children.length <= 2) {
            add(findings, { type: "P_AS_HEADING", severity: "low", wcag: "1.3.1", el,
              note: `<${el.tagName.toLowerCase()}> is styled as a heading (${Math.round(fontSize)}px, weight ${fontWeight}) but lacks heading semantics.`,
              extra: { fontSize: Math.round(fontSize), fontWeight } });
          }
        } catch {}
      }
    }

    // -------- Microfrontend / Cross-MFE checks --------

    // 4.1.3: Competing assertive live regions (announcement storms)
    const assertiveLive = doc.querySelectorAll("[aria-live='assertive']");
    if (assertiveLive.length > 3) {
      add(findings, { type: "COMPETING_ASSERTIVE_LIVE", severity: "medium", wcag: "4.1.3", el: assertiveLive[0],
        note: `${assertiveLive.length} aria-live="assertive" regions detected. Risk of announcement storms — consolidate to fewer regions.`,
        extra: { count: assertiveLive.length } });
    }

    // 1.3.1: Duplicate main landmarks
    const mains = doc.querySelectorAll("main,[role='main']");
    if (mains.length > 1) {
      add(findings, { type: "DUPLICATE_MAIN_LANDMARK", severity: "medium", wcag: "1.3.1", el: mains[1],
        note: `${mains.length} <main> landmarks found. Each page should have exactly one.`, extra: { count: mains.length } });
    }

    // 1.3.1 / 4.1.2: Duplicate navs without labels
    const navs = [...doc.querySelectorAll("nav,[role='navigation']")].filter(n => !isHidden(n));
    const unnamedNavs = navs.filter(n => !getAccName(n));
    if (navs.length > 1 && unnamedNavs.length > 0) {
      add(findings, { type: "DUPLICATE_NAV_NO_LABEL", severity: "medium", wcag: "1.3.1 / 4.1.2", el: unnamedNavs[0],
        note: `${navs.length} <nav> landmarks, ${unnamedNavs.length} without labels. Distinguish with aria-label.`,
        extra: { totalNavs: navs.length, unnamed: unnamedNavs.length } });
    }

    // 1.3.1: Duplicate top-level banners
    const banners = [...doc.querySelectorAll("[role='banner'],header:not([role])")].filter(el => !isHidden(el));
    const toplevelBanners = banners.filter(el => !el.closest("article,aside,main,nav,section,[role='article'],[role='complementary'],[role='main'],[role='navigation'],[role='region']"));
    if (toplevelBanners.length > 1) {
      add(findings, { type: "DUPLICATE_BANNER", severity: "low", wcag: "1.3.1", el: toplevelBanners[1],
        note: `${toplevelBanners.length} top-level banner landmarks. MFEs may each be defining their own header.`, extra: { count: toplevelBanners.length } });
    }

    // 1.3.1: Duplicate top-level contentinfo
    const contentinfos = [...doc.querySelectorAll("[role='contentinfo'],footer:not([role])")].filter(el => !isHidden(el));
    const toplevelContentinfos = contentinfos.filter(el => !el.closest("article,aside,main,nav,section,[role='article'],[role='complementary'],[role='main'],[role='navigation'],[role='region']"));
    if (toplevelContentinfos.length > 1) {
      add(findings, { type: "DUPLICATE_CONTENTINFO", severity: "low", wcag: "1.3.1", el: toplevelContentinfos[1],
        note: `${toplevelContentinfos.length} top-level contentinfo landmarks. MFEs may each be defining their own footer.`, extra: { count: toplevelContentinfos.length } });
    }

    // 1.3.1: Heading hierarchy fragmentation (MFE heading trees restarting)
    if (levels.length > 2) {
      let restarts = 0;
      for (let i = 1; i < levels.length; i++) {
        if (levels[i] === 1 && i > 0) restarts++;
      }
      if (restarts >= 2) {
        add(findings, { type: "HEADING_HIERARCHY_FRAGMENTED", severity: "medium", wcag: "1.3.1", el: headingEls[levels.indexOf(1, 1)] || doc.body,
          note: `Heading hierarchy restarts ${restarts} times (H1 reappears). Likely separate MFE heading trees — coordinate heading structure.`,
          extra: { restarts } });
      }
    }

    // 2.4.1: Competing skip navigation links
    const skipNavSelector2 = "a[href='#main'],a[href='#content'],a[href='#maincontent'],[class*='skip-nav'],[class*='skipnav'],[class*='skip-link'],a[class*='skip']";
    const skipLinks2 = doc.querySelectorAll(skipNavSelector2);
    if (skipLinks2.length > 1) {
      add(findings, { type: "COMPETING_SKIP_NAV", severity: "low", wcag: "2.4.1", el: skipLinks2[1],
        note: `${skipLinks2.length} skip-navigation links detected. Multiple MFEs may each have their own skip link.`, extra: { count: skipLinks2.length } });
    }

    // 2.1.1 / 4.1.2: Shadow DOM focus management
    if (s.shadowRoots > 0) {
      let shadowFocusIssues = 0;
      for (const el of doc.querySelectorAll("*")) {
        if (!el.shadowRoot) continue;
        const shadowFocusables = el.shadowRoot.querySelectorAll(focusableSelector);
        for (const sf of shadowFocusables) {
          if (isHidden(sf)) continue;
          const ti = sf.getAttribute("tabindex");
          if (ti === null) shadowFocusIssues++;
        }
        if (shadowFocusIssues >= 20) break;
      }
      if (shadowFocusIssues > 0) {
        add(findings, { type: "SHADOW_DOM_FOCUS_ISSUE", severity: "medium", wcag: "2.1.1 / 4.1.2", el: doc.body,
          note: `${shadowFocusIssues} focusable element(s) inside shadow roots without explicit tabindex. May not integrate with document tab order correctly.`,
          extra: { count: shadowFocusIssues } });
      }
    }

    // 4.1.2: Iframes missing title
    doc.querySelectorAll("iframe").forEach(iframe => {
      if (isHidden(iframe)) return;
      if ((iframe.getAttribute("aria-hidden") || "").toLowerCase() === "true") return;
      const role = (iframe.getAttribute("role") || "").toLowerCase();
      if (role === "presentation" || role === "none") return;
      const title = (iframe.getAttribute("title") || "").trim();
      if (!title) {
        add(findings, {
          type: "IFRAME_MISSING_TITLE",
          severity: "medium",
          wcag: "4.1.2",
          el: iframe,
          confidence: "strict",
          note: "Iframe is exposed to assistive tech but has no title attribute.",
          extra: {
            src: txt(iframe.getAttribute("src"), 140) || null,
            role: role || null,
            ariaHidden: false,
            titlePresent: false,
          }
        });
      }
    });

    // Cross-origin iframe self-check
    if (s.inIframe) {
      try {
        const parentIframes = w.parent.document.querySelectorAll("iframe");
        for (const iframe of parentIframes) {
          try {
            if (iframe.contentWindow === w && !iframe.getAttribute("title")) {
              add(findings, { type: "IFRAME_MISSING_TITLE", severity: "medium", wcag: "4.1.2", el: doc.body,
                note: "This MFE's host iframe has no title attribute. Screen readers need iframe titles to identify embedded content." });
              break;
            }
          } catch { /* cross-origin */ }
        }
      } catch {
        add(findings, { type: "IFRAME_CROSS_ORIGIN", severity: "info", el: doc.body,
          note: "Running in cross-origin iframe — cannot verify iframe title/role attributes. Check manually." });
      }
    }

    // -------- WCAG 2.2 specific checks --------
    if (is22) {
      // 2.5.8 Dragging Movements
      doc.querySelectorAll("[draggable='true']").forEach(el => {
        if (isHidden(el)) return;
        add(findings, { type: "DRAGGABLE_NO_ALTERNATIVE", severity: "medium", wcag: "2.5.8", wcagVersion: "2.2", el,
          note: "draggable=\"true\" detected. WCAG 2.5.8 requires a non-dragging alternative input method." });
      });

      // 3.2.6 Consistent Help
      const helpLinks = doc.querySelectorAll("a[href*='help'],a[href*='contact'],a[href*='support'],[data-testid*='help'],[data-testid*='contact']");
      if (helpLinks.length > 0) {
        add(findings, { type: "CONSISTENT_HELP_CHECK", severity: "info", wcag: "3.2.6", wcagVersion: "2.2", el: helpLinks[0],
          note: `${helpLinks.length} help/contact link(s) found. WCAG 3.2.6 requires these appear in a consistent location across pages.`,
          extra: { count: helpLinks.length } });
      }

      // 2.4.11 Focus Not Obscured
      const stickyEls = [...doc.querySelectorAll("header,footer,nav,[role='banner'],[role='contentinfo'],[role='navigation'],div,section")].filter(el => {
        if (isHidden(el)) return false;
        try { const pos = w.getComputedStyle(el).position; return pos === "fixed" || pos === "sticky"; } catch { return false; }
      }).slice(0, 20);
      if (stickyEls.length > 0) {
        add(findings, { type: "FOCUS_MAY_BE_OBSCURED", severity: "low", wcag: "2.4.11", wcagVersion: "2.2", el: stickyEls[0],
          note: `${stickyEls.length} fixed/sticky element(s) detected. These may obscure focused elements behind sticky headers/footers.`,
          extra: { count: stickyEls.length } });
      }

      // 3.3.7 Redundant Entry
      const formInputs = [...doc.querySelectorAll("input:not([type='hidden']),textarea,select")].filter(el => !isHidden(el));
      const nameGroups = new Map();
      for (const inp of formInputs) {
        const name = (inp.getAttribute("name") || "").toLowerCase();
        if (!name) continue;
        if (!nameGroups.has(name)) nameGroups.set(name, []);
        nameGroups.get(name).push(inp);
      }
      for (const [name, group] of nameGroups) {
        if (group.length > 1 && !group.every(el => el.getAttribute("autocomplete"))) {
          add(findings, { type: "REDUNDANT_ENTRY", severity: "low", wcag: "3.3.7", wcagVersion: "2.2", el: group[1],
            note: `Field "${name}" appears ${group.length} times without autocomplete. WCAG 3.3.7 requires avoiding redundant entry.`,
            extra: { fieldName: name, count: group.length } });
        }
      }
    }

    // -------- AAA-specific checks --------
    if (isAAA) {
      // 2.5.5 Target Size AAA: 44x44px minimum (only for elements ≥24px to avoid duplicating AA check)
      doc.querySelectorAll("button,a[href],[role='button'],[role='link'],input:not([type='hidden']),select,textarea").forEach(el => {
        if (isHidden(el)) return;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44) && r.width >= 24 && r.height >= 24) {
          add(findings, { type: "TARGET_SIZE_AAA", severity: "low", wcag: "2.5.5", wcagVersion: "AAA", el,
            note: `Size ${Math.round(r.width)}x${Math.round(r.height)}px — AAA requires 44x44px minimum.`,
            extra: { width: Math.round(r.width), height: Math.round(r.height) } });
        }
      });
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
    if (observeInFlight?.promise) {
      console.info("🧠 A11YFlowAudit.observe already running; returning active session.");
      return observeInFlight.promise;
    }

    const promise = new Promise((resolve) => {
      const startedAt = performance.now();
      const snapshots = [];
      const merged = [];
      let settled = false;
      let timer = null;
      let timeout = null;

      const finish = () => {
        if (settled) return;
        settled = true;
        if (timer) clearInterval(timer);
        if (timeout) clearTimeout(timeout);
        const unique = uniqBy(merged, x => `${x.type}|${x.severity}|${x.product||""}|${x.path||""}|${JSON.stringify(x.extra||{})}`);
        const result = { timestamp: nowIso(), seconds, intervalMs, snapshots, findings: unique, href: w.location.href };
        api.lastObserved = result;
        observeInFlight = null;

        console.groupCollapsed(`🧠 A11YFlowAudit.observe — ${seconds}s — totalUniqueFindings=${unique.length}`);
        console.table(snapshots);
        console.log("Unique findings:", unique);
        console.groupEnd();

        resolve(result);
      };

      const totalTicks = Math.max(1, Math.ceil((seconds * 1000) / intervalMs));
      const tick = () => {
        const tickIndex = snapshots.length;
        const inTransitionWindow = tickIndex <= 1;
        const tickConfig = {
          ...(runConfig || {}),
          transitionSource: "observe",
          transitionTickIndex: tickIndex,
          transitionTickCount: totalTicks,
          duringTransition: (runConfig && Object.prototype.hasOwnProperty.call(runConfig, "duringTransition"))
            ? !!runConfig.duringTransition
            : inTransitionWindow,
        };
        const r = run(tickConfig);
        snapshots.push({
          t: +(performance.now() - startedAt).toFixed(0),
          count: r.findings.length,
          mode: r.mode,
          duringTransition: !!tickConfig.duringTransition,
        });
        merged.push(...r.findings);
      };

      tick();
      timer = setInterval(tick, intervalMs);
      timeout = setTimeout(finish, seconds * 1000);

      console.info(`🧠 A11YFlowAudit.observe started (${seconds}s). Trigger loader/remount flow now.`);
    });
    observeInFlight = { promise };
    return promise;
  };

  // ---------------- watch (loader chain + focus loss + silent loading) ----------------
  const watch = ({ seconds = 20, tickMs = 200, budget = {} } = {}) => {
    if (watchInFlight?.promise) {
      console.info("👀 A11YFlowAudit.watch already running; returning active session.");
      return watchInFlight.promise;
    }

    const promise = new Promise((resolve) => {
      const B = {
        maxBursts: 3,
        maxSilentMs: 2500,
        maxTotalLoadingMs: 7000,
        maxFocusLossEvents: 1,
        maxFocusJumps: 3,
        maxEmptyAnnouncements: 0,
        maxAnnouncementLatency: 3000,
        ...budget
      };

      const start = performance.now();
      let totalLoadingMs = 0;
      let silentMs = 0;
      let bursts = 0;
      let focusLoss = 0;
      let focusJumps = 0;
      let lastLoader = false;
      let bodyFocusSince = null;
      let bodyFocusCounted = false;
      let prevActiveElement = doc.activeElement;
      let focusChangeTimestamps = [];

      const events = [];
      const loaderCandidates = new Set();
      const MAX_LOADER_CANDIDATES = 280;
      let settled = false;
      let loaderNow = false;
      let announcementHookNow = hasAnnouncementHook();
      let pendingLoaderRecalc = null;
      let lastLoaderRecalcAt = 0;
      let timer = null;

      // Announcement tracking
      const announcements = [];
      let announcementCount = 0;
      let emptyAnnouncementCount = 0;
      let firstAnnouncementAt = null;
      const observedRegions = new WeakSet();
      const lastAnnouncementText = new WeakMap();
      let announcementFlushPending = false;
      const pendingAnnouncements = new Map();

      const isLikelyLoaderCandidate = (el) => {
        if (!isEl(el)) return false;
        if (el.getAttribute("aria-busy") === "true") return true;
        const role = (el.getAttribute("role") || "").toLowerCase();
        if (role === "progressbar" || role === "status") return true;
        const attrs = `${(el.className || "").toString()} ${el.id || ""} ${testId(el) || ""}`.toLowerCase();
        return /(loader|loading|spinner|skeleton|progress|shimmer)/.test(attrs);
      };

      const addLoaderCandidate = (el) => {
        if (!isLikelyLoaderCandidate(el)) return;
        if (loaderCandidates.size >= MAX_LOADER_CANDIDATES) return;
        loaderCandidates.add(el);
      };

      const addSubtreeCandidates = (root) => {
        if (!isEl(root)) return;
        addLoaderCandidate(root);
        const list = collectLoaderCandidates(root, 40);
        for (const el of list) addLoaderCandidate(el);
      };

      const recalcLoaderState = () => {
        pendingLoaderRecalc = null;
        lastLoaderRecalcAt = performance.now();
        announcementHookNow = hasAnnouncementHook();
        const cache = createPassCache();
        let hasLoader = false;
        for (const el of loaderCandidates) {
          if (!isEl(el) || !el.isConnected) {
            loaderCandidates.delete(el);
            continue;
          }
          if (looksLikeLoader(el, cache)) {
            hasLoader = true;
            break;
          }
        }
        loaderNow = hasLoader;
      };

      const scheduleLoaderRecalc = (force = false) => {
        if (pendingLoaderRecalc) return;
        const elapsed = performance.now() - lastLoaderRecalcAt;
        const delay = force ? 0 : Math.max(0, 300 - elapsed); // max once per 300ms
        pendingLoaderRecalc = setTimeout(recalcLoaderState, delay);
      };

      collectLoaderCandidates(doc, 160).forEach(addLoaderCandidate);
      scheduleLoaderRecalc(true);

      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === "attributes") addLoaderCandidate(m.target);
          if (m.type === "childList") {
            addSubtreeCandidates(m.target);
            m.addedNodes.forEach(addSubtreeCandidates);
          }
        }
        scheduleLoaderRecalc();
      });

      try {
        observer.observe(doc.documentElement || doc.body, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ["aria-busy", "role", "class", "id", "style", "hidden", "data-testid"],
        });
      } catch {
        // Keep watch deterministic even if observe() fails.
      }

      // Live-region announcement observer (microtask-batched, deduped)
      const flushAnnouncements = () => {
        announcementFlushPending = false;
        for (const [liveRegion, { t, text }] of pendingAnnouncements) {
          lastAnnouncementText.set(liveRegion, text);
          if (firstAnnouncementAt === null) firstAnnouncementAt = t;
          announcementCount++;
          if (!text) emptyAnnouncementCount++;
          if (announcements.length < 200) {
            announcements.push({
              t,
              text: text || "(empty)",
              ariaLive: liveRegion.getAttribute("aria-live") || "",
              role: liveRegion.getAttribute("role") || "",
              path: cssPath(liveRegion),
            });
          }
          events.push({
            t,
            type: "announcement",
            note: `[${liveRegion.getAttribute("aria-live") || liveRegion.getAttribute("role")}] ${text || "(empty)"}`,
          });
        }
        pendingAnnouncements.clear();
      };

      const liveRegionObserver = new MutationObserver((mutations) => {
        if (settled) return;
        const t = +(performance.now() - start).toFixed(0);
        for (const m of mutations) {
          const region = m.type === "characterData" ? m.target.parentElement : m.target;
          if (!region || !isEl(region)) continue;
          const liveRegion = region.closest("[aria-live],[role='status'],[role='alert'],[role='log']");
          if (!liveRegion) continue;
          const text = (liveRegion.textContent || "").trim().slice(0, 200);
          if (lastAnnouncementText.get(liveRegion) === text) continue;
          pendingAnnouncements.set(liveRegion, { t, text });
        }
        if (!announcementFlushPending && pendingAnnouncements.size > 0) {
          announcementFlushPending = true;
          queueMicrotask(flushAnnouncements);
        }
      });

      const observeLiveRegions = () => {
        try {
          const regions = doc.querySelectorAll(
            "[aria-live]:not([aria-live='off']),[role='status'],[role='alert'],[role='log']"
          );
          regions.forEach(r => {
            if (observedRegions.has(r)) return;
            observedRegions.add(r);
            liveRegionObserver.observe(r, {
              childList: true,
              characterData: true,
              subtree: true,
            });
          });
        } catch {}
      };
      observeLiveRegions();

      const finalize = () => {
        if (settled) return;
        settled = true;
        if (timer) clearInterval(timer);
        if (pendingLoaderRecalc) clearTimeout(pendingLoaderRecalc);
        try { observer.disconnect(); } catch {}
        try { liveRegionObserver.disconnect(); } catch {}
        watchInFlight = null;

        const verdicts = [];
        if (bursts > B.maxBursts) verdicts.push({ metric: "bursts", value: bursts, budget: B.maxBursts });
        if (silentMs > B.maxSilentMs) verdicts.push({ metric: "silentMs", value: silentMs, budget: B.maxSilentMs });
        if (totalLoadingMs > B.maxTotalLoadingMs) verdicts.push({ metric: "totalLoadingMs", value: totalLoadingMs, budget: B.maxTotalLoadingMs });
        if (focusLoss > B.maxFocusLossEvents) verdicts.push({ metric: "focusLossEvents", value: focusLoss, budget: B.maxFocusLossEvents });
        if (focusJumps > B.maxFocusJumps) verdicts.push({ metric: "focusJumps", value: focusJumps, budget: B.maxFocusJumps });
        if (emptyAnnouncementCount > B.maxEmptyAnnouncements) verdicts.push({ metric: "emptyAnnouncements", value: emptyAnnouncementCount, budget: B.maxEmptyAnnouncements });
        if (firstAnnouncementAt != null && totalLoadingMs > 0 && firstAnnouncementAt > B.maxAnnouncementLatency) verdicts.push({ metric: "announcementLatency", value: firstAnnouncementAt, budget: B.maxAnnouncementLatency });

        const result = {
          timestamp: nowIso(), seconds, bursts, totalLoadingMs, silentMs, focusLossCount: focusLoss, focusJumps, budget: B, verdicts, events, href: w.location.href,
          announcements, announcementCount, emptyAnnouncementCount, firstAnnouncementAt,
          announcementLatency: (firstAnnouncementAt != null && totalLoadingMs > 0) ? firstAnnouncementAt : null,
        };
        api.lastWatch = result;

        console.groupCollapsed(`⏱️ A11YFlowAudit.watch — ${seconds}s — bursts=${bursts} loading=${totalLoadingMs}ms silent=${silentMs}ms focusLoss=${focusLoss}`);
        if (verdicts.length) console.warn("OVER budget:", verdicts);
        else console.info("Budgets OK ✅");
        console.table(events.slice(0, 120));
        console.log("Raw:", api.lastWatch);
        console.groupEnd();

        resolve(result);
      };

      timer = setInterval(() => {
        const t = +(performance.now() - start).toFixed(0);

        if (loaderNow) totalLoadingMs += tickMs;
        if (loaderNow && !announcementHookNow) silentMs += tickMs;

        if (loaderNow && !lastLoader) bursts += 1;
        lastLoader = loaderNow;

        // Re-discover live regions every ~2s (new regions may appear dynamically)
        if (t % 2000 < tickMs) observeLiveRegions();

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

        // Focus jump detection: focus moves across unrelated subtrees
        const curActive = doc.activeElement;
        if (curActive && curActive !== doc.body && prevActiveElement && prevActiveElement !== doc.body && curActive !== prevActiveElement) {
          const ancestorDepth = commonAncestorDepth(curActive, prevActiveElement);
          if (ancestorDepth > 2) {
            focusJumps++;
            events.push({ t, type: "focus_jump", note: `Focus jumped across subtrees (depth=${ancestorDepth}): ${cssPath(prevActiveElement)} → ${cssPath(curActive)}` });
          }
          focusChangeTimestamps.push(performance.now());
        }
        prevActiveElement = curActive;

        // Focus thrashing detection: rapid focus changes from loader mount/unmount
        const now = performance.now();
        focusChangeTimestamps = focusChangeTimestamps.filter(ts => now - ts < 600);
        if (focusChangeTimestamps.length >= 3) {
          events.push({ t, type: "focus_thrashing", note: `${focusChangeTimestamps.length} focus changes in <600ms — likely loader mount/unmount churn.` });
          focusChangeTimestamps = [];
        }

        if (t >= seconds * 1000) {
          finalize();
        }
      }, tickMs);

      console.info(`👀 A11YFlowAudit.watch started (${seconds}s). Trigger the loader-heavy flow now.`);
    });
    watchInFlight = { promise };
    return promise;
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
      const isModal = dialog.getAttribute("aria-modal") === "true" || dialog.tagName === "DIALOG";
      if (isModal && dialogFocusables.length > 0) {
        const siblingsInert = [...(dialog.parentElement?.children || [])].every(sib => sib === dialog || sib.inert || sib.getAttribute("aria-hidden") === "true");
        if (!siblingsInert) {
          events.push({ i: -1, type: "dialog_focus_not_trapped", path: cssPath(dialog), name: getAccName(dialog), tabIndex: 0, note: "Modal dialog is open but sibling content is not inert/aria-hidden — focus may escape." });
        }
      }
    });

    // Roach motel detection: non-dialog container capturing most tab stops
    const parentCounts = new Map();
    for (let i = 0; i < max; i++) {
      const parent = filtered[i].parentElement;
      if (!parent || parent === doc.body || parent === doc.documentElement) continue;
      const pp = cssPath(parent);
      if (!parentCounts.has(pp)) parentCounts.set(pp, { count: 0, el: parent });
      parentCounts.get(pp).count++;
    }
    for (const [pp, { count, el }] of parentCounts) {
      if (count >= max * 0.7 && max >= 5) {
        const role = el.getAttribute("role");
        if (role !== "dialog" && role !== "alertdialog" && el.tagName !== "DIALOG") {
          events.push({ i: -1, type: "roach_motel", path: pp, name: getAccName(el), tabIndex: 0,
            note: `${count}/${max} tab stops are inside a non-dialog container (${el.tagName.toLowerCase()}). Focus may be trapped.` });
        }
      }
    }

    // Non-dialog focus trap: container with consecutive tab stops forming a tight cycle
    const containerGroups = new Map();
    for (let i = 0; i < max; i++) {
      let ancestor = filtered[i].parentElement;
      while (ancestor && ancestor !== doc.body) {
        const role = ancestor.getAttribute("role");
        if (role && role !== "dialog" && role !== "alertdialog" && role !== "main" && role !== "navigation" && role !== "banner" && role !== "contentinfo" && role !== "complementary" && role !== "region" && ancestor.tagName !== "DIALOG") {
          const cp = cssPath(ancestor);
          if (!containerGroups.has(cp)) containerGroups.set(cp, { el: ancestor, indices: [] });
          containerGroups.get(cp).indices.push(i);
          break;
        }
        ancestor = ancestor.parentElement;
      }
    }
    for (const [cp, { el, indices }] of containerGroups) {
      if (indices.length >= 3 && indices.length < order.length / 3) {
        let consecutive = true;
        for (let j = 1; j < indices.length; j++) {
          if (indices[j] - indices[j - 1] !== 1) { consecutive = false; break; }
        }
        if (consecutive && indices[indices.length - 1] - indices[0] < 5) {
          events.push({ i: indices[0], type: "non_dialog_focus_trap", path: cp, name: getAccName(el), tabIndex: 0,
            note: `Non-dialog container trapping ${indices.length} consecutive tab stops. Consider if focus containment is intentional.` });
        }
      }
    }

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
  const contrastScan = ({ limit = 200, minTextLen = 2, wcagLevel = "2.1-AA" } = {}) => {
    const isAAAContrast = wcagLevel.endsWith("-AAA");
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
      const req = isAAAContrast ? (large ? 4.5 : 7.0) : (large ? 3.0 : 4.5);

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
      samples
    };
    api.lastContrast = res;

    console.groupCollapsed(`🎚️ A11YFlowAudit.contrastScan — failures=${failures.length}/${nodes.length}`);
    console.table(failures.slice(0, 120));
    console.log("Samples:", res.samples);
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
    get modeHints() { return modeHints; },
    set modeHints(v) { modeHints = v && typeof v === "object" ? v : defaultModeHints; },
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
