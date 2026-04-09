-- Run this entire script in Supabase SQL Editor to create the required tables

-- 1. Create seat_tables table
CREATE TABLE IF NOT EXISTS seat_tables (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    governorate TEXT DEFAULT 'Minya',
    seat_class TEXT NOT NULL,
    row_number INTEGER NOT NULL,
    side TEXT NOT NULL,
    table_order INTEGER NOT NULL,
    seats_count INTEGER NOT NULL,
    position_x NUMERIC(10,2) DEFAULT 0,
    position_y NUMERIC(10,2) DEFAULT 0,
    width NUMERIC(10,2) DEFAULT 120,
    height NUMERIC(10,2) DEFAULT 60,
    max_seats INTEGER DEFAULT 12,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_seat_tables_event ON seat_tables(event_id);

-- 2. Create seats table
CREATE TABLE IF NOT EXISTS seats (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    governorate TEXT DEFAULT 'Minya',
    seat_class TEXT NOT NULL,
    row_number INTEGER NOT NULL,
    side TEXT NOT NULL,
    table_id TEXT REFERENCES seat_tables(id) ON DELETE CASCADE,
    seat_number INTEGER NOT NULL,
    seat_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'available',
    position_x NUMERIC(10,2) DEFAULT 0,
    position_y NUMERIC(10,2) DEFAULT 0,
    relative_x NUMERIC(10,2),
    relative_y NUMERIC(10,2),
    wave_number INTEGER,
    reserved_by TEXT,
    reserved_until TIMESTAMP WITH TIME ZONE,
    attendee_id UUID, -- If attendee_id is UUID in attendees table, else TEXT
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_seats_event ON seats(event_id);
CREATE INDEX IF NOT EXISTS idx_seats_status ON seats(status);

-- 3. Create seat_bookings table (for history/logs)
CREATE TABLE IF NOT EXISTS seat_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL,
    seat_id TEXT REFERENCES seats(id) ON DELETE CASCADE,
    attendee_id UUID, -- Or TEXT depending on attendees table
    booked_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE seat_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE seat_bookings ENABLE ROW LEVEL SECURITY;

-- 5. Create basic policies to allow reading and writing
CREATE POLICY "Enable read access for all users" ON seat_tables FOR SELECT USING (true);
CREATE POLICY "Enable all access for authenticated users" ON seat_tables FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Enable read access for all users" ON seats FOR SELECT USING (true);
CREATE POLICY "Enable all access for authenticated users" ON seats FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Enable read access for all users" ON seat_bookings FOR SELECT USING (true);
CREATE POLICY "Enable all access for authenticated users" ON seat_bookings FOR ALL USING (auth.role() = 'authenticated');
