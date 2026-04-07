alter table if exists public.attendees
  add column if not exists ticket_printed boolean not null default false,
  add column if not exists ticket_printed_at timestamptz null,
  add column if not exists certificate_printed boolean not null default false,
  add column if not exists certificate_printed_at timestamptz null;
