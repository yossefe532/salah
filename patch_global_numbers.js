import fs from 'fs';

const apiPath = 'e:\\شغل\\شغل\\ص\\src\\lib\\api.ts';
let apiContent = fs.readFileSync(apiPath, 'utf-8');

apiContent = apiContent.replace(
  `export const generateMinyaCustomPlan = (eventId: string) => {
  const tables: any[] = [];
  const seats: any[] = [];
  const gov = 'Minya';
  
  // Class A: 2 rows. Right: 3 tables, Left: 3 tables. Each table = 10 chairs.
  const aRows = 2;`,
  `export const generateMinyaCustomPlan = (eventId: string) => {
  const tables: any[] = [];
  const seats: any[] = [];
  const gov = 'Minya';
  
  let globalA = 1;
  let globalB = 1;
  let globalC = 1;
  
  // Class A: 2 rows. Right: 3 tables, Left: 3 tables. Each table = 10 chairs.
  const aRows = 2;`
);

apiContent = apiContent.replace(
  `for (let s = 1; s <= aSeatsPerTable; s++) {
          const localRow = Math.floor((s - 1) / (aSeatsPerTable / 2));
          const localCol = (s - 1) % (aSeatsPerTable / 2);
          seats.push({
            id: \`\${tableId}-S\${s}\`, event_id: eventId, governorate: gov, seat_class: 'A',
            row_number: row, side, table_id: tableId, seat_number: s,
            seat_code: \`A-R\${row}-T\${tableOrder}-S\${s}\`, status: 'available',
            position_x: xCenter + (localCol - (aSeatsPerTable/4 - 0.5)) * tableSeatDx,
            position_y: currentY + (localRow - 0.5) * tableSeatDy
          });
        }`,
  `for (let s = 1; s <= aSeatsPerTable; s++) {
          const localRow = Math.floor((s - 1) / (aSeatsPerTable / 2));
          const localCol = (s - 1) % (aSeatsPerTable / 2);
          seats.push({
            id: \`\${tableId}-S\${s}\`, event_id: eventId, governorate: gov, seat_class: 'A',
            row_number: row, side, table_id: tableId, seat_number: globalA,
            seat_code: \`A-R\${row}-T\${tableOrder}-S\${globalA}\`, status: 'available',
            position_x: xCenter + (localCol - (aSeatsPerTable/4 - 0.5)) * tableSeatDx,
            position_y: currentY + (localRow - 0.5) * tableSeatDy
          });
          globalA++;
        }`
);

apiContent = apiContent.replace(
  `for (let s = 1; s <= bSeatsPerTable; s++) {
          const localRow = Math.floor((s - 1) / (bSeatsPerTable / 2));
          const localCol = (s - 1) % (bSeatsPerTable / 2);
          seats.push({
            id: \`\${tableId}-S\${s}\`, event_id: eventId, governorate: gov, seat_class: 'B',
            row_number: row, side, table_id: tableId, seat_number: s,
            seat_code: \`B-R\${row}-T\${tableOrder}-S\${s}\`, status: 'available',
            position_x: xCenter + (localCol - (bSeatsPerTable/4 - 0.5)) * tableSeatDx,
            position_y: currentY + (localRow - 0.5) * tableSeatDy
          });
        }`,
  `for (let s = 1; s <= bSeatsPerTable; s++) {
          const localRow = Math.floor((s - 1) / (bSeatsPerTable / 2));
          const localCol = (s - 1) % (bSeatsPerTable / 2);
          seats.push({
            id: \`\${tableId}-S\${s}\`, event_id: eventId, governorate: gov, seat_class: 'B',
            row_number: row, side, table_id: tableId, seat_number: globalB,
            seat_code: \`B-R\${row}-T\${tableOrder}-S\${globalB}\`, status: 'available',
            position_x: xCenter + (localCol - (bSeatsPerTable/4 - 0.5)) * tableSeatDx,
            position_y: currentY + (localRow - 0.5) * tableSeatDy
          });
          globalB++;
        }`
);

apiContent = apiContent.replace(
  `for (let s = 1; s <= cSeatsPerSide; s++) {
        const seatNum = sideIdx * cSeatsPerSide + s;
        seats.push({
            id: \`\${gov}-C-R\${row}-S\${seatNum}\`, event_id: eventId, governorate: gov, seat_class: 'C',
            row_number: row, side, table_id: null, seat_number: seatNum,
            seat_code: \`C-R\${row}-S\${seatNum}\`, status: 'available',
            position_x: startX + (s * 2.5),
            position_y: currentY
        });
      }`,
  `for (let s = 1; s <= cSeatsPerSide; s++) {
        seats.push({
            id: \`\${gov}-C-R\${row}-S\${globalC}\`, event_id: eventId, governorate: gov, seat_class: 'C',
            row_number: row, side, table_id: null, seat_number: globalC,
            seat_code: \`C-R\${row}-S\${globalC}\`, status: 'available',
            position_x: startX + (s * 2.5),
            position_y: currentY
        });
        globalC++;
      }`
);

fs.writeFileSync(apiPath, apiContent);
console.log('Fixed unique global seat numbering');
