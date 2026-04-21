-- Performance indexes for high-frequency registration and seating queries
-- Non-destructive migration: adds indexes only.

CREATE INDEX IF NOT EXISTS idx_attendees_active_gov_class_status
ON attendees(governorate, seat_class, status)
WHERE is_deleted IS NOT TRUE;

CREATE INDEX IF NOT EXISTS idx_attendees_active_phone_primary
ON attendees(phone_primary)
WHERE is_deleted IS NOT TRUE AND phone_primary IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attendees_active_full_name_lower
ON attendees((lower(full_name)))
WHERE is_deleted IS NOT TRUE;

CREATE INDEX IF NOT EXISTS idx_seats_event_class_status_number
ON seats(event_id, seat_class, status, seat_number);
