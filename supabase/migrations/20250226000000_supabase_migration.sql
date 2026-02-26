-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'organizer',
    password TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Attendees Table
CREATE TABLE IF NOT EXISTS attendees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    phone_primary TEXT NOT NULL,
    phone_secondary TEXT,
    email_primary TEXT,
    email_secondary TEXT,
    facebook_link TEXT,
    governorate TEXT NOT NULL,
    seat_class TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'interested',
    payment_type TEXT DEFAULT 'deposit',
    payment_amount DECIMAL DEFAULT 0,
    remaining_amount DECIMAL DEFAULT 0,
    attendance_status BOOLEAN DEFAULT FALSE,
    qr_code TEXT UNIQUE,
    barcode TEXT,
    checked_in_at TIMESTAMP WITH TIME ZONE,
    checked_in_by TEXT,
    created_by TEXT,
    is_deleted BOOLEAN DEFAULT FALSE,
    warnings JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Logs Table
CREATE TABLE IF NOT EXISTS logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attendee_id UUID REFERENCES attendees(id),
    recorded_by TEXT,
    action TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create initial admin user if not exists
-- Password 'admin123'
INSERT INTO users (id, email, full_name, role, password)
VALUES ('00000000-0000-0000-0000-000000000000', 'admin@event.com', 'System Owner', 'owner', 'admin123')
ON CONFLICT (email) DO NOTHING;
