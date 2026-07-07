/**
 * WAI-ARIA 1.2 role dataset — generated from aria-query v5.3.2.
 *
 * Package:  aria-query
 * Version:  5.3.2
 * License:  Apache-2.0 (see LICENSE in the upstream repository:
 *           https://github.com/A11yance/aria-query/blob/main/LICENSE)
 * Upstream: https://github.com/A11yance/aria-query
 *
 * Generated data — a compact, unmodified-in-spirit projection of the
 * upstream rolesMap (requiredProps, superClass, required context/owned
 * roles, prohibitedProps, nameRequired, abstract); the large
 * elementRoles/roleElements concept maps are pruned as unused by rules.
 * Rebuild via scripts/vendor-aria-data.mjs (npm run vendor:aria).
 *
 * Plain script defining the global `__FlowLensAriaData`. Injected by the
 * service worker before a11y-audit-snippet.js, which prefers this data
 * for ARIA role rules (with a graceful fallback to its hand-maintained
 * tables when absent — same pattern as accname.js/__FlowLensAccName).
 */
var __FlowLensAriaData = {
  "package": "aria-query",
  "version": "5.3.2",
  "license": "Apache-2.0",
  "upstream": "https://github.com/A11yance/aria-query",
  "roles": {
    "alert": {
      "superClass": [
        "roletype",
        "structure",
        "section"
      ]
    },
    "alertdialog": {
      "nameRequired": true,
      "superClass": [
        "roletype",
        "structure",
        "section",
        "alert",
        "window",
        "dialog"
      ]
    },
    "application": {
      "nameRequired": true,
      "superClass": [
        "roletype",
        "structure"
      ]
    },
    "article": {
      "superClass": [
        "roletype",
        "structure",
        "document"
      ]
    },
    "banner": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "landmark"
      ]
    },
    "blockquote": {
      "superClass": [
        "roletype",
        "structure",
        "section"
      ]
    },
    "button": {
      "nameRequired": true,
      "superClass": [
        "roletype",
        "widget",
        "command"
      ]
    },
    "caption": {
      "superClass": [
        "roletype",
        "structure",
        "section"
      ],
      "requiredContext": [
        "figure",
        "grid",
        "table"
      ],
      "prohibitedProps": [
        "aria-label",
        "aria-labelledby"
      ]
    },
    "cell": {
      "superClass": [
        "roletype",
        "structure",
        "section"
      ],
      "requiredContext": [
        "row"
      ]
    },
    "checkbox": {
      "nameRequired": true,
      "requiredProps": [
        "aria-checked"
      ],
      "superClass": [
        "roletype",
        "widget",
        "input"
      ]
    },
    "code": {
      "superClass": [
        "roletype",
        "structure",
        "section"
      ],
      "prohibitedProps": [
        "aria-label",
        "aria-labelledby"
      ]
    },
    "columnheader": {
      "nameRequired": true,
      "superClass": [
        "roletype",
        "structure",
        "section",
        "cell",
        "gridcell",
        "widget",
        "sectionhead"
      ],
      "requiredContext": [
        "row"
      ]
    },
    "combobox": {
      "nameRequired": true,
      "requiredProps": [
        "aria-controls",
        "aria-expanded"
      ],
      "superClass": [
        "roletype",
        "widget",
        "input"
      ]
    },
    "command": {
      "abstract": true,
      "superClass": [
        "roletype",
        "widget"
      ]
    },
    "complementary": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "landmark"
      ]
    },
    "composite": {
      "abstract": true,
      "superClass": [
        "roletype",
        "widget"
      ]
    },
    "contentinfo": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "landmark"
      ]
    },
    "definition": {
      "superClass": [
        "roletype",
        "structure",
        "section"
      ]
    },
    "deletion": {
      "superClass": [
        "roletype",
        "structure",
        "section"
      ],
      "prohibitedProps": [
        "aria-label",
        "aria-labelledby"
      ]
    },
    "dialog": {
      "nameRequired": true,
      "superClass": [
        "roletype",
        "window"
      ]
    },
    "directory": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "list"
      ]
    },
    "doc-abstract": {
      "superClass": [
        "roletype",
        "structure",
        "section"
      ]
    },
    "doc-acknowledgments": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "landmark"
      ]
    },
    "doc-afterword": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "landmark"
      ]
    },
    "doc-appendix": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "landmark"
      ]
    },
    "doc-backlink": {
      "nameRequired": true,
      "superClass": [
        "roletype",
        "widget",
        "command",
        "link"
      ]
    },
    "doc-biblioentry": {
      "nameRequired": true,
      "superClass": [
        "roletype",
        "structure",
        "section",
        "listitem"
      ],
      "requiredContext": [
        "doc-bibliography"
      ]
    },
    "doc-bibliography": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "landmark"
      ],
      "requiredOwned": [
        "doc-biblioentry"
      ]
    },
    "doc-biblioref": {
      "nameRequired": true,
      "superClass": [
        "roletype",
        "widget",
        "command",
        "link"
      ]
    },
    "doc-chapter": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "landmark"
      ]
    },
    "doc-colophon": {
      "superClass": [
        "roletype",
        "structure",
        "section"
      ]
    },
    "doc-conclusion": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "landmark"
      ]
    },
    "doc-cover": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "img"
      ]
    },
    "doc-credit": {
      "superClass": [
        "roletype",
        "structure",
        "section"
      ]
    },
    "doc-credits": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "landmark"
      ]
    },
    "doc-dedication": {
      "superClass": [
        "roletype",
        "structure",
        "section"
      ]
    },
    "doc-endnote": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "listitem"
      ],
      "requiredContext": [
        "doc-endnotes"
      ]
    },
    "doc-endnotes": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "landmark"
      ],
      "requiredOwned": [
        "doc-endnote"
      ]
    },
    "doc-epigraph": {
      "superClass": [
        "roletype",
        "structure",
        "section"
      ]
    },
    "doc-epilogue": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "landmark"
      ]
    },
    "doc-errata": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "landmark"
      ]
    },
    "doc-example": {
      "superClass": [
        "roletype",
        "structure",
        "section"
      ]
    },
    "doc-footnote": {
      "superClass": [
        "roletype",
        "structure",
        "section"
      ]
    },
    "doc-foreword": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "landmark"
      ]
    },
    "doc-glossary": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "landmark"
      ],
      "requiredOwned": [
        "definition",
        "term"
      ]
    },
    "doc-glossref": {
      "nameRequired": true,
      "superClass": [
        "roletype",
        "widget",
        "command",
        "link"
      ]
    },
    "doc-index": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "landmark",
        "navigation"
      ]
    },
    "doc-introduction": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "landmark"
      ]
    },
    "doc-noteref": {
      "nameRequired": true,
      "superClass": [
        "roletype",
        "widget",
        "command",
        "link"
      ]
    },
    "doc-notice": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "note"
      ]
    },
    "doc-pagebreak": {
      "nameRequired": true,
      "superClass": [
        "roletype",
        "structure",
        "separator"
      ]
    },
    "doc-pagefooter": {
      "superClass": [
        "roletype",
        "structure",
        "section"
      ]
    },
    "doc-pageheader": {
      "superClass": [
        "roletype",
        "structure",
        "section"
      ]
    },
    "doc-pagelist": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "landmark",
        "navigation"
      ]
    },
    "doc-part": {
      "nameRequired": true,
      "superClass": [
        "roletype",
        "structure",
        "section",
        "landmark"
      ]
    },
    "doc-preface": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "landmark"
      ]
    },
    "doc-prologue": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "landmark"
      ]
    },
    "doc-pullquote": {
      "superClass": [
        "none"
      ]
    },
    "doc-qna": {
      "superClass": [
        "roletype",
        "structure",
        "section"
      ]
    },
    "doc-subtitle": {
      "superClass": [
        "roletype",
        "structure",
        "sectionhead"
      ]
    },
    "doc-tip": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "note"
      ]
    },
    "doc-toc": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "landmark",
        "navigation"
      ]
    },
    "document": {
      "superClass": [
        "roletype",
        "structure"
      ]
    },
    "emphasis": {
      "superClass": [
        "roletype",
        "structure",
        "section"
      ],
      "prohibitedProps": [
        "aria-label",
        "aria-labelledby"
      ]
    },
    "feed": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "list"
      ],
      "requiredOwned": [
        "article"
      ]
    },
    "figure": {
      "superClass": [
        "roletype",
        "structure",
        "section"
      ]
    },
    "form": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "landmark"
      ]
    },
    "generic": {
      "superClass": [
        "roletype",
        "structure"
      ],
      "prohibitedProps": [
        "aria-label",
        "aria-labelledby"
      ]
    },
    "graphics-document": {
      "nameRequired": true,
      "superClass": [
        "roletype",
        "structure",
        "document"
      ]
    },
    "graphics-object": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "group"
      ]
    },
    "graphics-symbol": {
      "nameRequired": true,
      "superClass": [
        "roletype",
        "structure",
        "section",
        "img"
      ]
    },
    "grid": {
      "nameRequired": true,
      "superClass": [
        "roletype",
        "widget",
        "composite",
        "structure",
        "section",
        "table"
      ],
      "requiredOwned": [
        "row",
        "rowgroup"
      ]
    },
    "gridcell": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "cell",
        "widget"
      ],
      "requiredContext": [
        "row"
      ]
    },
    "group": {
      "superClass": [
        "roletype",
        "structure",
        "section"
      ]
    },
    "heading": {
      "nameRequired": true,
      "requiredProps": [
        "aria-level"
      ],
      "superClass": [
        "roletype",
        "structure",
        "sectionhead"
      ]
    },
    "img": {
      "nameRequired": true,
      "superClass": [
        "roletype",
        "structure",
        "section"
      ]
    },
    "input": {
      "abstract": true,
      "superClass": [
        "roletype",
        "widget"
      ]
    },
    "insertion": {
      "superClass": [
        "roletype",
        "structure",
        "section"
      ],
      "prohibitedProps": [
        "aria-label",
        "aria-labelledby"
      ]
    },
    "landmark": {
      "abstract": true,
      "superClass": [
        "roletype",
        "structure",
        "section"
      ]
    },
    "link": {
      "nameRequired": true,
      "superClass": [
        "roletype",
        "widget",
        "command"
      ]
    },
    "list": {
      "superClass": [
        "roletype",
        "structure",
        "section"
      ],
      "requiredOwned": [
        "listitem"
      ]
    },
    "listbox": {
      "nameRequired": true,
      "superClass": [
        "roletype",
        "widget",
        "composite",
        "select",
        "structure",
        "section",
        "group"
      ],
      "requiredOwned": [
        "option",
        "group"
      ]
    },
    "listitem": {
      "superClass": [
        "roletype",
        "structure",
        "section"
      ],
      "requiredContext": [
        "directory",
        "list"
      ]
    },
    "log": {
      "superClass": [
        "roletype",
        "structure",
        "section"
      ]
    },
    "main": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "landmark"
      ]
    },
    "mark": {
      "superClass": [
        "roletype",
        "structure",
        "section"
      ]
    },
    "marquee": {
      "nameRequired": true,
      "superClass": [
        "roletype",
        "structure",
        "section"
      ]
    },
    "math": {
      "superClass": [
        "roletype",
        "structure",
        "section"
      ]
    },
    "menu": {
      "superClass": [
        "roletype",
        "widget",
        "composite",
        "select",
        "structure",
        "section",
        "group"
      ],
      "requiredOwned": [
        "menuitem",
        "group",
        "menuitemradio",
        "menuitemcheckbox"
      ]
    },
    "menubar": {
      "superClass": [
        "roletype",
        "widget",
        "composite",
        "select",
        "menu",
        "structure",
        "section",
        "group"
      ],
      "requiredOwned": [
        "menuitem",
        "group",
        "menuitemradio",
        "menuitemcheckbox"
      ]
    },
    "menuitem": {
      "nameRequired": true,
      "superClass": [
        "roletype",
        "widget",
        "command"
      ],
      "requiredContext": [
        "group",
        "menu",
        "menubar"
      ]
    },
    "menuitemcheckbox": {
      "nameRequired": true,
      "requiredProps": [
        "aria-checked"
      ],
      "superClass": [
        "roletype",
        "widget",
        "input",
        "checkbox",
        "command",
        "menuitem"
      ],
      "requiredContext": [
        "group",
        "menu",
        "menubar"
      ]
    },
    "menuitemradio": {
      "nameRequired": true,
      "requiredProps": [
        "aria-checked"
      ],
      "superClass": [
        "roletype",
        "widget",
        "input",
        "checkbox",
        "menuitemcheckbox",
        "command",
        "menuitem",
        "radio"
      ],
      "requiredContext": [
        "group",
        "menu",
        "menubar"
      ]
    },
    "meter": {
      "nameRequired": true,
      "requiredProps": [
        "aria-valuenow"
      ],
      "superClass": [
        "roletype",
        "structure",
        "range"
      ]
    },
    "navigation": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "landmark"
      ]
    },
    "none": {},
    "note": {
      "superClass": [
        "roletype",
        "structure",
        "section"
      ]
    },
    "option": {
      "nameRequired": true,
      "requiredProps": [
        "aria-selected"
      ],
      "superClass": [
        "roletype",
        "widget",
        "input"
      ]
    },
    "paragraph": {
      "superClass": [
        "roletype",
        "structure",
        "section"
      ],
      "prohibitedProps": [
        "aria-label",
        "aria-labelledby"
      ]
    },
    "presentation": {
      "superClass": [
        "roletype",
        "structure"
      ],
      "prohibitedProps": [
        "aria-label",
        "aria-labelledby"
      ]
    },
    "progressbar": {
      "nameRequired": true,
      "superClass": [
        "roletype",
        "structure",
        "range",
        "widget"
      ]
    },
    "radio": {
      "nameRequired": true,
      "requiredProps": [
        "aria-checked"
      ],
      "superClass": [
        "roletype",
        "widget",
        "input"
      ]
    },
    "radiogroup": {
      "nameRequired": true,
      "superClass": [
        "roletype",
        "widget",
        "composite",
        "select",
        "structure",
        "section",
        "group"
      ],
      "requiredOwned": [
        "radio"
      ]
    },
    "range": {
      "abstract": true,
      "superClass": [
        "roletype",
        "structure"
      ]
    },
    "region": {
      "nameRequired": true,
      "superClass": [
        "roletype",
        "structure",
        "section",
        "landmark"
      ]
    },
    "roletype": {
      "abstract": true
    },
    "row": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "group",
        "widget"
      ],
      "requiredContext": [
        "grid",
        "rowgroup",
        "table",
        "treegrid"
      ],
      "requiredOwned": [
        "cell",
        "columnheader",
        "gridcell",
        "rowheader"
      ]
    },
    "rowgroup": {
      "superClass": [
        "roletype",
        "structure"
      ],
      "requiredContext": [
        "grid",
        "table",
        "treegrid"
      ],
      "requiredOwned": [
        "row"
      ]
    },
    "rowheader": {
      "nameRequired": true,
      "superClass": [
        "roletype",
        "structure",
        "section",
        "cell",
        "gridcell",
        "widget",
        "sectionhead"
      ],
      "requiredContext": [
        "row",
        "rowgroup"
      ]
    },
    "scrollbar": {
      "requiredProps": [
        "aria-controls",
        "aria-valuenow"
      ],
      "superClass": [
        "roletype",
        "structure",
        "range",
        "widget"
      ]
    },
    "search": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "landmark"
      ]
    },
    "searchbox": {
      "nameRequired": true,
      "superClass": [
        "roletype",
        "widget",
        "input",
        "textbox"
      ]
    },
    "section": {
      "abstract": true,
      "superClass": [
        "roletype",
        "structure"
      ]
    },
    "sectionhead": {
      "abstract": true,
      "superClass": [
        "roletype",
        "structure"
      ]
    },
    "select": {
      "abstract": true,
      "superClass": [
        "roletype",
        "widget",
        "composite",
        "structure",
        "section",
        "group"
      ]
    },
    "separator": {
      "superClass": [
        "roletype",
        "structure"
      ]
    },
    "slider": {
      "nameRequired": true,
      "requiredProps": [
        "aria-valuenow"
      ],
      "superClass": [
        "roletype",
        "widget",
        "input",
        "structure",
        "range"
      ]
    },
    "spinbutton": {
      "nameRequired": true,
      "superClass": [
        "roletype",
        "widget",
        "composite",
        "input",
        "structure",
        "range"
      ]
    },
    "status": {
      "superClass": [
        "roletype",
        "structure",
        "section"
      ]
    },
    "strong": {
      "superClass": [
        "roletype",
        "structure",
        "section"
      ],
      "prohibitedProps": [
        "aria-label",
        "aria-labelledby"
      ]
    },
    "structure": {
      "abstract": true,
      "superClass": [
        "roletype"
      ]
    },
    "subscript": {
      "superClass": [
        "roletype",
        "structure",
        "section"
      ],
      "prohibitedProps": [
        "aria-label",
        "aria-labelledby"
      ]
    },
    "superscript": {
      "superClass": [
        "roletype",
        "structure",
        "section"
      ],
      "prohibitedProps": [
        "aria-label",
        "aria-labelledby"
      ]
    },
    "switch": {
      "nameRequired": true,
      "requiredProps": [
        "aria-checked"
      ],
      "superClass": [
        "roletype",
        "widget",
        "input",
        "checkbox"
      ]
    },
    "tab": {
      "superClass": [
        "roletype",
        "structure",
        "sectionhead",
        "widget"
      ],
      "requiredContext": [
        "tablist"
      ]
    },
    "table": {
      "nameRequired": true,
      "superClass": [
        "roletype",
        "structure",
        "section"
      ],
      "requiredOwned": [
        "row",
        "rowgroup"
      ]
    },
    "tablist": {
      "superClass": [
        "roletype",
        "widget",
        "composite"
      ],
      "requiredOwned": [
        "tab"
      ]
    },
    "tabpanel": {
      "nameRequired": true,
      "superClass": [
        "roletype",
        "structure",
        "section"
      ]
    },
    "term": {
      "superClass": [
        "roletype",
        "structure",
        "section"
      ]
    },
    "textbox": {
      "nameRequired": true,
      "superClass": [
        "roletype",
        "widget",
        "input"
      ]
    },
    "time": {
      "superClass": [
        "roletype",
        "structure",
        "section"
      ]
    },
    "timer": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "status"
      ]
    },
    "toolbar": {
      "superClass": [
        "roletype",
        "structure",
        "section",
        "group"
      ]
    },
    "tooltip": {
      "nameRequired": true,
      "superClass": [
        "roletype",
        "structure",
        "section"
      ]
    },
    "tree": {
      "nameRequired": true,
      "superClass": [
        "roletype",
        "widget",
        "composite",
        "select",
        "structure",
        "section",
        "group"
      ],
      "requiredOwned": [
        "treeitem",
        "group"
      ]
    },
    "treegrid": {
      "nameRequired": true,
      "superClass": [
        "roletype",
        "widget",
        "composite",
        "grid",
        "structure",
        "section",
        "table",
        "select",
        "tree",
        "group"
      ],
      "requiredOwned": [
        "row",
        "rowgroup"
      ]
    },
    "treeitem": {
      "nameRequired": true,
      "requiredProps": [
        "aria-selected"
      ],
      "superClass": [
        "roletype",
        "structure",
        "section",
        "listitem",
        "widget",
        "input",
        "option"
      ],
      "requiredContext": [
        "group",
        "tree"
      ]
    },
    "widget": {
      "abstract": true,
      "superClass": [
        "roletype"
      ]
    },
    "window": {
      "abstract": true,
      "superClass": [
        "roletype"
      ]
    }
  }
};
