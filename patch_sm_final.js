import fs from 'fs';

const smPath = 'e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx';
let smContent = fs.readFileSync(smPath, 'utf-8');

smContent = smContent.replace(
  `const tableBoxes = useMemo(() => {
    return (payload.tables || []).map(t => ({
      id: t.id,
      x: (Number(t.position_x) || 0) * 8,
      y: (Number(t.position_y) || 0) * 4,
      w: (Number(t.width) || 10) * 8,
      h: (Number(t.height) || 8) * 4,
      cls: t.seat_class
    }));
  }, [payload.tables]);`,
  `const tableBoxes = useMemo(() => {
    const seatsByTable = new Map<string, Seat[]>();
    for (const seat of payload.seats || []) {
      if (!seat.table_id) continue;
      const list = seatsByTable.get(seat.table_id) || [];
      const patch = layoutDraft[seat.id];
      list.push((patch ? { ...seat, position_x: patch.position_x, position_y: patch.position_y } : seat) as any);
      seatsByTable.set(seat.table_id, list as any);
    }
    const boxes: Array<{ id: string; x: number; y: number; w: number; h: number; cls: string }> = [];
    for (const table of payload.tables || []) {
      const list = seatsByTable.get(table.id) || [];
      if (!list.length) continue;
      const xs = list.map((s: any) => Number(s.position_x || 0));
      const ys = list.map((s: any) => Number(s.position_y || 0));
      const minX = Math.min(...xs) * 8 - 10;
      const maxX = Math.max(...xs) * 8 + 10;
      const minY = Math.min(...ys) * 4 - 10;
      const maxY = Math.max(...ys) * 4 + 10;
      boxes.push({
        id: table.id,
        x: minX,
        y: minY,
        w: Math.max(24, maxX - minX),
        h: Math.max(24, maxY - minY),
        cls: table.seat_class
      });
    }
    return boxes;
  }, [payload.seats, payload.tables, layoutDraft]);`
);

smContent = smContent.replace(
  `if (dragState.type === 'table') {
        const table = payload.tables.find(t => t.id === dragState.id);
        if (table) {
            const deltaX = nextX - Number(table.position_x || 0);
            const deltaY = nextY - Number(table.position_y || 0);
            payload.seats.filter(s => s.table_id === table.id).forEach(s => {
                const sPatch = layoutDraft[s.id];
                const sOrigX = Number(s.position_x || 0);
                const sOrigY = Number(s.position_y || 0);
                nextDraft[s.id] = { type: 'seat', position_x: sOrigX + deltaX, position_y: sOrigY + deltaY };
            });
        }
    }`,
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
    }`
);

smContent = smContent.replace(
  `{(payload.layout_elements || []).map((el) => {
                const isStage = el.element_type === 'stage';
                const isBlocked = el.element_type === 'blocked';
                const draft = layoutDraft[el.id];
                const x = draft ? draft.position_x * 8 : Number(el.position_x) * 8;
                const y = draft ? draft.position_y * 4 : Number(el.position_y) * 4;
                return (
                  <div
                    key={el.id}
                    onClick={(e) => {
                       e.stopPropagation();
                       setSelectedElement({ id: el.id, type: 'element' });
                    }}
                    onMouseDown={(e) => {
                       e.stopPropagation();
                       startDrag(el, 'element', e.clientX, e.clientY);
                    }}
                    className={\`absolute border rounded flex items-center justify-center font-bold text-xs \${mode === 'edit' ? 'cursor-move' : 'pointer-events-none'} \${selectedElement?.id === el.id ? 'ring-2 ring-red-500' : ''} \${isStage ? 'bg-amber-900/30 border-amber-500 text-amber-200' : isBlocked ? 'bg-rose-900/30 border-rose-500 text-rose-200' : 'bg-emerald-900/30 border-emerald-500 text-emerald-200'}\`}
                    style={{ left: x, top: y, width: Number(el.width) * 8, height: Number(el.height) * 4 }}
                  >
                    {el.label || el.element_type.toUpperCase()}
                  </div>
                );
              })}`,
  `{/* Layout elements removed as they require DB migration */}`
);

fs.writeFileSync(smPath, smContent);
console.log('Reverted SeatingManagement to dynamic table sizing');
