import fs from 'fs';

const apiPath = 'e:\\شغل\\شغل\\ص\\src\\lib\\api.ts';
let apiContent = fs.readFileSync(apiPath, 'utf-8');

apiContent = apiContent.replace(
  `seat_code: \`A-T\${charName}-S\${globalA}\`, status: 'available',
            position_x: xCenter + (localCol - (aSeatsPerTable/4 - 0.5)) * tableSeatDx,
            position_y: currentY + (localRow - 0.5) * tableSeatDy
          });`,
  `seat_code: \`A-T\${charName}-S\${globalA}\`, status: 'available',
            position_x: Number((xCenter + (localCol - (aSeatsPerTable/4 - 0.5)) * tableSeatDx).toFixed(2)),
            position_y: Number((currentY + (localRow - 0.5) * tableSeatDy).toFixed(2))
          });`
);

apiContent = apiContent.replace(
  `seat_code: \`B-T\${charName}-S\${globalB}\`, status: 'available',
            position_x: xCenter + (localCol - (bSeatsPerTable/4 - 0.5)) * tableSeatDx,
            position_y: currentY + (localRow - 0.5) * tableSeatDy
          });`,
  `seat_code: \`B-T\${charName}-S\${globalB}\`, status: 'available',
            position_x: Number((xCenter + (localCol - (bSeatsPerTable/4 - 0.5)) * tableSeatDx).toFixed(2)),
            position_y: Number((currentY + (localRow - 0.5) * tableSeatDy).toFixed(2))
          });`
);

fs.writeFileSync(apiPath, apiContent);
console.log('Fixed numeric casting for positions');
