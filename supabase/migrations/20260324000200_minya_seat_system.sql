ALTER TABLE attendees
ADD COLUMN IF NOT EXISTS seat_number INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'attendees_minya_seat_number_check'
  ) THEN
    ALTER TABLE attendees
    ADD CONSTRAINT attendees_minya_seat_number_check
    CHECK (
      governorate <> 'Minya'
      OR seat_number IS NULL
      OR (
        (seat_class = 'A' AND seat_number BETWEEN 1 AND 288)
        OR (seat_class = 'B' AND seat_number BETWEEN 1 AND 430)
        OR (seat_class = 'C' AND seat_number BETWEEN 1 AND 80)
      )
    );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_minya_seat_per_class
ON attendees(governorate, seat_class, seat_number)
WHERE governorate = 'Minya' AND seat_number IS NOT NULL AND is_deleted = false;
