import fs from 'fs';

const fileContent = fs.readFileSync('e:\\شغل\\شغل\\ص\\src\\lib\\api.ts', 'utf-8');

let updated = fileContent.replace(
  `if (endpoint === '/seating/update-layout') {
      const eventId = body?.event_id || DEFAULT_EVENT_ID;
      const updates = Array.isArray(body?.updates) ? body.updates : [];
      if (!updates.length) return { success: true, updated: 0 };

      for (const item of updates) {
        const { data: currentSeat, error: seatErr } = await supabase
          .from('seats')
          .select('id, seat_class, row_number, side, table_id, seat_number')
          .eq('event_id', eventId)
          .eq('id', item.id)
          .single();
        if (seatErr || !currentSeat) continue;
        const nextRow = Number(item.row_number ?? currentSeat.row_number);
        const nextSide = item.side ?? currentSeat.side;
        const nextTableId = item.table_id ?? currentSeat.table_id;
        const tableOrder = getTableOrderFromTableId(nextTableId);
        const nextCode = buildSeatCode(
          currentSeat.seat_class as 'A' | 'B' | 'C',
          nextRow,
          nextSide as 'left' | 'right',
          tableOrder,
          Number(item.seat_number ?? currentSeat.seat_number)
        );
        await supabase
          .from('seats')
          .update({
            position_x: item.position_x,
            position_y: item.position_y,
            row_number: nextRow,
            side: nextSide,
            table_id: nextTableId,
            seat_code: nextCode
          })
          .eq('id', item.id);
      }
      return { success: true, updated: updates.length };
    }`,
  `if (endpoint === '/seating/update-layout') {
      const eventId = body?.event_id || DEFAULT_EVENT_ID;
      const updates = Array.isArray(body?.updates) ? body.updates : [];
      if (!updates.length) return { success: true, updated: 0 };

      for (const item of updates) {
        if (item.type === 'table') {
          await supabase.from('seat_tables').update({
            position_x: item.position_x,
            position_y: item.position_y,
            width: item.width,
            height: item.height,
            max_seats: item.max_seats
          }).eq('id', item.id);
        } else if (item.type === 'layout_element') {
          await supabase.from('layout_elements').update({
            position_x: item.position_x,
            position_y: item.position_y,
            width: item.width,
            height: item.height
          }).eq('id', item.id);
        } else {
          const { data: currentSeat, error: seatErr } = await supabase
            .from('seats')
            .select('id, seat_class, row_number, side, table_id, seat_number')
            .eq('event_id', eventId)
            .eq('id', item.id)
            .single();
          if (seatErr || !currentSeat) continue;
          const nextRow = Number(item.row_number ?? currentSeat.row_number);
          const nextSide = item.side ?? currentSeat.side;
          const nextTableId = item.table_id ?? currentSeat.table_id;
          const tableOrder = getTableOrderFromTableId(nextTableId);
          const nextCode = buildSeatCode(
            currentSeat.seat_class as 'A' | 'B' | 'C',
            nextRow,
            nextSide as 'left' | 'right',
            tableOrder,
            Number(item.seat_number ?? currentSeat.seat_number)
          );
          await supabase
            .from('seats')
            .update({
              position_x: item.position_x,
              position_y: item.position_y,
              row_number: nextRow,
              side: nextSide,
              table_id: nextTableId,
              seat_code: nextCode
            })
            .eq('id', item.id);
        }
      }
      return { success: true, updated: updates.length };
    }`
);

fs.writeFileSync('e:\\شغل\\شغل\\ص\\src\\lib\\api.ts', updated);
console.log('Successfully patched api.ts');
