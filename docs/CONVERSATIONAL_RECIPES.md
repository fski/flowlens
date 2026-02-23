# Conversational Recipes

Practical recipes for auditing conversational and support-flow UIs with FlowLens.

## What FlowLens is best at

FlowLens excels at accessibility testing for **conversational interfaces** — chat widgets, help centers, AI bots, and hybrid support portals. Key strengths:

- **Chat-aware soft checks**: purpose-built rules for live regions, message grouping, typing indicators, and focus management in chat UIs.
- **State-based observation**: Watch and Observe modes detect regressions that only surface during real-time interaction (e.g. new messages not announced, focus stolen during updates).
- **Frame-aware detection**: profiles target specific frame scopes (primary page vs embedded widget), reducing noise from irrelevant content.

---

## Recipe 1: Embedded Chat Widget

**Scenario**: A floating chat widget embedded via iframe or shadow DOM overlay.

| Setting | Value |
|---------|-------|
| Profile | `generic-chat-widget` |
| Frame scope | embedded |
| Modes | **Run** for static checks, then **Watch** for live interaction |

**Capture strategy**:
1. Open the page and activate the chat widget.
2. **Run** a baseline audit — catches static issues (missing labels, broken ARIA, no live region).
3. **Mark Step** after the widget is open.
4. Start **Watch** mode and simulate a conversation (send a message, wait for response).
5. Watch detects state-based issues: messages not announced, focus lost during updates.
6. **Mark Step** again to capture the post-conversation state.

**Key diffs to look for**:
- `blockingAdded`: new issues introduced when the widget transitions from idle to active.
- `blockingFixed`: issues that resolve when proper ARIA attributes are applied dynamically.

---

## Recipe 2: Help Center + Bot Takeover

**Scenario**: A help center with article navigation that transitions to a bot-powered chat when the user clicks "Contact Us" or a bot proactively offers help.

| Setting | Value |
|---------|-------|
| Profile | `hybrid-help-chat` |
| Frame scope | primary |
| Modes | **Run** for static structure, **Observe** for bot takeover detection |

**Capture strategy**:
1. Navigate to the help center landing page.
2. **Run** baseline — audits article tree, search, breadcrumbs, and accordion state.
3. **Mark Step**.
4. Trigger bot takeover (click contact, or wait for proactive prompt).
5. Start **Observe** mode to periodically re-audit as the bot interface loads.
6. Observe catches: live region changes, new message containers without announcement semantics.
7. **Mark Step** after the bot conversation is active.

**Key diffs to look for**:
- `blockingAdded`: bot UI introduces missing labels, inaccessible quick-reply buttons.
- `blockingFixed`: bot correctly uses `role="log"` and `aria-live` where the static page did not.

---

## Recipe 3: Multi-Frame Support Portal

**Scenario**: A support portal with the main page in one frame and an agent chat in another (e.g. a sidebar iframe or a co-browsing widget).

| Setting | Value |
|---------|-------|
| Profile | `generic-ai-bot-tree` |
| Frame scope | embedded |
| Modes | **Watch** for continuous monitoring across frames |

**Capture strategy**:
1. Open the support portal and ensure both frames are loaded.
2. Start **Watch** mode — it monitors mutations across the targeted frame scope.
3. Interact with the agent chat: send messages, receive responses, use quick replies.
4. Watch detects cross-frame issues: focus jumps between frames, messages not announced in the chat frame.
5. **Mark Step** at key interaction points (initial load, after first response, after escalation).

**Key diffs to look for**:
- `blockingAdded`: agent chat frame lacks proper ARIA structure.
- Step-over-step diffs reveal regressions introduced by dynamic content loading.

---

## Profile Selection Guide

| Profile | Best for | Frame scope |
|---------|----------|-------------|
| `generic-helpcenter-spa` | Single-page help centers with article trees | primary |
| `generic-chat-widget` | Embedded chat widgets (iframe/overlay) | embedded |
| `generic-ai-bot-tree` | AI bot interfaces with decision trees | embedded |
| `hybrid-help-chat` | Help centers that transition to chat | primary |

---

## Capture Strategy Matrix

| Mode | When to use | What it detects |
|------|-------------|-----------------|
| **Run** | Static audits, baseline snapshots | Missing labels, broken ARIA, structural issues |
| **Observe** | Periodic re-audits during slow transitions | Bot takeover regressions, gradual DOM changes |
| **Watch** | Real-time monitoring during active interaction | Focus loss, unannounced messages, live region misuse |

**Recommended cadence**:
- Start every flow session with a **Run** baseline.
- Use **Mark Step** before and after each significant UI transition.
- Switch to **Watch** or **Observe** for the interactive phase.
- End with a final **Run** to capture the settled state.

---

## Interpreting Diffs

FlowLens diffs compare findings between steps or runs:

- **blockingAdded**: New accessibility issues introduced since the previous step. These are regressions — the UI got worse.
- **blockingFixed**: Issues that were present before but are now resolved. The UI improved.
- **unchanged**: Issues present in both steps — persistent problems that need attention.

For conversational flows, pay special attention to `blockingAdded` during transitions (widget open, bot takeover, message received) — these often reveal dynamic ARIA issues that static audits miss.

---

## Works well with products like

FlowLens is vendor-agnostic and works with any conversational UI. It has been designed with common support platform patterns in mind:

- **Zendesk** — help center article trees, embedded chat widgets, agent workspaces.
- **Intercom** — messenger overlays, bot flows, help center articles.

The structural profiles detect patterns common across these and similar products without coupling to any vendor-specific implementation.

---

## Troubleshooting

1. **Chat not detected?**
   - Check the **Active Profile** in the About/Diagnostics tab.
   - If the widget is embedded (iframe), ensure Frame Scope is set to "embedded".

2. **No findings in Watch mode?**
   - Run a baseline audit first, then switch to Watch.
   - Interact with the chat (send a message, wait for a response) to trigger DOM updates.

3. **Too many findings?**
   - Use a subtree scan scoped to the chat container instead of the full document.
   - Focus on `blockingAdded` in step diffs to isolate regressions.

4. **Wrong frame selected?**
   - Check **Best Frame ID** and **Frame Scope** in Diagnostics.
   - Switch profiles if the current one targets the wrong frame scope.

5. **Profile not matching expected layout?**
   - Try switching between `generic-chat-widget` (embedded scope) and `hybrid-help-chat` (primary scope).
   - Check **Profile Signals** in Diagnostics to see which selectors are active.
