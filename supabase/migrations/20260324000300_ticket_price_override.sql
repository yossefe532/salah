ALTER TABLE attendees
ADD COLUMN IF NOT EXISTS ticket_price_override NUMERIC(12,2);

-- No destructive changes; owners can set override from UI; DB checks applied at app layer
