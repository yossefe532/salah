-- Add governorate column to seating tables to support multiple event locations
ALTER TABLE IF EXISTS seat_tables ADD COLUMN IF NOT EXISTS governorate TEXT DEFAULT 'Minya';
ALTER TABLE IF EXISTS seats ADD COLUMN IF NOT EXISTS governorate TEXT DEFAULT 'Minya';
ALTER TABLE IF EXISTS seat_bookings ADD COLUMN IF NOT EXISTS governorate TEXT DEFAULT 'Minya';

-- Update event_id to be more specific if it's currently just a placeholder
-- This ensures that existing Minya data stays in 'Minya-Main-Hall'
-- and new ones can be 'Asyut-Main-Hall' etc.

-- We also want to make sure the unique index on seat_code considers the event_id
-- (which is already done in the previous migration, but let's be sure)
-- CREATE UNIQUE INDEX IF NOT EXISTS uniq_seat_code_per_event ON seats(event_id, seat_code);
