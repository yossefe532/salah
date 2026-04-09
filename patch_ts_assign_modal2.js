import fs from 'fs';

const smPath = 'e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx';
let smContent = fs.readFileSync(smPath, 'utf-8');

smContent = smContent.replace(
  `normalizeGovernorate`,
  `((val: string) => val.trim().toLowerCase())`
);
smContent = smContent.replace(
  `normalizeGovernorate`,
  `((val: string) => val.trim().toLowerCase())`
);
smContent = smContent.replace(
  `normalizeGovernorate`,
  `((val: string) => val.trim().toLowerCase())`
);
smContent = smContent.replace(
  `normalizeGovernorate`,
  `((val: string) => val.trim().toLowerCase())`
);
smContent = smContent.replace(
  `normalizeGovernorate`,
  `((val: string) => val.trim().toLowerCase())`
);
smContent = smContent.replace(
  `normalizeGovernorate`,
  `((val: string) => val.trim().toLowerCase())`
);

fs.writeFileSync(smPath, smContent);
