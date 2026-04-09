import fs from 'fs';

const apiPath = 'e:\\شغل\\شغل\\ص\\src\\lib\\api.ts';
let apiContent = fs.readFileSync(apiPath, 'utf-8');

// 1. Remove layout_elements from /seating/map
apiContent = apiContent.replace(
  `const [
          { data: tables, error: tablesError },
          { data: seats, error: seatsError },
          { data: layoutElements, error: layoutError }
        ] = await Promise.all([
          supabase.from('seat_tables').select('*').eq('event_id', eventId).order('row_number', { ascending: true }),
          supabase.from('seats').select('*').eq('event_id', eventId).order('row_number', { ascending: true }),
          supabase.from('layout_elements').select('*').eq('event_id', eventId)
        ]);

        if (tablesError && !isMissingTable(tablesError)) throw new Error(tablesError.message);
        if (seatsError && !isMissingTable(seatsError)) throw new Error(seatsError.message);
        
        return { 
          event_id: eventId, 
          tables: tables || [], 
          seats: seats || [],
          layout_elements: layoutElements || [] 
        };`,
  `const [{ data: tables, error: tablesError }, { data: seats, error: seatsError }] = await Promise.all([
          supabase.from('seat_tables').select('*').eq('event_id', eventId).order('row_number', { ascending: true }),
          supabase.from('seats').select('*').eq('event_id', eventId).order('row_number', { ascending: true })
        ]);

        if (tablesError && !isMissingTable(tablesError)) throw new Error(tablesError.message);
        if (seatsError && !isMissingTable(seatsError)) throw new Error(seatsError.message);
        
        return { 
          event_id: eventId, 
          tables: tables || [], 
          seats: seats || []
        };`
);

// 2. Fix /seating/update-layout
apiContent = apiContent.replace(
  `if (item.type === 'table') {
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
        } else {`,
  `if (item.type === 'table' || item.type === 'layout_element') {
          // Do nothing for now, we will move seats instead
        } else {`
);

// 3. Fix /seating/add-element
apiContent = apiContent.replace(
  `if (['stage', 'blocked', 'allowed'].includes(type)) {
        const { error } = await supabase.from('layout_elements').insert([{
          event_id: eventId,
          governorate: gov,
          element_type: type,
          position_x: offsetX,
          position_y: offsetY,
          width: 20,
          height: 10,
          label: type.toUpperCase()
        }]);
        if (error) throw new Error("قاعدة البيانات لم يتم تحديثها. يجب تشغيل السكربت SQL في Supabase أولاً.");
      } else if (type === 'table') {
        const tableId = \`\${gov}-\${cls}-T\${uniqueSuffix}\`;
        
        // Get max row and order to generate a somewhat logical code
        const { data: maxSeats } = await supabase.from('seats').select('row_number, seat_code').eq('event_id', eventId).eq('seat_class', cls).order('row_number', { ascending: false }).limit(1);
        const nextRow = (maxSeats?.[0]?.row_number || 0) + 1;
        const tableOrder = uniqueSuffix % 1000;
        
        const { error: tableErr } = await supabase.from('seat_tables').insert([{
          id: tableId,
          event_id: eventId,
          governorate: gov,
          seat_class: cls,
          row_number: nextRow,
          side: 'left',
          table_order: tableOrder,
          seats_count: 12,
          position_x: offsetX,
          position_y: offsetY,
          width: 10,
          height: 8
        }]);
        if (tableErr) throw new Error("قاعدة البيانات لم يتم تحديثها. يجب تشغيل السكربت SQL في Supabase أولاً.");
        
        const seats = [];
        for(let i = 1; i <= 12; i++) {
          const localRow = Math.floor((i - 1) / 4);
          const localCol = (i - 1) % 4;
          const seatX = offsetX + (localCol - 1.5) * 2.2;
          const seatY = offsetY + (localRow - 1) * 2.2;
          seats.push({
            id: \`\${tableId}-S\${i}\`,
            event_id: eventId,
            governorate: gov,
            seat_class: cls,
            row_number: nextRow,
            side: 'left',
            table_id: tableId,
            seat_number: i,
            seat_code: buildSeatCode(cls, nextRow, 'left', tableOrder, i),
            status: 'available',
            position_x: seatX,
            position_y: seatY
          });
        }
        const { error: seatsErr } = await supabase.from('seats').insert(seats);
        if (seatsErr) throw new Error("قاعدة البيانات لم يتم تحديثها. يجب تشغيل السكربت SQL في Supabase أولاً.");
      } else if (type === 'wave') {`,
  `if (['stage', 'blocked', 'allowed'].includes(type)) {
        // Skip layout elements for now
      } else if (type === 'table') {
        const tableId = \`\${gov}-\${cls}-T\${uniqueSuffix}\`;
        
        const { data: maxSeats } = await supabase.from('seats').select('row_number, seat_code').eq('event_id', eventId).eq('seat_class', cls).order('row_number', { ascending: false }).limit(1);
        const nextRow = (maxSeats?.[0]?.row_number || 0) + 1;
        const tableOrder = uniqueSuffix % 1000;
        
        await supabase.from('seat_tables').insert([{
          id: tableId,
          event_id: eventId,
          governorate: gov,
          seat_class: cls,
          row_number: nextRow,
          side: 'left',
          table_order: tableOrder,
          seats_count: 12
        }]);
        
        const seats = [];
        for(let i = 1; i <= 12; i++) {
          const localRow = Math.floor((i - 1) / 4);
          const localCol = (i - 1) % 4;
          const seatX = offsetX + (localCol - 1.5) * 2.2;
          const seatY = offsetY + (localRow - 1) * 2.2;
          seats.push({
            id: \`\${tableId}-S\${i}\`,
            event_id: eventId,
            governorate: gov,
            seat_class: cls,
            row_number: nextRow,
            side: 'left',
            table_id: tableId,
            seat_number: i,
            seat_code: buildSeatCode(cls, nextRow, 'left', tableOrder, i),
            status: 'available',
            position_x: seatX,
            position_y: seatY
          });
        }
        await supabase.from('seats').insert(seats);
      } else if (type === 'wave') {`
);

// 4. Remove delete-element references to layout_elements
apiContent = apiContent.replace(
  `} else if (type === 'element') {
        await supabase.from('layout_elements').delete().eq('id', id);
      } else if (type === 'wave') {
         await supabase.from('seats').delete().eq('wave_number', id).eq('event_id', eventId);
      }`,
  `} else if (type === 'element') {
        // do nothing
      } else if (type === 'wave') {
         // wave uses row_number for C
         await supabase.from('seats').delete().eq('row_number', id).eq('seat_class', 'C').eq('event_id', eventId);
      }`
);

// 5. Update wave addition to use row_number instead of wave_number
apiContent = apiContent.replace(
  `position_y: offsetY,
            wave_number: waveNo
          });`,
  `position_y: offsetY
          });`
);

// 6. Provide the Minya custom layout generator
apiContent = apiContent.replace(
  `export const generateExactHallPlan = (eventId: string, governorate: string, counts: {A: number, B: number, C: number}) => {`,
  `export const generateMinyaCustomPlan = (eventId: string) => {
  const tables: any[] = [];
  const seats: any[] = [];
  const gov = 'Minya';
  
  // Class A: 2 rows. Right: 3 tables, Left: 3 tables. Each table = 10 chairs.
  const aRows = 2;
  const tablesPerSide = 3;
  const aSeatsPerTable = 10;
  
  // Class B: 2 rows. Right: 3 tables, Left: 3 tables. Each table = 12 chairs.
  const bRows = 2;
  const bSeatsPerTable = 12;
  
  // Class C: 11 waves (rows). 20 left, 20 right.
  const cRows = 11;
  const cSeatsPerSide = 20;
  
  const leftTableCenters = [20, 35, 50];
  const rightTableCenters = [70, 85, 100];
  const tableSeatDx = 2.5;
  const tableSeatDy = 2.5;
  
  let currentY = 30;
  
  // Generate A
  for (let row = 1; row <= aRows; row++) {
    for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
      const side = sideIdx === 0 ? 'left' : 'right';
      for (let t = 1; t <= tablesPerSide; t++) {
        const tableOrder = sideIdx * tablesPerSide + t;
        const tableId = \`\${gov}-A-R\${row}-T\${tableOrder}\`;
        const xCenter = side === 'left' ? leftTableCenters[t-1] : rightTableCenters[t-1];
        
        tables.push({
          id: tableId, event_id: eventId, governorate: gov, seat_class: 'A',
          row_number: row, side, table_order: tableOrder, seats_count: aSeatsPerTable
        });
        
        for (let s = 1; s <= aSeatsPerTable; s++) {
          const localRow = Math.floor((s - 1) / (aSeatsPerTable / 2));
          const localCol = (s - 1) % (aSeatsPerTable / 2);
          seats.push({
            id: \`\${tableId}-S\${s}\`, event_id: eventId, governorate: gov, seat_class: 'A',
            row_number: row, side, table_id: tableId, seat_number: s,
            seat_code: \`A-R\${row}-T\${tableOrder}-S\${s}\`, status: 'available',
            position_x: xCenter + (localCol - (aSeatsPerTable/4 - 0.5)) * tableSeatDx,
            position_y: currentY + (localRow - 0.5) * tableSeatDy
          });
        }
      }
    }
    currentY += 15;
  }
  
  currentY += 10;
  // Generate B
  for (let row = 1; row <= bRows; row++) {
    for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
      const side = sideIdx === 0 ? 'left' : 'right';
      for (let t = 1; t <= tablesPerSide; t++) {
        const tableOrder = sideIdx * tablesPerSide + t;
        const tableId = \`\${gov}-B-R\${row}-T\${tableOrder}\`;
        const xCenter = side === 'left' ? leftTableCenters[t-1] : rightTableCenters[t-1];
        
        tables.push({
          id: tableId, event_id: eventId, governorate: gov, seat_class: 'B',
          row_number: row, side, table_order: tableOrder, seats_count: bSeatsPerTable
        });
        
        for (let s = 1; s <= bSeatsPerTable; s++) {
          const localRow = Math.floor((s - 1) / (bSeatsPerTable / 2));
          const localCol = (s - 1) % (bSeatsPerTable / 2);
          seats.push({
            id: \`\${tableId}-S\${s}\`, event_id: eventId, governorate: gov, seat_class: 'B',
            row_number: row, side, table_id: tableId, seat_number: s,
            seat_code: \`B-R\${row}-T\${tableOrder}-S\${s}\`, status: 'available',
            position_x: xCenter + (localCol - (bSeatsPerTable/4 - 0.5)) * tableSeatDx,
            position_y: currentY + (localRow - 0.5) * tableSeatDy
          });
        }
      }
    }
    currentY += 15;
  }
  
  currentY += 20;
  // Generate C
  for (let row = 1; row <= cRows; row++) {
    for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
      const side = sideIdx === 0 ? 'left' : 'right';
      const startX = side === 'left' ? 5 : 65;
      for (let s = 1; s <= cSeatsPerSide; s++) {
        const seatNum = sideIdx * cSeatsPerSide + s;
        seats.push({
            id: \`\${gov}-C-R\${row}-S\${seatNum}\`, event_id: eventId, governorate: gov, seat_class: 'C',
            row_number: row, side, table_id: null, seat_number: seatNum,
            seat_code: \`C-R\${row}-S\${seatNum}\`, status: 'available',
            position_x: startX + (s * 2.5),
            position_y: currentY
        });
      }
    }
    currentY += 8;
  }
  
  return { tables, seats };
};

export const generateExactHallPlan = (eventId: string, governorate: string, counts: {A: number, B: number, C: number}) => {`
);

apiContent = apiContent.replace(
  `const { tables, seats } = generateHallPlan(eventId, body?.governorate || 'Minya');`,
  `const { tables, seats } = body?.governorate === 'Minya' ? generateMinyaCustomPlan(eventId) : generateHallPlan(eventId, body?.governorate || 'Minya');`
);

fs.writeFileSync(apiPath, apiContent);
console.log('Reverted DB dependencies and added custom Minya plan');
