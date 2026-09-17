-- ═══════════════════════════════════════════════════════════
-- HireKit — Per-event reminders
-- Run this in: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════

-- How long before the event to be notified, in minutes.
--
-- Google's model is a useDefault flag plus an overrides list, which is two
-- concepts; this is one column with a documented sentinel so the modal can
-- stay a single dropdown:
--
--    NULL  → inherit whatever this Google calendar's default reminder is
--      -1  → no reminder at all
--    >= 0  → minutes before the event (0 = exactly at start time)
--
-- Delivery is Google's job. That is the point: reminders set here reach the
-- user's phone and desktop whether or not HireKit is running, which nothing
-- in this app could do on its own without an always-on server.
alter table calendar_events add column if not exists reminder_minutes integer;

comment on column calendar_events.reminder_minutes is
  'Minutes before the event to notify. NULL = Google calendar default, -1 = none, >=0 = minutes before.';
