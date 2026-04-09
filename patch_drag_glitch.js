import fs from 'fs';

const smPath = 'e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx';
let smContent = fs.readFileSync(smPath, 'utf-8');

// The glitch happens because `sOrigX` uses the already patched value from layoutDraft while dragging, making dx compound exponentially on every mouse move event.
// We need to always base delta on the ACTUAL original position when the drag started, OR we need to make sure we don't apply delta on top of delta.
// Since `dragState.originX` stores the start of the table, dx is the TOTAL displacement from the start.
// So we just add `dx` to the SEAT's true initial position.

smContent = smContent.replace(
  `if (dragState.type === 'table') {
        const tableBox = tableBoxes.find(b => b.id === dragState.id);
        if (tableBox) {
            const deltaX = dx;
            const deltaY = dy;
            payload.seats.filter(s => s.table_id === dragState.id).forEach(s => {
                const sPatch = layoutDraft[s.id];
                const sOrigX = sPatch ? sPatch.position_x : Number(s.position_x || 0);
                const sOrigY = sPatch ? sPatch.position_y : Number(s.position_y || 0);
                nextDraft[s.id] = { type: 'seat', position_x: sOrigX + deltaX, position_y: sOrigY + deltaY };
            });
        }
    }`,
  `if (dragState.type === 'table') {
        payload.seats.filter(s => s.table_id === dragState.id).forEach(s => {
            // Find the seat's TRUE original position from payload, ignore current layoutDraft
            // But wait, what if it was moved previously? We need to use the history-committed position!
            // Wait, we can just use the payload position IF it hasn't been saved yet? No, layoutDraft stores the cumulative delta if we don't clear it.
            // Actually, the easiest way is to find the seat's position at the start of the drag.
            // We can add a \`seatsStartPos\` to \`dragState\` to cache their starting positions.
        });
    }`
);

smContent = smContent.replace(
  `const [dragState, setDragState] = useState<{
    id: string;
    type: 'seat' | 'table' | 'element';
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);`,
  `const [dragState, setDragState] = useState<{
    id: string;
    type: 'seat' | 'table' | 'element';
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    seatOrigins?: Record<string, {x: number, y: number}>;
  } | null>(null);`
);

smContent = smContent.replace(
  `const startDrag = (item: any, type: 'seat' | 'table' | 'element', clientX: number, clientY: number) => {
    if (mode !== 'edit') return;
    const patch = layoutDraft[item.id];
    const originX = patch ? patch.position_x : Number(item.position_x || 0);
    const originY = patch ? patch.position_y : Number(item.position_y || 0);
    setDragState({
      id: item.id,
      type,
      startX: clientX,
      startY: clientY,
      originX,
      originY
    });
  };`,
  `const startDrag = (item: any, type: 'seat' | 'table' | 'element', clientX: number, clientY: number) => {
    if (mode !== 'edit') return;
    const patch = layoutDraft[item.id];
    const originX = patch ? patch.position_x : Number(item.position_x || 0);
    const originY = patch ? patch.position_y : Number(item.position_y || 0);
    
    let seatOrigins: Record<string, {x: number, y: number}> = {};
    if (type === 'table') {
      payload.seats.filter(s => s.table_id === item.id).forEach(s => {
        const sPatch = layoutDraft[s.id];
        seatOrigins[s.id] = {
          x: sPatch ? sPatch.position_x : Number(s.position_x || 0),
          y: sPatch ? sPatch.position_y : Number(s.position_y || 0)
        };
      });
    }

    setDragState({
      id: item.id,
      type,
      startX: clientX,
      startY: clientY,
      originX,
      originY,
      seatOrigins
    });
  };`
);

smContent = smContent.replace(
  `if (dragState.type === 'table') {
        payload.seats.filter(s => s.table_id === dragState.id).forEach(s => {
            // Find the seat's TRUE original position from payload, ignore current layoutDraft
            // But wait, what if it was moved previously? We need to use the history-committed position!
            // Wait, we can just use the payload position IF it hasn't been saved yet? No, layoutDraft stores the cumulative delta if we don't clear it.
            // Actually, the easiest way is to find the seat's position at the start of the drag.
            // We can add a \`seatsStartPos\` to \`dragState\` to cache their starting positions.
        });
    }`,
  `if (dragState.type === 'table' && dragState.seatOrigins) {
        payload.seats.filter(s => s.table_id === dragState.id).forEach(s => {
            const startPos = dragState.seatOrigins![s.id];
            if (startPos) {
                nextDraft[s.id] = { 
                  type: 'seat', 
                  position_x: Math.max(0, Math.round((startPos.x + dx) * 10) / 10), 
                  position_y: Math.max(0, Math.round((startPos.y + dy) * 10) / 10) 
                };
            }
        });
    }`
);

fs.writeFileSync(smPath, smContent);
console.log('Fixed drag drop glitch');
