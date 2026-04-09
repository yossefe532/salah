import fs from 'fs';

const content = fs.readFileSync('e:\\شغل\\شغل\\ص\\src\\lib\\api.ts', 'utf-8');

let updated = content.replace(
  `if (endpoint === '/seating/init') {`,
  `if (endpoint === '/seating/add-element') {
      const eventId = body?.event_id || DEFAULT_EVENT_ID;
      const type = body?.type;
      const cls = body?.seat_class;
      const gov = body?.governorate || 'Minya';
      
      if (['stage', 'blocked', 'allowed'].includes(type)) {
        await supabase.from('layout_elements').insert([{
          event_id: eventId,
          governorate: gov,
          element_type: type,
          position_x: 50,
          position_y: 50,
          width: 20,
          height: 10,
          label: type.toUpperCase()
        }]);
      } else if (type === 'table') {
        const tableId = \`\${gov}-\${cls}-T\${Date.now()}\`;
        await supabase.from('seat_tables').insert([{
          id: tableId,
          event_id: eventId,
          governorate: gov,
          seat_class: cls,
          row_number: 1,
          side: 'left',
          table_order: 1,
          seats_count: 12,
          position_x: 50,
          position_y: 50,
          width: 10,
          height: 8
        }]);
        
        const seats = [];
        for(let i = 1; i <= 12; i++) {
          const localRow = Math.floor((i - 1) / 4);
          const localCol = (i - 1) % 4;
          const seatX = 50 + (localCol - 1.5) * 2.2;
          const seatY = 50 + (localRow - 1) * 2.2;
          seats.push({
            id: \`\${tableId}-S\${i}\`,
            event_id: eventId,
            governorate: gov,
            seat_class: cls,
            row_number: 1,
            side: 'left',
            table_id: tableId,
            seat_number: i,
            seat_code: buildSeatCode(cls, 1, 'left', 1, i),
            status: 'available',
            position_x: seatX,
            position_y: seatY
          });
        }
        await supabase.from('seats').insert(seats);
      } else if (type === 'wave') {
        const waveNo = Math.floor(Date.now() / 1000);
        const seats = [];
        for(let i = 1; i <= 8; i++) {
          seats.push({
            id: \`\${gov}-C-W\${waveNo}-S\${i}\`,
            event_id: eventId,
            governorate: gov,
            seat_class: 'C',
            row_number: 1,
            side: 'left',
            seat_number: i,
            seat_code: buildSeatCode('C', 1, 'left', null, i),
            status: 'available',
            position_x: 50 + (i * 3),
            position_y: 50,
            wave_number: waveNo
          });
        }
        await supabase.from('seats').insert(seats);
      }
      return { success: true };
    }
    
    if (endpoint === '/seating/init') {`
);

fs.writeFileSync('e:\\شغل\\شغل\\ص\\src\\lib\\api.ts', updated);
console.log('Added add-element API logic');
