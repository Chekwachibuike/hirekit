-- ═══════════════════════════════════════════════════════════
-- HireKit — Recurring calendar events
-- Run this in: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════

-- Stores the repeat pattern as an iCalendar RRULE body (no "RRULE:" prefix),
-- e.g. 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' or 'FREQ=MONTHLY;UNTIL=20261231'.
--
-- RRULE rather than a set of columns because it is exactly what Google
-- Calendar's API takes, so the value round-trips without translation, and it
-- leaves room for patterns the UI does not offer yet without another
-- migration. NULL means the event happens once.
alter table calendar_events add column if not exists recurrence text;

comment on column calendar_events.recurrence is
  'iCalendar RRULE body without the RRULE: prefix. NULL = one-off event.';
