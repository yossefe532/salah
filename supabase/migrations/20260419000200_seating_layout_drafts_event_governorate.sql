-- Upgrade seating_layout_drafts to support per event + governorate drafts
ALTER TABLE IF EXISTS seating_layout_drafts
    ADD COLUMN IF NOT EXISTS governorate TEXT;

UPDATE seating_layout_drafts
SET governorate = 'Minya'
WHERE governorate IS NULL OR btrim(governorate) = '';

ALTER TABLE IF EXISTS seating_layout_drafts
    ALTER COLUMN governorate SET DEFAULT 'Minya';

ALTER TABLE IF EXISTS seating_layout_drafts
    ALTER COLUMN governorate SET NOT NULL;

ALTER TABLE IF EXISTS seating_layout_drafts
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE IF EXISTS seating_layout_drafts
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE IF EXISTS seating_layout_drafts
    ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'seating_layout_drafts_pkey'
  ) THEN
    ALTER TABLE seating_layout_drafts DROP CONSTRAINT seating_layout_drafts_pkey;
  END IF;
END $$;

ALTER TABLE IF EXISTS seating_layout_drafts
    ADD PRIMARY KEY (event_id, governorate);

CREATE INDEX IF NOT EXISTS idx_seating_layout_drafts_event_governorate
    ON seating_layout_drafts(event_id, governorate);

CREATE INDEX IF NOT EXISTS idx_seating_layout_drafts_updated_at
    ON seating_layout_drafts(updated_at DESC);

CREATE OR REPLACE FUNCTION set_seating_layout_drafts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_seating_layout_drafts_updated_at ON seating_layout_drafts;
CREATE TRIGGER trg_set_seating_layout_drafts_updated_at
BEFORE UPDATE ON seating_layout_drafts
FOR EACH ROW
EXECUTE FUNCTION set_seating_layout_drafts_updated_at();
