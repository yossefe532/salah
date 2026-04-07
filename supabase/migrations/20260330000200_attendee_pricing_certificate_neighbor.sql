alter table attendees add column if not exists base_ticket_price numeric;
alter table attendees add column if not exists certificate_included boolean;
alter table attendees add column if not exists preferred_neighbor_name text;

update attendees
set base_ticket_price = coalesce(ticket_price_override,
  case seat_class
    when 'A' then 2000
    when 'B' then 1700
    when 'C' then 1500
    else 0
  end
)
where base_ticket_price is null;

update attendees
set certificate_included = case
  when ticket_price_override is null then true
  else coalesce(certificate_included, false)
end
where certificate_included is null;
