import fs from 'fs';

const smPath = 'e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx';
let smContent = fs.readFileSync(smPath, 'utf-8');

smContent = smContent.replace(
  `const assignSelected = async (passedAttendeeId?: string) => {
    if (!selectedSeatId || !attendeeId) return;`,
  `const assignSelected = async (passedAttendeeId?: string | React.MouseEvent | any) => {
    const aid = typeof passedAttendeeId === 'string' ? passedAttendeeId : selectedAssignee;
    if (!selectedSeatId || !aid) return;`
);

smContent = smContent.replace(
  `alert(\`هذا المقعد محجوز لـ: \${attendee.name} \\nفئة: \${attendee.seat_class} - رقم المقعد: \${attendee.seat_number}\`);`,
  `alert(\`هذا المقعد محجوز لـ: \${attendee.full_name} \\nفئة: \${attendee.seat_class} - رقم المقعد: \${attendee.seat_number}\`);`
);

fs.writeFileSync(smPath, smContent);
console.log('Fixed TypeScript errors properly');
