# BRO v1 Create Sheet (Frozen)

Date: 2026-10-03
Trigger: center `+` tab. 30-50% screen, drag to expand, swipe/backdrop to dismiss, no trap.
Rule: 1 task per sheet, 2 fields max to post, verb-first CTA.

## Entry — 4 rows

1. Drop a vibe — `Coffee run? 2h` — icon ⚡
2. Make a plan — `Tacos at 7?` — icon 📍
3. Start chat — 1-to-1 / group — icon 💬
4. New squad — crew + link — icon 🛡️

Footer: `expires on its own. no cleanup fr.`

## Drop flow (fastest)

Collapsed: `What’s the vibe? [Coffee run?]` + `[2h chip: 2h/4h/Tonight]` + audience `[Squad ▾]` + CTA `[Drop it — bet]`.
Expand: place (optional), allow tap-in chat toggle on (default).
Success: toast `Bet — live. We'll ping the squad.` + deep link to drop chat.

Validation: 1-120 chars, no empty, throttle 5/min (RPC later). Empty: `Say something first msee, say less.`

## Plan flow

`What? [Tacos]` + `When? [Today 19:00]` + `Where? (optional)` + audience + CTA `[Post plan]`.
Post → card with Going/Maybe/Can’t tally. Host update pins to plan. Promote loose → Event carries people + chat.

## Start chat flow

Search `uko wapi msee?` → select 1+ → CTA `[Pull up — start]` → creates DM/group → opens `bro://conversation/:id`.
Empty search: `idek who that is cuz. Invite via link?`

## New squad flow

`Squad name [Ball crew]` + `Who in? [contacts/chips]` + CTA `[Create squad]` → returns invite link + auto chat.
No public squads v1. Mutuals/link only.

## A11y / Android

Actions in thumb zone, 48dp targets, backdrop dismiss with draft kept 60s, back closes sheet first. Screen-reader labels match verb: Drop, Post, Start, Create.
