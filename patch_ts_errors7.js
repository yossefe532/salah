import fs from 'fs';

const smPath = 'e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx';
let smContent = fs.readFileSync(smPath, 'utf-8');

smContent = smContent.replace(
  `const aid = typeof passedAttendeeId === 'string' ? passedAttendeeId : selectedAssignee;`,
  `const aid = typeof passedAttendeeId === 'string' ? passedAttendeeId : selectedAttendeeId;`
);

fs.writeFileSync(smPath, smContent);
