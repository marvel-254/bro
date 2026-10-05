# BRO v1 Dashboard — Option A (Frozen)

Date: 2026-10-03
Decision: Single layout for v1. No day-one picker, no settings switcher.
Personalization later via density/accent only.

## Bottom bar (always visible)

Home / Chats / + / Bros / Me
- `+` is raised center action, opens Create sheet, not a screen.
- Same dark `#090A0F`, thin borders, one accent everywhere.
- Back rule: Sheet closes → Branch → Chat → List. No dead ends.

## HOME — Pulse (default tab)

Header: `Yoh, tsup bruv?` left, search + avatar right.

Top to bottom:
1. Live now — horizontal cards. `Sarah cooking — 12 in` → tap opens `bro://conversation/:id`.
2. Tap-in — vertical drops/plans expiring soon. `Tacos at 7? — 3 in, ends 2h — [Tap in]`.
3. Around — avatar row with presence: here / chilling iykyk / locked in / off the grid brb. Tap → DM.

Empty: `Quiet fr. No live ones. Drop a vibe cuz.`

## CHATS

Header: `Chats` + New icon right.

Row: avatar + presence dot | Name + time `2m` | preview `uko wapi msee?` | unread pill / mute.
Tap → chat. Long-press → Pin / Mute / Leave.

Empty: `L msee. No chats yet ngl. Say less, start one.`

## CREATE SHEET (+)

4 rows, 2 taps max:
- Drop a vibe — `Coffee run? 2h`
- Make a plan — `Tacos at 7?`
- Start chat — 1-to-1 / group
- New squad — crew + link

Footer: `expires on its own. no cleanup fr.`

## BROS

Segmented top: Around | Spaces.
- Around = Who's Around + requests.
- Spaces = squads grid + discover. Conversations primary, channels secondary.

## ME

Avatar, @you, presence picker, My drops / My plans, Settings.
Settings v1: Density [Comfy/Compact], Accent [1 pick], Show Calls tab [on/off]. No layout switch.

## Non-goals v1

No rail nav, no gesture-only nav, no hamburger, no 8-icon grid.
Calls button lives in chat header only until WebRTC is real.
Voice from `bro-voice-guide.md` applies verbatim.
