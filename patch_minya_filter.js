import fs from 'fs';

const apiPath = 'e:\\شغل\\شغل\\ص\\src\\lib\\api.ts';
let apiContent = fs.readFileSync(apiPath, 'utf-8');

apiContent = apiContent.replace(
  `const adjustedTables = tables.map((t: any) => {`,
  `const isMinyaCustom = body?.governorate === 'Minya';
        const adjustedTables = isMinyaCustom ? tables : tables.map((t: any) => {`
);

apiContent = apiContent.replace(
  `const validTableIds = new Set(adjustedTables.map((t: any) => t.id));
        const adjustedSeats = seats.filter((s: any) => {`,
  `const validTableIds = new Set(adjustedTables.map((t: any) => t.id));
        const adjustedSeats = isMinyaCustom ? seats : seats.filter((s: any) => {`
);

fs.writeFileSync(apiPath, apiContent);
console.log('Fixed Minya custom plan filtering');
