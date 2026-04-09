import fs from 'fs';

const apiPath = 'e:\\شغل\\شغل\\ص\\src\\lib\\api.ts';
let apiContent = fs.readFileSync(apiPath, 'utf-8');

apiContent = apiContent.replace(
  `const adjustedSeats = isMinyaCustom ? seats : seats.filter((s: any) => {`,
  `// Even if it is Minya, we need to map over it to ensure no strange float values are sent to integers.
        const cleanedSeats = seats.map((s: any) => ({
           ...s,
           position_x: Number(Number(s.position_x).toFixed(2)),
           position_y: Number(Number(s.position_y).toFixed(2)),
           relative_x: s.relative_x ? Number(Number(s.relative_x).toFixed(2)) : null,
           relative_y: s.relative_y ? Number(Number(s.relative_y).toFixed(2)) : null,
           row_number: Math.round(Number(s.row_number)),
           seat_number: Math.round(Number(s.seat_number)),
           wave_number: s.wave_number ? Math.round(Number(s.wave_number)) : null
        }));
        const adjustedSeats = isMinyaCustom ? cleanedSeats : cleanedSeats.filter((s: any) => {`
);

fs.writeFileSync(apiPath, apiContent);
console.log('Fixed possible float insertion into integers');
