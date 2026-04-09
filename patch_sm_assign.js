import fs from 'fs';

const smPath = 'e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx';
let smContent = fs.readFileSync(smPath, 'utf-8');

smContent = smContent.replace(
  `const handleSeatClick = (seat: Seat) => {
    if (mode === 'assign' && seat.status === 'booked') return;
    setSelectedSeatId(seat.id);
    setSelectedElement({ id: seat.id, type: 'seat' });
  };`,
  `const handleSeatClick = (seat: Seat) => {
    setSelectedSeatId(seat.id);
    setSelectedElement({ id: seat.id, type: 'seat' });
    
    if (mode === 'assign') {
      if (seat.status === 'booked') {
        const attendee = attendees.find(a => a.id === seat.attendee_id);
        if (attendee) {
          alert(\`هذا المقعد محجوز لـ: \${attendee.name} \nفئة: \${attendee.seat_class} - رقم المقعد: \${attendee.seat_number}\`);
        }
      } else {
        const eligible = attendees.filter(a => a.seat_class === seat.seat_class && !a.seat_number);
        if (eligible.length === 0) {
          alert('لا يوجد عملاء غير مسكنين في هذه الفئة (' + seat.seat_class + ')');
        } else {
          // Open assignment dialog (simulated with prompt for now)
          const names = eligible.map((a, i) => \`\${i+1}- \${a.name}\`).join('\\n');
          const choice = prompt(\`اختر رقم العميل لتسكينه في هذا المقعد:\\n\${names}\`);
          const idx = parseInt(choice || '') - 1;
          if (!isNaN(idx) && eligible[idx]) {
            assignSelected(eligible[idx].id);
          }
        }
      }
    }
  };`
);

fs.writeFileSync(smPath, smContent);
console.log('Added interactive seat assignment');
