import fs from 'fs';

const apiPath = 'e:\\شغل\\شغل\\ص\\src\\lib\\api.ts';
let apiContent = fs.readFileSync(apiPath, 'utf-8');

// Ah, wait! "-0.25" is probably relative_x or relative_y if they were calculated?
// No, the error says "invalid input syntax for type integer: -0.25". 
// Which column is of type INTEGER but received -0.25?
// Let's check seats table schema:
// row_number INTEGER
// seat_number INTEGER
// wave_number INTEGER

// Ah! `localCol - (aSeatsPerTable/4 - 0.5)` might be passed to seat_number? No, seat_number gets `globalA`.
// Maybe row_number? No, `row_number: row` which is 1 or 2.
// Let's look closely at `generateMinyaCustomPlan`
// Wait, `wave_number: row` for Class C? Yes, row is 1..11 integer.
// Where could -0.25 come from?
// Is there another place?
// Let's check `generateHallPlan` just in case. But the error happened for Minya, which uses `generateMinyaCustomPlan`.
// Wait, does `tablesToInsert` or `seatsToInsert` have an integer field receiving a float?
// `table_order: tableOrder` -> integer
// `seats_count: aSeatsPerTable` -> integer
// `seat_number: globalA` -> integer

// What if the error is actually from `relative_x` or `relative_y` or `position_x` being cast to integer somewhere in DB? No, position_x is NUMERIC(10,2).
// Wait, `generateMinyaCustomPlan` returns tables and seats.
// Let's check `api.ts` near line 360-400 where `adjustedSeats` is generated.
// Wait! `adjustedSeats` maps over the generated seats and calculates `relative_x` and `relative_y`:
// `relative_x: s.position_x - table.position_x`
// `relative_y: s.position_y - table.position_y`
// Are relative_x and relative_y defined as NUMERIC? Yes, in my migration they are NUMERIC(10,2).
// BUT wait, what if the original schema had them as INTEGER?
// Or maybe `row_number` gets `-0.25` somehow?

apiContent = apiContent.replace(
  `const { data: maxSeats } = await supabase.from('seats').select('row_number, seat_code').eq('event_id', eventId).eq('seat_class', cls).order('row_number', { ascending: false }).limit(1);`,
  `const { data: maxSeats } = await supabase.from('seats').select('row_number, seat_code').eq('event_id', eventId).eq('seat_class', cls).order('row_number', { ascending: false }).limit(1);`
);

// Let's print out the schema of the `seats` table from the DB just to be absolutely sure.
