# Chat contrast audit

Measured with the WCAG 2.1 relative-luminance formula. Targets: 4.5:1 for
normal text, 3:1 for large text and meaningful non-text indicators.

## Canvas pairs

| Foreground | Background | Ratio | Use |
| --- | --- | --- | --- |
| `#F2F5F9` textPrimary | `#090A0F` canvasRoot | 18.08:1 | message text, names |
| `#F2F5F9` textPrimary | `#161B26` surfaceLevel2 | 15.76:1 | received bubble text |
| `#8F9CAE` textSecondary | `#090A0F` | 7.10:1 | secondary copy, reply names |
| `#8F9CAE` textSecondary | `#161B26` | 6.18:1 | quoted text, previews |
| `#7C8A9E` textDim (was `#4F5B6E`) | `#090A0F` | 5.64:1 | timestamps, status hints |
| `#7C8A9E` textDim | `#161B26` | 4.91:1 | timestamps on received bubbles |
| `#7C8A9E` textDim | `#0E1118` | 5.38:1 | list metadata |

`textDim` previously measured 2.88:1 on the canvas. It is used for timestamps,
delivery state, presence text, branch counts and helper copy, all of which are
information rather than decoration, so the token itself was lifted instead of
patching individual screens. `presence.offline` uses the same value; the 3:1
non-text target is met on every surface.

## Interaction rules

- Essential state is never colour-only: sent/delivered/read have distinct
  icons, failed messages say “Tap to retry”, typing has a text label, and
  selected reactions keep a count and selected chip.
- Message actions and headers use at least 44x44 dp targets with
  `accessibilityRole` and labels (audited in `ConversationDetail`,
  `MessageBubbleRow`, `MessageRequestsScreen`).
- Type comes from the shared `TYPOGRAPHY` scale, so it follows system font
  scaling; the composer sits inside the keyboard/safe-area insets.
- Reaction bursts respect `AccessibilityInfo.isReduceMotionEnabled`; the
  persistent reaction chip remains after the animation.

## Follow-up

Re-measure on-device after a release build with the final bubble themes,
including custom mine/theirs colours; `readableTextOn` picks the bubble text
pair at runtime and should be spot-checked against the same 4.5:1 target.
