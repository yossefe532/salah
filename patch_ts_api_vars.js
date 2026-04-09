import fs from 'fs';

const apiPath = 'e:\\شغل\\شغل\\ص\\src\\lib\\api.ts';
let apiContent = fs.readFileSync(apiPath, 'utf-8');

apiContent = apiContent.replace(
  `} else if (type === 'seat') {
        const { data: maxSeats } = await supabase.from('seats').select('row_number, seat_code').eq('event_id', eventId).eq('seat_class', cls).order('row_number', { ascending: false }).limit(1);
        const nextRow = (maxSeats?.[0]?.row_number || 0) + 1;
        const num = uniqueSuffix % 1000;
        await supabase.from('seats').insert([{
            id: \`\${gov}-\${cls}-S\${uniqueSuffix}\`,
            event_id: eventId,
            governorate: gov,
            seat_class: cls,
            row_number: nextRow,
            side: 'left',
            seat_number: num,
            seat_code: \`\${cls}-Extra-S\${num}\`,
            status: 'available',
            position_x: offsetX,
            position_y: offsetY
        }]);
      } else if (type === 'wave') {`,
  `} else if (type === 'seat') {
        const gov = body?.governorate || 'Minya';
        const cls = body?.seat_class || 'A';
        const offsetX = 40 + Math.floor(Math.random() * 20);
        const offsetY = 40 + Math.floor(Math.random() * 20);
        const uniqueSuffix = Math.floor(Math.random() * 1000000);
        
        const { data: maxSeats } = await supabase.from('seats').select('row_number, seat_code').eq('event_id', eventId).eq('seat_class', cls).order('row_number', { ascending: false }).limit(1);
        const nextRow = (maxSeats?.[0]?.row_number || 0) + 1;
        const num = uniqueSuffix % 1000;
        await supabase.from('seats').insert([{
            id: \`\${gov}-\${cls}-S\${uniqueSuffix}\`,
            event_id: eventId,
            governorate: gov,
            seat_class: cls,
            row_number: nextRow,
            side: 'left',
            seat_number: num,
            seat_code: \`\${cls}-Extra-S\${num}\`,
            status: 'available',
            position_x: offsetX,
            position_y: offsetY
        }]);
      } else if (type === 'wave') {`
);

fs.writeFileSync(apiPath, apiContent);
console.log('Fixed API TypeScript scope variables');
