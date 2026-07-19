// flow-profiles.js — Generic structural profiles for conversational UI detection.
// Versioned: bump FLOW_PROFILES_VERSION when profile definitions change.
// Local-only, no network. Consumed by panel.js loadProfiles().
// No vendor-specific selectors — purely ARIA roles + semantic elements.

const FLOW_PROFILES_VERSION = 1;

/**
 * Generic profiles keyed by id string.
 * Each profile matches the BUILTIN_PROFILES contract used by panel.js:
 * {
 *   label:       string,
 *   description: string,
 *   frame: { urlIncludes: string[], domSelectors: string[] },
 *   modeHints:   { [mode]: { roles?: string[], testIds?: string[], url?: string|null } },
 *   frameScope:  "primary" | "embedded" | "host" | "all"
 * }
 *
 * buildMatch() reads frame.domSelectors as domSelectorsAny for frame scoring.
 * buildModeHints() merges modeHints from all active profiles.
 * urlIncludes must be empty (no URL-based detection for generic profiles).
 */
const GENERIC_PROFILES = {
  "generic-helpcenter-spa": {
    label: "Generic Help Center",
    description: "Help center SPA with article navigation and optional tree/category sidebar",
    frame: {
      urlIncludes: [],
      domSelectors: [
        "[role='navigation'][aria-label]",
        "main article",
        "article",
        "[role='main']",
      ],
    },
    modeHints: {
      "helpcenter-tree": {
        roles: ["[role='tree']", "[role='treeitem']"],
        testIds: [],
        url: null,
      },
    },
    frameScope: "primary",
  },

  "generic-chat-widget": {
    label: "Generic Chat",
    description: "Chat widget with message feed, input area, and optional live region",
    frame: {
      urlIncludes: [],
      domSelectors: [
        "[role='log']",
        "[role='feed']",
        "[aria-label*='chat' i]",
        "textarea",
        "input[type='text']",
      ],
    },
    modeHints: {
      chat: {
        roles: ["[role='log']"],
        testIds: [],
        url: null,
      },
    },
    frameScope: "embedded",
  },

  "generic-ai-bot-tree": {
    label: "Generic AI Bot Tree",
    description: "Conversational bot with tree navigation and message feed",
    frame: {
      urlIncludes: [],
      domSelectors: [
        "[role='tree']",
        "[role='treeitem']",
        "[role='log']",
        "[role='feed']",
      ],
    },
    modeHints: {
      "helpcenter-bot": {
        roles: ["[role='tree']", "[role='log']"],
        testIds: [],
        url: null,
      },
      chat: {
        roles: ["[role='log']"],
        testIds: [],
        url: null,
      },
    },
    frameScope: "embedded",
  },

  "hybrid-help-chat": {
    label: "Hybrid Help+Chat",
    description: "Combined help center article view with embedded chat or bot interface",
    frame: {
      urlIncludes: [],
      domSelectors: [
        "[role='main']",
        "main article",
        "article",
        "[role='log']",
        "[role='feed']",
        "[role='tree']",
      ],
    },
    modeHints: {
      "helpcenter-tree": {
        roles: ["[role='tree']", "[role='treeitem']"],
        testIds: [],
        url: null,
      },
      chat: {
        roles: ["[role='log']"],
        testIds: [],
        url: null,
      },
    },
    frameScope: "primary",
  },

  // ── v2 profiles (per-profile version: 2, no global version bump) ──

  "chat_widget_v2": {
    label: "Chat Widget (v2)",
    description: "Conversational chat widget with message feed and input",
    version: 2,
    intent: "chat_widget",
    recommended: { depthMax: 3, enableDepth3: true },
    frame: {
      urlIncludes: [],
      domSelectors: [
        "[role='log']",
        "[role='feed']",
        "textarea",
        "input[type='text']",
      ],
    },
    modeHints: {
      chat: {
        roles: ["[role='log']"],
        testIds: [],
        url: null,
      },
    },
    frameScope: "embedded",
  },

  "helpcenter_bot_hybrid_v2": {
    label: "Help Center + Bot (v2)",
    description: "Help center with embedded chat or bot interface",
    version: 2,
    intent: "hybrid_portal",
    recommended: { depthMax: 3, enableDepth3: true },
    frame: {
      urlIncludes: [],
      domSelectors: [
        "[role='main']",
        "main article",
        "article",
        "[role='log']",
        "[role='feed']",
      ],
    },
    modeHints: {
      "helpcenter-tree": {
        roles: ["[role='tree']", "[role='treeitem']"],
        testIds: [],
        url: null,
      },
      chat: {
        roles: ["[role='log']"],
        testIds: [],
        url: null,
      },
    },
    frameScope: "primary",
  },

  "wizard_flow_v2": {
    label: "Wizard / Multi-step Form",
    description: "Step-based flow — wizards, checkouts, onboarding, multi-page forms",
    version: 2,
    intent: "wizard_flow",
    recommended: { depthMax: 2, enableDepth3: false },
    frame: {
      urlIncludes: [],
      domSelectors: [
        "form",
        "fieldset",
        "[role='form']",
        "progress",
        "[aria-current='step']",
      ],
    },
    modeHints: {
      "wizard-steps": {
        roles: ["[aria-current='step']", "[role='group'][aria-label]"],
        testIds: [],
        url: null,
      },
    },
    frameScope: "host",
  },

  "helpcenter_static_v2": {
    label: "Help Center Static (v2)",
    description: "Static help center with article navigation, no chat",
    version: 2,
    intent: "helpcenter_bot",
    recommended: { depthMax: 2, enableDepth3: false },
    frame: {
      urlIncludes: [],
      domSelectors: [
        "[role='navigation'][aria-label]",
        "main article",
        "article",
        "[role='main']",
      ],
    },
    modeHints: {
      "helpcenter-tree": {
        roles: ["[role='tree']", "[role='treeitem']"],
        testIds: [],
        url: null,
      },
    },
    frameScope: "primary",
  },
};
