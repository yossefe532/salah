import fs from 'fs';

const fileContent = fs.readFileSync('e:\\شغل\\شغل\\ص\\src\\pages\\IDCard.tsx', 'utf-8');

let updated = fileContent.replace(
  `{attendee.seat_number ?? '-'}`,
  `{attendee.seat_class === 'C' ? 'Wave : ' + (seatInfo?.seat?.wave_number || '-') + ' | Seat : ' + (attendee.seat_number ?? '-') : 'Table : ' + (seatInfo?.table?.table_order || '-') + ' | Chair : ' + (attendee.seat_number ?? '-')}`
);

fs.writeFileSync('e:\\شغل\\شغل\\ص\\src\\pages\\IDCard.tsx', updated);
console.log('Replaced second instance');
