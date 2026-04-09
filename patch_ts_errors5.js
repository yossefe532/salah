import fs from 'fs';

const smPath = 'e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx';
let smContent = fs.readFileSync(smPath, 'utf-8');

smContent = smContent.replace(
  /const assignSelected = async \([^)]*\) => {[\s\S]*?if \(!selectedSeatId/g,
  `const assignSelected = async (passedAttendeeId?: any) => {
    const aid = typeof passedAttendeeId === 'string' ? passedAttendeeId : selectedAssignee;
    if (!selectedSeatId`
);

smContent = smContent.replace(
  /\$\{attendee\.name\}/g,
  `\${(attendee as any).full_name || (attendee as any).name}`
);

fs.writeFileSync(smPath, smContent);
console.log('Fixed TypeScript errors properly with regex');
