ALTER TABLE users
ADD COLUMN IF NOT EXISTS commission_balance DECIMAL(12,2) DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_role_check'
  ) THEN
    ALTER TABLE users DROP CONSTRAINT users_role_check;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_role_check'
  ) THEN
    ALTER TABLE users
    ADD CONSTRAINT users_role_check
    CHECK (role IN ('owner', 'organizer', 'data_entry', 'social_media', 'sales'));
  END IF;
END $$;

ALTER TABLE attendees
ADD COLUMN IF NOT EXISTS lead_status TEXT DEFAULT 'registered',
ADD COLUMN IF NOT EXISTS social_media_user_id UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS sales_user_id UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS social_commission_amount DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS sales_commission_amount DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS commission_distributed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS sales_verified_full_name BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS sales_verified_phone BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS sales_verified_photo BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS sales_verified_job BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS profile_photo_url TEXT,
ADD COLUMN IF NOT EXISTS job_title TEXT,
ADD COLUMN IF NOT EXISTS sales_verified_at TIMESTAMP WITH TIME ZONE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'attendees_lead_status_check'
  ) THEN
    ALTER TABLE attendees
    ADD CONSTRAINT attendees_lead_status_check
    CHECK (lead_status IN ('under_review', 'sales_completed', 'registered'));
  END IF;
END $$;

UPDATE attendees
SET lead_status = 'registered'
WHERE lead_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_attendees_lead_status ON attendees(lead_status);
CREATE INDEX IF NOT EXISTS idx_attendees_social_media_user_id ON attendees(social_media_user_id);
CREATE INDEX IF NOT EXISTS idx_attendees_sales_user_id ON attendees(sales_user_id);

CREATE TABLE IF NOT EXISTS commission_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendee_id UUID NOT NULL REFERENCES attendees(id),
  social_media_user_id UUID REFERENCES users(id),
  sales_user_id UUID REFERENCES users(id),
  total_commission DECIMAL(10,2) NOT NULL DEFAULT 100,
  social_amount DECIMAL(10,2) NOT NULL DEFAULT 50,
  sales_amount DECIMAL(10,2) NOT NULL DEFAULT 50,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_commission_transactions_attendee_id ON commission_transactions(attendee_id);
