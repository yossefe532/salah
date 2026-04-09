import fs from 'fs';

const smPath = 'e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx';
let smContent = fs.readFileSync(smPath, 'utf-8');

smContent = smContent.replace(
  `alert(\`هذا المقعد محجوز لـ: \${attendee.name} \\nفئة: \${attendee.seat_class} - رقم المقعد: \${attendee.seat_number}\`);`,
  `alert(\`هذا المقعد محجوز لـ: \${(attendee as any).full_name} \\nفئة: \${attendee.seat_class} - رقم المقعد: \${attendee.seat_number}\`);`
);

smContent = smContent.replace(
  `const assignSelected = async (passedAttendeeId?: string | React.MouseEvent | any) => {`,
  `const assignSelected = async (passedAttendeeId?: any) => {`
);

smContent = smContent.replace(
  `setTimeout(() => assignSelected(a.id), 100);`,
  `setTimeout(() => assignSelected(a.id as string), 100);`
);

fs.writeFileSync(smPath, smContent);
console.log('Fixed TypeScript errors permanently');
