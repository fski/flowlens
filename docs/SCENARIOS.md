# FlowLens Scenarios

Three concrete examples of what FlowLens detects at Depth 3 that traditional scanners miss.

---

## Scenario 1 — Chat feed missing role

**Problem**

A chat widget visually displays messages in a scrollable container. New messages appear when the bot responds. But the feed container is a plain `<div>` with no ARIA role:

```html
<div class="chat-messages">
  <div class="message">How can I help?</div>
  <div class="message">I need to reset my password.</div>
</div>
```

A traditional scanner sees valid HTML with no rule violations. The structure is semantically correct at the element level.

**What FlowLens detects**

- **Chat Semantics: degraded**
- Rule: `CHAT_FEED_MISSING_ROLE` (Depth 3)
- Low `itemizationScore01` — messages are not individually addressable by assistive technology

FlowLens identifies this because Depth 3 evaluates whether the message feed is structured as a feed or log that screen readers can navigate, not just whether individual elements have valid markup.

**Human takeaway**

Screen readers may not announce new messages reliably. Users who cannot see the chat may not know a response has arrived. Adding `role="log"` or `role="feed"` to the container and `role="listitem"` or `role="article"` to each message resolves the issue.

---

## Scenario 2 — Announcements in a different iframe

**Problem**

A help center page embeds a chat widget in an iframe. The chat feed lives in iframe A, but the `aria-live` region that announces new messages lives in iframe B (or in the host page):

```
Host page
  ├── iframe A: chat feed (messages rendered here)
  └── iframe B: live region (aria-live="polite")
```

Each iframe passes a traditional WCAG audit independently. The live region exists. The chat feed has proper roles.

**What FlowLens detects**

- **Announcement Integrity: degraded**
- **Multi-frame Integrity: degraded**
- Rule: `ANNOUNCEMENT_IN_DIFFERENT_FRAME`
- Cross-frame finding (cannot be highlighted in a single frame)

FlowLens correlates findings across frame boundaries. It detects that the announcement mechanism and the content source are in separate frames, which means the live region may never fire for the actual message content.

**Human takeaway**

Users may never hear new messages. The `aria-live` region in iframe B does not observe DOM changes in iframe A. The announcement and the content must exist in the same frame for assistive technology to connect them.

---

## Scenario 3 — Composer focus lost after bot response

**Problem**

A chat widget has a text input (composer) where users type messages. After sending a message, the bot responds and the widget re-renders. After re-render, focus is no longer on the composer:

1. User focuses the input and types a message
2. User presses Enter to send
3. Bot response renders (DOM mutation)
4. Focus moves to the new message or is lost entirely

A traditional scanner running after step 4 sees a valid input element with no focus-related violations.

**What FlowLens detects**

- **Focus Stability: degraded**
- Rule: `CHAT_INPUT_LOSES_FOCUS_ON_UPDATE` (Depth 3)

FlowLens observes the conversation across multiple turns. It detects that the composer loses focus after a DOM update, which is a conversation-level accessibility failure that only manifests during interaction.

**Human takeaway**

Keyboard users must manually refocus the input after every bot response. In a multi-turn conversation, this means pressing Tab repeatedly to navigate back to the composer for each message — a significant usability barrier that makes the chat effectively unusable for keyboard-only users.
