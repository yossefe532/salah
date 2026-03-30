ALTER TABLE attendees
ADD COLUMN IF NOT EXISTS occupation_type TEXT DEFAULT 'employee',
ADD COLUMN IF NOT EXISTS organization_name TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'attendees_occupation_type_check'
  ) THEN
    ALTER TABLE attendees
    ADD CONSTRAINT attendees_occupation_type_check
    CHECK (occupation_type IN ('student', 'employee', 'business_owner', 'executive'));
  END IF;
END $$;

UPDATE attendees
SET occupation_type = COALESCE(occupation_type, CASE
  WHEN university IS NOT NULL OR faculty IS NOT NULL OR year IS NOT NULL THEN 'student'
  ELSE 'employee'
END);

CREATE INDEX IF NOT EXISTS idx_attendees_occupation_type ON attendees(occupation_type);
