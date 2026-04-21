CREATE TABLE IF NOT EXISTS seating_layout_drafts (
  event_id TEXT PRIMARY KEY,
  draft JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by UUID REFERENCES users(id)
);

ALTER TABLE seating_layout_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "All authenticated users can view seating_layout_drafts" ON seating_layout_drafts;
CREATE POLICY "All authenticated users can view seating_layout_drafts"
ON seating_layout_drafts
FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "All authenticated users can manage seating_layout_drafts" ON seating_layout_drafts;
CREATE POLICY "All authenticated users can manage seating_layout_drafts"
ON seating_layout_drafts
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);
