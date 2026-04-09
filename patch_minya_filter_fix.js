import fs from 'fs';

const apiPath = 'e:\\شغل\\شغل\\ص\\src\\lib\\api.ts';
let apiContent = fs.readFileSync(apiPath, 'utf-8');

apiContent = apiContent.replace(
  /const adjustedSeats = seats\.filter\(\(s: any\) => \{/g,
  `const adjustedSeats = isMinyaCustom ? seats : seats.filter((s: any) => {`
);

fs.writeFileSync(apiPath, apiContent);
console.log('Fixed adjustedSeats replacement using regex');
