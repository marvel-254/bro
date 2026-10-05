# BRO v1 Chat — Row + Detail (Frozen)

Date: 2026-10-03
Principle: WhatsApp muscle-memory, BRO soul. Unique but never complicated.

## Row (Chats list)

Avatar + presence dot | Name + time `2m` | preview | status/unread
- Preview: `uko wapi msee?` / `Sarah is cooking...` / `Voice 0:42` / `Photo`
- Right side: unread pill, mute icon, `sending...` / `sent ✓` / `seen ✓✓` for last own message.
- Branch hint when relevant: `↳ 12 replies`
- Tap → chat. Long-press → Pin / Mute / Leave.
- Empty: `L msee. No chats yet ngl. Say less, start one.`

## Detail header

Back | avatar + dot | Name + presence `here / chilling iykyk / locked in / off the grid brb` | call + info
- Tap name → profile. Call icon hidden until 1:1 WebRTC phase, no dead button.

## Body

- Alignment: them left dark, you right tinted. Never break.
- Grouping: consecutive same-sender within 2 min = one avatar/name/time, stacked bubbles.
- Sender line for groups: `Sarah · 19:42` small above text, compact, no giant bubbles.
- Time + checks inside bubble bottom-right, tiny: `19:42 ✓` / `✓✓` tinted when seen.
- Reply: swipe right. Shows quoted parent above composer + inline `↳ replying to ...`.
- Reactions: long-press → `fr / lmao / bet / goated` + More. Stacked inside bubble.
- Branch rule: 5+ replies suggests branch. Pill: `↳ 12 replies — tap to open branch`. Branch screen always shows parent on top + count + back = Branch → Chat.
- Typing: `Sarah is cooking...` above composer.
- Failed: `didn't send ngl — tap to run it back.` Offline queue retries on reconnect, no dupes via client id.
- Media: image thumb first + blur, voice row with play + `0:42`, file with name + size.
- Empty chat: `pov: you + bruv. Yoh, break it.` + `[Say tsup]` focuses composer.

## Composer

`Say tsup bruv...` + image + mic (60s max v1) + send.
- Send disabled when empty. Enter = send.
- Image compress 1920px + 400px thumb before upload. Voice m4a/opus.
- No markdown toolbar v1. Plain + emoji.

## Voice (verbatim from voice guide)

Sending: `sending...` / Sent: `sent` / Seen: `seen fr` / Failed: `didn't send ngl`
Empty: `pov: you + bruv` / Typing: `cooking...`

## Non-goals v1

No markdown preview, no multi-quote, no thread-only channels, no 8-person call button.
Discord-style 24h auto-archive for branches deferred to v2, manual close v1.
