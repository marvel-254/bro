# Plans/Squads Deep Spec — to RLS columns

Date: 2026-10-03. Supabase-only. Reuses drops pattern.

## Tables

squads [id, name varchar(40), created_by, invite_code text unique, created_at]
squad_members [squad_id, user_id, role owner/member, joined_at, pk(squad_id,user_id)]
plans [id, squad_id null, host_id, title varchar(120), detail text null, when_at timestamptz null, place text null, state loose/event, conversation_id null, created_at]
plan_responses [plan_id, user_id, status Going/Maybe/Can't, updated_at, pk]

Indexes: plans(squad_id, when_at), members(user_id).

## RLS

- squads SELECT: member or invite-code peek (id+name only via RPC). INSERT authed. UPDATE owner.
- members SELECT: fellow members. INSERT: self via valid invite OR owner add. DELETE: self leave, owner remove.
- plans SELECT: squad members or host invitees. INSERT: squad member. UPDATE host only. Promote loose→event host only, carries responses+chat.
- responses: self upsert only.

Helpers after tables: `is_squad_member`, `is_plan_host`.

## Logic

- Loose plan: title only, no time required. Event: requires when_at + place.
- Host update pins to plan (single `pinned_update` col or latest activity row).
- Nudge: notify 3 specific friends, not broadcast. One ping per plan/day.
- Expiry: plans archive after when_at+24h, stay readable, chat persists (unlike drops).

## Realtime

`postgres_changes` on plans + responses for live tally. Broadcast typing in plan chat only.

## UX

Card: `Tacos at 7? — 3 Going · 1 Maybe — [Going][Maybe][Can't]` + [Nudge] + host note.
Empty squad: `No plans cuz. Drop one, say less.`

## Verify

A creates squad → invite link → B joins → A posts loose → B Going → promote to event → responses carry → Nudge only to C → RLS: outsider SELECT denied, non-host promote denied.
