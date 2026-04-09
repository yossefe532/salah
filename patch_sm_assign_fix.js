import fs from 'fs';

const smPath = 'e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx';
let smContent = fs.readFileSync(smPath, 'utf-8');

smContent = smContent.replace(
  `assignSelected(eligible[idx].id);`,
  `const a = eligible[idx];
            setSelectedSeatId(seat.id);
            // Simulate selecting from the dropdown
            setTimeout(() => assignSelected(a.id), 100);`
);

smContent = smContent.replace(
  `const assignSelected = async (attendeeId: string) => {`,
  `const assignSelected = async (attendeeId: string) => {
    if (!selectedSeatId || !attendeeId) return;`
);

fs.writeFileSync(smPath, smContent);
console.log('Fixed assign param flow');
