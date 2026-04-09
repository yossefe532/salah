import fs from 'fs';

const content = fs.readFileSync('e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx', 'utf-8');

let updated = content.replace(
  `{mapSeats.map((seat) => {
                const seatView = getSeatView(seat);
                const selected = selectedSeatId === seat.id;
                return (
                  <button
                    key={seat.id}
                    onClick={() => handleSeatClick(seat)}
                    onMouseDown={(e) => startDrag(seat, 'seat', e.clientX, e.clientY)}
                    className={\`absolute text-[10px] w-10 h-10 rounded-full border border-white/20 flex flex-col items-center justify-center text-white \${selected ? 'bg-blue-600 ring-2 ring-blue-300 scale-110 z-10' : (statusColor[seat.status] || 'bg-slate-500')}\`}
                    style={{
                      left: \`\${Number(seatView.position_x || 0) * 8}px\`,
                      top: \`\${Number(seatView.position_y || 0) * 4}px\`
                    }}
                    title={\`\${seat.seat_code} - \${statusLabel[seat.status] || seat.status}\`}
                  >
                    <span className="leading-none">{seat.seat_number}</span>
                    <span className="leading-none text-[8px] opacity-90">{seat.seat_class}</span>
                  </button>
                );
              })}`,
  `{mapSeats.map((seat) => {
                const seatView = getSeatView(seat);
                const selected = selectedSeatId === seat.id;
                return (
                  <button
                    key={seat.id}
                    onClick={(e) => {
                       e.stopPropagation();
                       handleSeatClick(seat);
                    }}
                    onMouseDown={(e) => {
                       e.stopPropagation();
                       startDrag(seat, 'seat', e.clientX, e.clientY);
                    }}
                    className={\`absolute text-[10px] w-10 h-10 rounded-full border border-white/20 flex flex-col items-center justify-center text-white \${selected ? 'bg-blue-600 ring-2 ring-blue-300 scale-110 z-10' : (statusColor[seat.status] || 'bg-slate-500')} \${mode === 'edit' ? 'cursor-move' : ''}\`}
                    style={{
                      left: \`\${Number(seatView.position_x || 0) * 8}px\`,
                      top: \`\${Number(seatView.position_y || 0) * 4}px\`
                    }}
                    title={\`\${seat.seat_code} - \${statusLabel[seat.status] || seat.status}\`}
                  >
                    <span className="leading-none">{seat.seat_number}</span>
                    <span className="leading-none text-[8px] opacity-90">{seat.seat_class}</span>
                  </button>
                );
              })}`
);

updated = updated.replace(
  `onClick={() => setSelectedElement({ id: box.id, type: 'table' })}
                    onMouseDown={(e) => startDrag({ id: box.id, position_x: box.x/8, position_y: box.y/4 }, 'table', e.clientX, e.clientY)}`,
  `onClick={(e) => {
                       e.stopPropagation();
                       setSelectedElement({ id: box.id, type: 'table' });
                    }}
                    onMouseDown={(e) => {
                       e.stopPropagation();
                       startDrag({ id: box.id, position_x: box.x/8, position_y: box.y/4 }, 'table', e.clientX, e.clientY);
                    }}`
);

updated = updated.replace(
  `onClick={() => setSelectedElement({ id: el.id, type: 'element' })}
                    onMouseDown={(e) => startDrag(el, 'element', e.clientX, e.clientY)}`,
  `onClick={(e) => {
                       e.stopPropagation();
                       setSelectedElement({ id: el.id, type: 'element' });
                    }}
                    onMouseDown={(e) => {
                       e.stopPropagation();
                       startDrag(el, 'element', e.clientX, e.clientY);
                    }}`
);

fs.writeFileSync('e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx', updated);
console.log('Fixed event bubbling for elements');
