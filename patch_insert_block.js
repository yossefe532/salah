import fs from 'fs';

const apiPath = 'e:\\شغل\\شغل\\ص\\src\\lib\\api.ts';
let apiContent = fs.readFileSync(apiPath, 'utf-8');

apiContent = apiContent.replace(
  /const \{ error: insertTablesError \} = await supabase\.from\('seat_tables'\)\.insert\(adjustedTables\);\s+if \(insertTablesError[^\}]+\} throw new Error\(insertTablesError\.message\); \}\s+const \{ error: insertSeatsError \} = await supabase\.from\('seats'\)\.insert\(adjustedSeats\);\s+if \(insertSeatsError[^\}]+\} throw new Error\(insertSeatsError\.message\); \}/m,
  `// Remove governorate to avoid schema errors, as some tables might not have it yet depending on DB state
        const tablesToInsert = adjustedTables.map((t: any) => { const { governorate, ...rest } = t; return rest; });
        const { error: insertTablesError } = await supabase.from('seat_tables').insert(tablesToInsert);
        if (insertTablesError && !isMissingTable(insertTablesError)) { 
           console.error('Tables Insert Error:', insertTablesError); 
           throw new Error(insertTablesError.message); 
        }

        const seatsToInsert = adjustedSeats.map((s: any) => { const { governorate, ...rest } = s; return rest; });
        const chunkSize = 150;
        for (let i = 0; i < seatsToInsert.length; i += chunkSize) {
          const chunk = seatsToInsert.slice(i, i + chunkSize);
          const { error: insertSeatsError } = await supabase.from('seats').insert(chunk);
          if (insertSeatsError && !isMissingTable(insertSeatsError)) { 
             console.error('Seats Insert Error:', insertSeatsError); 
             throw new Error(insertSeatsError.message); 
          }
        }`
);

fs.writeFileSync(apiPath, apiContent);
console.log('Fixed insert block');
