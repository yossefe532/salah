-- Migration to add robust layout engine columns

-- 1. Add coordinates and dimensions to seat_tables
ALTER TABLE seat_tables ADD COLUMN IF NOT EXISTS position_x NUMERIC(10,2) DEFAULT 0;
ALTER TABLE seat_tables ADD COLUMN IF NOT EXISTS position_y NUMERIC(10,2) DEFAULT 0;
ALTER TABLE seat_tables ADD COLUMN IF NOT EXISTS width NUMERIC(10,2) DEFAULT 120;
ALTER TABLE seat_tables ADD COLUMN IF NOT EXISTS height NUMERIC(10,2) DEFAULT 60;
ALTER TABLE seat_tables ADD COLUMN IF NOT EXISTS max_seats INTEGER DEFAULT 12;

-- 2. Add layout elements table for stage, blocked, and allowed areas
CREATE TABLE IF NOT EXISTS layout_elements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL,
    governorate TEXT DEFAULT 'Minya',
    element_type TEXT NOT NULL CHECK (element_type IN ('stage', 'blocked', 'allowed')),
    position_x NUMERIC(10,2) DEFAULT 0,
    position_y NUMERIC(10,2) DEFAULT 0,
    width NUMERIC(10,2) DEFAULT 100,
    height NUMERIC(10,2) DEFAULT 100,
    label TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_layout_elements_event ON layout_elements(event_id);

-- 3. Add wave support to seats for Class C
ALTER TABLE seats ADD COLUMN IF NOT EXISTS wave_number INTEGER;
-- And add relative position to table for Fixed Chairs
ALTER TABLE seats ADD COLUMN IF NOT EXISTS relative_x NUMERIC(10,2);
ALTER TABLE seats ADD COLUMN IF NOT EXISTS relative_y NUMERIC(10,2);

-- 4. Enable RLS for layout_elements
ALTER TABLE layout_elements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can view layout_elements" ON layout_elements FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Organizers and owners can manage layout_elements" ON layout_elements FOR ALL USING (
    EXISTS (
        SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('owner', 'organizer')
    )
);
