import fs from 'fs';

const apiPath = 'e:\\شغل\\شغل\\ص\\src\\lib\\api.ts';
let apiContent = fs.readFileSync(apiPath, 'utf-8');

apiContent = apiContent.replace(
  `if (insertSeatsError && !isMissingTable(insertSeatsError)) throw new Error(insertSeatsError.message);`,
  `if (insertSeatsError && !isMissingTable(insertSeatsError)) { console.error('Seats Insert Error:', insertSeatsError); throw new Error(insertSeatsError.message); }`
);

apiContent = apiContent.replace(
  `if (insertTablesError && !isMissingTable(insertTablesError)) throw new Error(insertTablesError.message);`,
  `if (insertTablesError && !isMissingTable(insertTablesError)) { console.error('Tables Insert Error:', insertTablesError); throw new Error(insertTablesError.message); }`
);

fs.writeFileSync(apiPath, apiContent);
console.log('Added console logs for errors');
