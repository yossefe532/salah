import fs from 'fs';

const smPath = 'e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx';
let smContent = fs.readFileSync(smPath, 'utf-8');

smContent = smContent.replace(
  `alert(\`هذا المقعد محجوز لـ: \${attendee.name} \\nفئة: \${attendee.seat_class} - رقم المقعد: \${attendee.seat_number}\`);`,
  `alert(\`هذا المقعد محجوز لـ: \${(attendee as any).full_name} \\nفئة: \${attendee.seat_class} - رقم المقعد: \${attendee.seat_number}\`);`
);

smContent = smContent.replace(
  `const assignSelected = async () => {
    const aid = typeof passedAttendeeId === 'string' ? passedAttendeeId : selectedAssignee;`,
  `const assignSelected = async (passedAttendeeId?: any) => {
    const aid = typeof passedAttendeeId === 'string' ? passedAttendeeId : selectedAssignee;`
);

// I need to use regex properly since multiple instances might exist or I missed it.
// Let's just rewrite the whole function.

fs.writeFileSync(smPath, smContent);
