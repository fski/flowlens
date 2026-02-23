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
};
