ALTER TABLE attendees
ADD COLUMN IF NOT EXISTS sales_channel TEXT DEFAULT 'direct',
ADD COLUMN IF NOT EXISTS sales_source_name TEXT,
ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS commission_notes TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendees_sales_channel_check'
  ) THEN
    ALTER TABLE attendees
    ADD CONSTRAINT attendees_sales_channel_check
    CHECK (sales_channel IN ('direct', 'sales_team', 'external_partner', 'sponsor_referral'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_attendees_sales_channel ON attendees(sales_channel);
CREATE INDEX IF NOT EXISTS idx_attendees_sales_source_name ON attendees(sales_source_name);

CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendee_id UUID REFERENCES attendees(id),
  attendee_name TEXT,
  action_type TEXT NOT NULL,
  details TEXT,
  amount_change DECIMAL(10,2) DEFAULT 0,
  performed_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_attendee_id ON activity_logs(attendee_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES expense_categories(id),
  title TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL CHECK (amount >= 0),
  expense_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id);

CREATE TABLE IF NOT EXISTS sponsors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sponsor_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_id UUID NOT NULL REFERENCES sponsors(id),
  contract_title TEXT NOT NULL,
  contract_amount DECIMAL(12,2) NOT NULL CHECK (contract_amount >= 0),
  paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  signed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  due_date TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sponsor_contracts_sponsor_id ON sponsor_contracts(sponsor_id);
CREATE INDEX IF NOT EXISTS idx_sponsor_contracts_due_date ON sponsor_contracts(due_date);

CREATE TABLE IF NOT EXISTS sponsor_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_contract_id UUID NOT NULL REFERENCES sponsor_contracts(id),
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  paid_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  recorded_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sponsor_payments_contract_id ON sponsor_payments(sponsor_contract_id);
CREATE INDEX IF NOT EXISTS idx_sponsor_payments_paid_at ON sponsor_payments(paid_at DESC);

INSERT INTO expense_categories (name)
VALUES ('تسويق'), ('تشغيل'), ('قاعة وتجهيزات'), ('ضيافة'), ('تنقلات')
ON CONFLICT (name) DO NOTHING;
