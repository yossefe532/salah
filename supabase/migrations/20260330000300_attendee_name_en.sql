alter table attendees add column if not exists full_name_en text;

update attendees
set full_name_en = full_name
where (full_name_en is null or trim(full_name_en) = '')
  and full_name is not null;
