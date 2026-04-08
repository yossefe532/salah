import fs from 'fs';

const fileContent = fs.readFileSync('e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx', 'utf-8');

let updated = fileContent.replace(
  `type SeatingMapPayload = {
  event_id: string;
  tables: SeatTable[];
  seats: Seat[];
};`,
  `import { LayoutElement } from '../types';

type SeatingMapPayload = {
  event_id: string;
  tables: SeatTable[];
  seats: Seat[];
  layout_elements?: LayoutElement[];
};`
);

updated = updated.replace(
  `const [payload, setPayload] = useState<SeatingMapPayload>({ event_id: 'MINYA-2026-MAIN', tables: [], seats: [] });`,
  `const [payload, setPayload] = useState<SeatingMapPayload>({ event_id: 'MINYA-2026-MAIN', tables: [], seats: [], layout_elements: [] });`
);

updated = updated.replace(
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
  }, [payload.seats, payload.tables, layoutDraft]);`,
  `const tableBoxes = useMemo(() => {
    return (payload.tables || []).map(t => ({
      id: t.id,
      x: (Number(t.position_x) || 0) * 8,
      y: (Number(t.position_y) || 0) * 4,
      w: (Number(t.width) || 10) * 8,
      h: (Number(t.height) || 8) * 4,
      cls: t.seat_class
    }));
  }, [payload.tables]);`
);

updated = updated.replace(
  `{tableBoxes.map((box) => (
                <div
                  key={box.id}
                  className="absolute border border-white/20 rounded-md bg-white/[0.03] pointer-events-none"
                  style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
                  title={box.id}
                />
              ))}`,
  `{tableBoxes.map((box) => (
                <div
                  key={box.id}
                  className="absolute border border-indigo-500/40 rounded-md bg-indigo-500/10 flex flex-col items-center justify-center pointer-events-none"
                  style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
                  title={box.id}
                >
                  <span className="text-[10px] font-bold text-white/50">{box.id}</span>
                </div>
              ))}
              {(payload.layout_elements || []).map((el) => {
                const isStage = el.element_type === 'stage';
                const isBlocked = el.element_type === 'blocked';
                return (
                  <div
                    key={el.id}
                    className={\`absolute border rounded flex items-center justify-center font-bold text-xs pointer-events-none \${isStage ? 'bg-amber-900/30 border-amber-500 text-amber-200' : isBlocked ? 'bg-rose-900/30 border-rose-500 text-rose-200' : 'bg-emerald-900/30 border-emerald-500 text-emerald-200'}\`}
                    style={{ left: Number(el.position_x) * 8, top: Number(el.position_y) * 4, width: Number(el.width) * 8, height: Number(el.height) * 4 }}
                  >
                    {el.label || el.element_type.toUpperCase()}
                  </div>
                );
              })}`
);

fs.writeFileSync('e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx', updated);
console.log('Successfully patched SeatingManagement.tsx');
