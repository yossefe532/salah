import fs from 'fs';

const apiPath = 'e:\\شغل\\شغل\\ص\\src\\lib\\api.ts';
let apiContent = fs.readFileSync(apiPath, 'utf-8');

apiContent = apiContent.replace(
  `export const generateMinyaCustomPlan = (eventId: string) => {`,
  `export const generateMinyaCustomPlan = (eventId: string) => {
  let tableCharIndexA = 0;
  let tableCharIndexB = 0;
  const getTableCharA = () => String.fromCharCode(65 + (tableCharIndexA % 26)) + (tableCharIndexA >= 26 ? Math.floor(tableCharIndexA/26) : '');
  const getTableCharB = () => String.fromCharCode(65 + (tableCharIndexB % 26)) + (tableCharIndexB >= 26 ? Math.floor(tableCharIndexB/26) : '');`
);

apiContent = apiContent.replace(
  `const charName = getTableChar(tableOrder - 1);`,
  `const charName = getTableCharA(); tableCharIndexA++;`
);

apiContent = apiContent.replace(
  `const charName = getTableChar(tableOrder - 1);`,
  `const charName = getTableCharB(); tableCharIndexB++;`
);

// add wave numbers explicitly
apiContent = apiContent.replace(
  `position_y: currentY`,
  `position_y: currentY,
            wave_number: row`
);

fs.writeFileSync(apiPath, apiContent);
console.log('Fixed distinct char index per class');
