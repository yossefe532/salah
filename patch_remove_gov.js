import fs from 'fs';

const apiPath = 'e:\\شغل\\شغل\\ص\\src\\lib\\api.ts';
let apiContent = fs.readFileSync(apiPath, 'utf-8');

apiContent = apiContent.replace(
  `        const { error: insertTablesError } = await supabase.from('seat_tables').insert(adjustedTables);`,
  `        // Remove governorate from tables and seats as it causes errors if column doesn't exist
        const tablesToInsert = adjustedTables.map((t: any) => { const { governorate, ...rest } = t; return rest; });
        const { error: insertTablesError } = await supabase.from('seat_tables').insert(tablesToInsert);`
);

apiContent = apiContent.replace(
  `        const chunkSize = 200;
        for (let i = 0; i < adjustedSeats.length; i += chunkSize) {
          const chunk = adjustedSeats.slice(i, i + chunkSize);
          const { error: insertSeatsError } = await supabase.from('seats').insert(chunk);`,
  `        const chunkSize = 200;
        const seatsToInsert = adjustedSeats.map((s: any) => { const { governorate, ...rest } = s; return rest; });
        for (let i = 0; i < seatsToInsert.length; i += chunkSize) {
          const chunk = seatsToInsert.slice(i, i + chunkSize);
          const { error: insertSeatsError } = await supabase.from('seats').insert(chunk);`
);

fs.writeFileSync(apiPath, apiContent);
console.log('Removed governorate before inserting');
