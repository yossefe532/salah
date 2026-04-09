import fs from 'fs';

const smPath = 'e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx';
let smContent = fs.readFileSync(smPath, 'utf-8');

smContent = smContent.replace(
  `const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);`,
  `const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [assignmentModal, setAssignmentModal] = useState<{isOpen: boolean, seat: Seat | null}>({isOpen: false, seat: null});
  const [searchTerm, setSearchTerm] = useState('');`
);

smContent = smContent.replace(
  `const handleSeatClick = (seat: Seat) => {
    setSelectedSeatId(seat.id);
    setSelectedElement({ id: seat.id, type: 'seat' });
  };`,
  `const handleSeatClick = (seat: Seat) => {
    setSelectedSeatId(seat.id);
    setSelectedElement({ id: seat.id, type: 'seat' });
  };
  
  const handleSeatDoubleClick = (seat: Seat) => {
    if (mode === 'assign') {
      if (seat.status === 'booked') {
        const attendee = attendees.find(a => a.id === seat.attendee_id);
        if (attendee) {
          alert(\`هذا المقعد محجوز لـ: \${(attendee as any).full_name || (attendee as any).name} \\nفئة: \${attendee.seat_class} - رقم المقعد: \${attendee.seat_number}\`);
        }
      } else {
        setSelectedSeatId(seat.id);
        setSearchTerm('');
        setAssignmentModal({ isOpen: true, seat });
      }
    }
  };`
);

fs.writeFileSync(smPath, smContent);
console.log('Fixed TS errors in SeatingManagement for Assignment Modal - proper replacement');
