# FlowLens Depth Model

FlowLens organizes accessibility evaluation into three depth levels. Each level captures a different class of accessibility issues, and each builds on the level below it.

```
┌─────────────────────────────────────────────┐
│  Depth 3 — Conversation Integrity           │
│  State transitions across steps and frames  │
├─────────────────────────────────────────────┤
│  Depth 2 — Interaction Stability            │
│  Focus, keyboard order, mutation effects    │
├─────────────────────────────────────────────┤
│  Depth 1 — Static WCAG                     │
│  ARIA roles, semantics, contrast, structure │
└─────────────────────────────────────────────┘
```

## Depth 1 — Static WCAG

Checks that can be performed on a single DOM snapshot without any user interaction.

- ARIA roles and attributes
- Semantic structure (headings, landmarks, lists)
- Color contrast ratios
- Label associations
- Tab index values
- Image alternatives

This is the level where traditional accessibility scanners operate. A page either passes or fails these checks at any given moment.

## Depth 2 — Interaction Stability

Checks that require observing the page over time as the DOM changes in response to user actions or asynchronous updates.

- Focus management after mutations
- Keyboard tab order consistency
- Loading state detection
- Silent content replacement

Depth 2 issues only appear when something changes. A static snapshot will not reveal a focus trap that only activates after a modal opens, or a tab order that breaks after content is dynamically inserted.

## Depth 3 — Conversation Integrity

Checks that require tracking state across multiple conversation turns and correlating findings across frame boundaries. This is what makes FlowLens different from a general-purpose scanner.

Depth 3 evaluates four integrity axes:

### C1 — Announcement Integrity

Are new messages announced to assistive technology?

When a bot responds, the new message must be surfaced through an `aria-live` region or equivalent mechanism in the same frame as the content. If the live region and the message content are in different frames, the announcement will not fire.

### C2 — Focus Stability

Does the composer retain focus after bot responses?

In a multi-turn conversation, focus should return to (or remain on) the input after each response. If focus is lost or moved to the new message, keyboard users must manually navigate back to the composer for every turn.

### C3 — Feed Semantics

Is the message feed properly structured and itemized?

Messages should be individually addressable by assistive technology. The feed container should have an appropriate role (`log`, `feed`), and each message should be a discrete item (`article`, `listitem`). Without this structure, screen readers cannot navigate between messages or announce them individually.

### C4 — Multi-frame Linkage

When chat components span iframes, are they structurally connected?

Many chat implementations split the composer and the feed across frames, or place the chat in an iframe while the announcement mechanism lives in the host page. Depth 3 detects when structurally related components are separated by frame boundaries, which breaks assistive technology assumptions about DOM proximity.

## Why traditional scanners miss Depth 3

Traditional accessibility scanners operate on a single DOM snapshot in a single frame. They answer the question: "Is this HTML valid and accessible right now?"

Depth 3 answers a different question: "Is this conversation accessible across its full lifecycle?"

This requires:

1. **Step-based capture** — Observing the page across multiple conversation turns, not just a single moment. A chat may pass all checks after the first message but fail after the third when focus management breaks down.

2. **Frame awareness** — Correlating findings across iframe boundaries. Each frame may pass checks independently while the cross-frame relationship is broken. A live region in frame B cannot announce content changes in frame A.

3. **Structural correlation** — Connecting related findings (e.g., a missing feed role + a missing live region) into an integrity assessment rather than reporting them as independent violations.

## Depth filtering

FlowLens allows filtering findings by depth level. CI exports include depth metadata so pipelines can gate on specific levels:

- Gate on Depth 1 for baseline WCAG compliance
- Gate on Depth 2 for interaction quality
- Gate on Depth 3 for conversational integrity

Conversational profiles recommend depth settings based on the type of UI being inspected. A static help center may only need Depth 2, while a chat widget with cross-frame components should use Depth 3.
