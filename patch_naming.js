import fs from 'fs';

const apiPath = 'e:\\شغل\\شغل\\ص\\src\\lib\\api.ts';
let apiContent = fs.readFileSync(apiPath, 'utf-8');

apiContent = apiContent.replace(
  `export const generateMinyaCustomPlan = (eventId: string) => {
  const tables: any[] = [];
  const seats: any[] = [];
  const gov = 'Minya';
  
  let globalA = 1;
  let globalB = 1;
  let globalC = 1;`,
  `export const generateMinyaCustomPlan = (eventId: string) => {
  const tables: any[] = [];
  const seats: any[] = [];
  const gov = 'Minya';
  
  let globalA = 1;
  let globalB = 1;
  let globalC = 1;
  
  const getTableChar = (idx: number) => String.fromCharCode(65 + (idx % 26)) + (idx >= 26 ? Math.floor(idx/26) : '');`
);

apiContent = apiContent.replace(
  `const tableId = \`\${gov}-A-R\${row}-T\${tableOrder}\`;`,
  `const charName = getTableChar(tableOrder - 1);
        const tableId = \`\${gov}-A-R\${row}-T\${charName}\`;`
);

apiContent = apiContent.replace(
  `seat_code: \`A-R\${row}-T\${tableOrder}-S\${globalA}\`, status: 'available',`,
  `seat_code: \`A-T\${charName}-S\${globalA}\`, status: 'available',`
);

apiContent = apiContent.replace(
  `const tableId = \`\${gov}-B-R\${row}-T\${tableOrder}\`;`,
  `const charName = getTableChar(tableOrder - 1);
        const tableId = \`\${gov}-B-R\${row}-T\${charName}\`;`
);

apiContent = apiContent.replace(
  `seat_code: \`B-R\${row}-T\${tableOrder}-S\${globalB}\`, status: 'available',`,
  `seat_code: \`B-T\${charName}-S\${globalB}\`, status: 'available',`
);

apiContent = apiContent.replace(
  `id: \`\${gov}-C-R\${row}-S\${globalC}\`, event_id: eventId, governorate: gov, seat_class: 'C',
            row_number: row, side, table_id: null, seat_number: globalC,
            seat_code: \`C-R\${row}-S\${globalC}\`, status: 'available',`,
  `id: \`\${gov}-C-W\${row}-S\${globalC}\`, event_id: eventId, governorate: gov, seat_class: 'C',
            row_number: row, side, table_id: null, seat_number: globalC,
            seat_code: \`C-W\${row}-S\${globalC}\`, status: 'available',`
);

fs.writeFileSync(apiPath, apiContent);
console.log('Fixed Custom Table Chars and wave naming');
