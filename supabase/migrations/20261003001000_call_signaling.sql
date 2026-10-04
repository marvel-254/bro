-- BRO — call signaling durability
--
-- SDP offers and answers travel over the broadcast channel, which only
-- delivers to listeners that are already joined. The callee joins when the
-- ringing row arrives, which is routinely AFTER the caller already sent the
-- offer. That race loses the offer and the call can never connect.
--
-- The fix stores both SDP blobs on the call row itself: the caller writes the
-- offer with the initial insert (one write, no race — the row the callee reads
-- already has it), and the callee writes the answer on accept. ICE candidates
-- stay broadcast-only: they are high-volume, one-shot, and gathering continues
-- for seconds while the phone rings, so early losses do not matter.

alter table public.calls
  add column if not exists offer_sdp text,
  add column if not exists answer_sdp text;

comment on column public.calls.offer_sdp is
  'Caller SDP offer. Written with the initial insert so the callee always reads a complete row. Never contains ICE.';
comment on column public.calls.answer_sdp is
  'Callee SDP answer. Written on accept; the caller watches the row as well as the broadcast channel.';
