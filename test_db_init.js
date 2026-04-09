import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cwftlzaibboszcrukhig.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3ZnRsemFpYmJvc3pjcnVraGlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMjIwMzIsImV4cCI6MjA4NzU5ODAzMn0.9c6K0Y-cdB0WpiAsPllvKN5Amx9VGunicWDhywAsrAc';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkInit() {
  const eventId = 'MINYA-2026-MAIN';
  const gov = 'Minya';
  const tables = [];
  const seats = [];
  
  // Class A
  const aRows = 2;
  const tablesPerSide = 3;
  const aSeatsPerTable = 10;
  let currentY = 30;
  for (let row = 1; row <= aRows; row++) {
    for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
      const side = sideIdx === 0 ? 'left' : 'right';
      for (let t = 1; t <= tablesPerSide; t++) {
        const tableOrder = sideIdx * tablesPerSide + t;
        const tableId = `\${gov}-A-R\${row}-T\${tableOrder}`;
        
        tables.push({
          id: tableId, event_id: eventId, seat_class: 'A',
          row_number: row, side, table_order: tableOrder, seats_count: aSeatsPerTable
        });
        
        for (let s = 1; s <= aSeatsPerTable; s++) {
          seats.push({
            id: `\${tableId}-S\${s}`, event_id: eventId, seat_class: 'A',
            row_number: row, side, table_id: tableId, seat_number: s,
            seat_code: `A-R\${row}-T\${tableOrder}-S\${s}`, status: 'available',
            position_x: 50, position_y: 50
          });
        }
      }
    }
  }

  console.log('Inserting', tables.length, 'tables');
  const { error: tErr } = await supabase.from('seat_tables').insert(tables);
  if (tErr) console.error('Table error:', tErr);
  else console.log('Tables inserted OK');

  console.log('Inserting', seats.length, 'seats');
  const { error: sErr } = await supabase.from('seats').insert(seats);
  if (sErr) console.error('Seat error:', sErr);
  else console.log('Seats inserted OK');
}

checkInit();