CREATE TABLE IF NOT EXISTS seat_tables (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  seat_class TEXT NOT NULL CHECK (seat_class IN ('A', 'B', 'C')),
  row_number INTEGER NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('left', 'right')),
  table_order INTEGER NOT NULL,
  seats_count INTEGER NOT NULL DEFAULT 12,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS seats (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  seat_class TEXT NOT NULL CHECK (seat_class IN ('A', 'B', 'C')),
  row_number INTEGER NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('left', 'right')),
  table_id TEXT REFERENCES seat_tables(id),
  seat_number INTEGER NOT NULL,
  seat_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'booked', 'vip')),
  position_x NUMERIC(10,2),
  position_y NUMERIC(10,2),
  reserved_by UUID REFERENCES users(id),
  reserved_until TIMESTAMP WITH TIME ZONE,
  attendee_id UUID REFERENCES attendees(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_seat_code_per_event ON seats(event_id, seat_code);
CREATE INDEX IF NOT EXISTS idx_seats_status ON seats(status);
CREATE INDEX IF NOT EXISTS idx_seats_class_row ON seats(event_id, seat_class, row_number);

CREATE TABLE IF NOT EXISTS seat_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL,
  user_id UUID REFERENCES users(id),
  attendee_id UUID REFERENCES attendees(id),
  seat_id TEXT NOT NULL REFERENCES seats(id),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_seat_bookings_event ON seat_bookings(event_id);
CREATE INDEX IF NOT EXISTS idx_seat_bookings_attendee ON seat_bookings(attendee_id);
