create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  owner_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table users add column if not exists company_id uuid references companies(id) on delete set null;
create index if not exists idx_users_company_id on users(company_id);

alter table attendees add column if not exists company_id uuid references companies(id) on delete set null;
create index if not exists idx_attendees_company_id on attendees(company_id);

alter table activity_logs add column if not exists company_id uuid references companies(id) on delete set null;
create index if not exists idx_activity_logs_company_id on activity_logs(company_id);

alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check
check (role in ('owner','data_entry','organizer','social_media','sales','company_admin','company_employee'));
