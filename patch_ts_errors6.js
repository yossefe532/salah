import fs from 'fs';

const smPath = 'e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx';
let smContent = fs.readFileSync(smPath, 'utf-8');

smContent = smContent.replace(
  /\$\{a\.name\}/g,
  `\${(a as any).full_name || (a as any).name}`
);

fs.writeFileSync(smPath, smContent);
