-- Applied to production project sajlpngmpkizwjbarxlj on 2026-10-21.
-- The push_dispatches ledger is service-role only; indexes support FK maintenance
-- and deletion cascades for senders/recipients without exposing rows to app users.
create index if not exists push_dispatches_sender_id_idx
  on public.push_dispatches(sender_id);

create index if not exists push_dispatches_recipient_id_idx
  on public.push_dispatches(recipient_id);
