-- Back indexes for the call_signals composite membership foreign keys.
create index if not exists call_signals_sender_member_idx
  on public.call_signals(pair_id, sender_id);
create index if not exists call_signals_recipient_member_idx
  on public.call_signals(pair_id, recipient_id);
