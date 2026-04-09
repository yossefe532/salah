import fs from 'fs';

const smPath = 'e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx';
let smContent = fs.readFileSync(smPath, 'utf-8');

smContent = smContent.replace(
  `const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);`,
  `const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [assignmentModal, setAssignmentModal] = useState<{isOpen: boolean, seat: Seat | null}>({isOpen: false, seat: null});
  const [searchTerm, setSearchTerm] = useState('');`
);

fs.writeFileSync(smPath, smContent);
console.log('Added missing state vars');
