-- Create users table (managed by Supabase Auth)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT auth.uid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'data_entry' CHECK (role IN ('owner', 'organizer', 'data_entry')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own profile" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Owner can view all users" ON users FOR SELECT USING (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner'
));
CREATE POLICY "Owner can manage users" ON users FOR ALL USING (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner'
));

-- Create attendees table
CREATE TABLE IF NOT EXISTS attendees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(255) NOT NULL,
    phone_primary VARCHAR(20),
    phone_secondary VARCHAR(20),
    email_primary VARCHAR(255),
    email_secondary VARCHAR(255),
    facebook_link VARCHAR(500),
    governorate VARCHAR(20) CHECK (governorate IN ('Minya', 'Asyut', 'Sohag', 'Qena')),
    seat_class VARCHAR(1) CHECK (seat_class IN ('A', 'B', 'C')),
    payment_type VARCHAR(10) CHECK (payment_type IN ('deposit', 'full')),
    payment_amount DECIMAL(10,2) DEFAULT 0,
    remaining_amount DECIMAL(10,2) DEFAULT 0,
    status VARCHAR(20) CHECK (status IN ('interested', 'registered')),
    qr_code VARCHAR(255) UNIQUE,
    barcode VARCHAR(255) UNIQUE,
    attendance_status BOOLEAN DEFAULT FALSE,
    checked_in_at TIMESTAMP WITH TIME ZONE,
    checked_in_by UUID REFERENCES users(id),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_attendees_governorate ON attendees(governorate);
CREATE INDEX IF NOT EXISTS idx_attendees_seat_class ON attendees(seat_class);
CREATE INDEX IF NOT EXISTS idx_attendees_payment_status ON attendees(payment_type);
CREATE INDEX IF NOT EXISTS idx_attendees_attendance_status ON attendees(attendance_status);
CREATE INDEX IF NOT EXISTS idx_attendees_created_by ON attendees(created_by);
CREATE INDEX IF NOT EXISTS idx_attendees_qr_code ON attendees(qr_code);
CREATE INDEX IF NOT EXISTS idx_attendees_barcode ON attendees(barcode);

-- Enable RLS
ALTER TABLE attendees ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Data entry can view own attendees" ON attendees FOR SELECT USING (
    created_by = auth.uid() OR EXISTS (
        SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('owner', 'organizer')
    )
);

CREATE POLICY "Data entry can insert attendees" ON attendees FOR INSERT WITH CHECK (
    created_by = auth.uid() AND EXISTS (
        SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('owner', 'data_entry')
    )
);

CREATE POLICY "Data entry can update own attendees" ON attendees FOR UPDATE USING (
    created_by = auth.uid() AND EXISTS (
        SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('owner', 'data_entry')
    )
);

CREATE POLICY "Organizer can view all attendees" ON attendees FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM users WHERE id = auth.uid() AND role = 'organizer'
    )
);

CREATE POLICY "Organizer can update attendance" ON attendees FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM users WHERE id = auth.uid() AND role = 'organizer'
    )
);

CREATE POLICY "Owner has full access" ON attendees FOR ALL USING (
    EXISTS (
        SELECT 1 FROM users WHERE id = auth.uid() AND role = 'owner'
    )
);

-- Create attendance logs table
CREATE TABLE IF NOT EXISTS attendance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attendee_id UUID REFERENCES attendees(id) ON DELETE CASCADE,
    recorded_by UUID REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_attendance_logs_attendee_id ON attendance_logs(attendee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_recorded_at ON attendance_logs(recorded_at DESC);

-- Enable RLS
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "All authenticated users can view logs" ON attendance_logs FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert logs" ON attendance_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Create payment history table
CREATE TABLE IF NOT EXISTS payment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attendee_id UUID REFERENCES attendees(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL,
    payment_type VARCHAR(20) NOT NULL,
    paid_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    recorded_by UUID REFERENCES users(id)
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_payment_history_attendee_id ON payment_history(attendee_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_paid_at ON payment_history(paid_at DESC);

-- Enable RLS
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Owner and data entry can view payment history" ON payment_history FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('owner', 'data_entry')
    )
);

CREATE POLICY "Owner and data entry can insert payment history" ON payment_history FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('owner', 'data_entry')
    )
);

-- Function to generate QR code and barcode
CREATE OR REPLACE FUNCTION generate_attendee_codes()
RETURNS TRIGGER AS $$
BEGIN
    NEW.qr_code := 'QR_' || NEW.id::text || '_' || floor(random() * 10000)::text;
    NEW.barcode := 'BC_' || floor(random() * 1000000000)::text;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to generate codes before insert
DROP TRIGGER IF EXISTS trigger_generate_codes ON attendees;
CREATE TRIGGER trigger_generate_codes
    BEFORE INSERT ON attendees
    FOR EACH ROW
    EXECUTE FUNCTION generate_attendee_codes();

-- Function to calculate remaining amount
CREATE OR REPLACE FUNCTION calculate_remaining_amount()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.payment_type = 'deposit' THEN
        NEW.remaining_amount := CASE 
            WHEN NEW.seat_class = 'A' THEN 2000 - NEW.payment_amount
            WHEN NEW.seat_class = 'B' THEN 1700 - NEW.payment_amount
            WHEN NEW.seat_class = 'C' THEN 1500 - NEW.payment_amount
            ELSE 0
        END;
    ELSIF NEW.payment_type = 'full' THEN
        NEW.remaining_amount := 0;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to calculate remaining amount
DROP TRIGGER IF EXISTS trigger_calculate_remaining ON attendees;
CREATE TRIGGER trigger_calculate_remaining
    BEFORE INSERT OR UPDATE ON attendees
    FOR EACH ROW
    EXECUTE FUNCTION calculate_remaining_amount();

-- Grant basic permissions
GRANT SELECT ON users TO anon;
GRANT SELECT ON attendees TO anon;
GRANT SELECT ON attendance_logs TO anon;
GRANT SELECT ON payment_history TO anon;

-- Grant authenticated user permissions
GRANT ALL PRIVILEGES ON users TO authenticated;
GRANT ALL PRIVILEGES ON attendees TO authenticated;
GRANT ALL PRIVILEGES ON attendance_logs TO authenticated;
GRANT ALL PRIVILEGES ON payment_history TO authenticated;
