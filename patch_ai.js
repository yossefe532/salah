import fs from 'fs';

const fileContent = fs.readFileSync('e:\\شغل\\شغل\\ص\\src\\lib\\api.ts', 'utf-8');

let updated = fileContent.replace(
  `const generateHallPlan = (eventId: string, governorate: string = 'Minya') => {`,
  `export const generateExactHallPlan = (eventId: string, governorate: string, counts: {A: number, B: number, C: number}) => {
  const plan = generateHallPlan(eventId, governorate);
  
  // Now trim the generated plan to exactly match the requested counts
  const trimSeats = (cls: string, count: number) => {
    let clsSeats = plan.seats.filter(s => s.seat_class === cls);
    // Sort by row, then table, then seat to trim from the back
    clsSeats.sort((a, b) => {
      if (a.row_number !== b.row_number) return a.row_number - b.row_number;
      if (a.seat_class !== 'C') {
         const tA = Number((a.table_id || '').split('-T')[1] || 0);
         const tB = Number((b.table_id || '').split('-T')[1] || 0);
         if (tA !== tB) return tA - tB;
      }
      return a.seat_number - b.seat_number;
    });
    
    const keep = new Set(clsSeats.slice(0, count).map(s => s.id));
    plan.seats = plan.seats.filter(s => s.seat_class !== cls || keep.has(s.id));
    
    // For A and B, also remove empty tables
    if (cls !== 'C') {
      const activeTableIds = new Set(plan.seats.filter(s => s.seat_class === cls).map(s => s.table_id));
      plan.tables = plan.tables.filter(t => t.seat_class !== cls || activeTableIds.has(t.id));
    }
  };

  trimSeats('A', counts.A);
  trimSeats('B', counts.B);
  trimSeats('C', counts.C);
  
  return plan;
};

const generateHallPlan = (eventId: string, governorate: string = 'Minya') => {`
);

fs.writeFileSync('e:\\شغل\\شغل\\ص\\src\\lib\\api.ts', updated);
console.log('Added exact matching AI logic');
