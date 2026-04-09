import fs from 'fs';

const apiPath = 'e:\\شغل\\شغل\\ص\\src\\lib\\api.ts';
let apiContent = fs.readFileSync(apiPath, 'utf-8');

apiContent = apiContent.replace(
  `        const { error: insertSeatsError } = await supabase.from('seats').insert(adjustedSeats);
        if (insertSeatsError && !isMissingTable(insertSeatsError)) throw new Error(insertSeatsError.message);`,
  `        // Chunk seats insert to avoid payload limits
        const chunkSize = 200;
        for (let i = 0; i < adjustedSeats.length; i += chunkSize) {
          const chunk = adjustedSeats.slice(i, i + chunkSize);
          const { error: insertSeatsError } = await supabase.from('seats').insert(chunk);
          if (insertSeatsError && !isMissingTable(insertSeatsError)) throw new Error(insertSeatsError.message);
        }`
);

fs.writeFileSync(apiPath, apiContent);
console.log('Chunked seats insert');
