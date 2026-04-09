import fs from 'fs';

let content = fs.readFileSync('e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx', 'utf-8');

// We need to attach onMouseDown to tables and layout_elements
content = content.replace(
  `{tableBoxes.map((box) => (
                <div
                  key={box.id}
                  className="absolute border border-indigo-500/40 rounded-md bg-indigo-500/10 flex flex-col items-center justify-center pointer-events-none"
                  style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
                  title={box.id}
                >
                  <span className="text-[10px] font-bold text-white/50">{box.id}</span>
                </div>
              ))}`,
  `{tableBoxes.map((box) => {
                  const draft = layoutDraft[box.id];
                  const x = draft ? draft.position_x * 8 : box.x;
                  const y = draft ? draft.position_y * 4 : box.y;
                  return (
                  <div
                    key={box.id}
                    onMouseDown={(e) => startDrag({ id: box.id, position_x: box.x/8, position_y: box.y/4 }, 'table', e.clientX, e.clientY)}
                    className={\`absolute border border-indigo-500/40 rounded-md bg-indigo-500/10 flex flex-col items-center justify-center \${mode === 'edit' ? 'cursor-move' : 'pointer-events-none'}\`}
                    style={{ left: x, top: y, width: box.w, height: box.h }}
                    title={box.id}
                  >
                    <span className="text-[10px] font-bold text-white/50">{box.id}</span>
                  </div>
                )})} `
);

content = content.replace(
  `{(payload.layout_elements || []).map((el) => {
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
              })}`,
  `{(payload.layout_elements || []).map((el) => {
                const isStage = el.element_type === 'stage';
                const isBlocked = el.element_type === 'blocked';
                const draft = layoutDraft[el.id];
                const x = draft ? draft.position_x * 8 : Number(el.position_x) * 8;
                const y = draft ? draft.position_y * 4 : Number(el.position_y) * 4;
                return (
                  <div
                    key={el.id}
                    onMouseDown={(e) => startDrag(el, 'element', e.clientX, e.clientY)}
                    className={\`absolute border rounded flex items-center justify-center font-bold text-xs \${mode === 'edit' ? 'cursor-move' : 'pointer-events-none'} \${isStage ? 'bg-amber-900/30 border-amber-500 text-amber-200' : isBlocked ? 'bg-rose-900/30 border-rose-500 text-rose-200' : 'bg-emerald-900/30 border-emerald-500 text-emerald-200'}\`}
                    style={{ left: x, top: y, width: Number(el.width) * 8, height: Number(el.height) * 4 }}
                  >
                    {el.label || el.element_type.toUpperCase()}
                  </div>
                );
              })}`
);

// also fix startDrag for seat
content = content.replace(
  `onMouseDown={(e) => startDrag(seat, e.clientX, e.clientY)}`,
  `onMouseDown={(e) => startDrag(seat, 'seat', e.clientX, e.clientY)}`
);

fs.writeFileSync('e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx', content);
console.log('Updated DOM for dragging');
