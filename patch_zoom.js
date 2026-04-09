import fs from 'fs';

const smPath = 'e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx';
let smContent = fs.readFileSync(smPath, 'utf-8');

smContent = smContent.replace(
  `const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);`,
  `const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);`
);

smContent = smContent.replace(
  `{/* Hall Canvas */}`,
  `{/* Zoom Controls */}
          <div className="absolute top-4 left-4 z-50 flex flex-col gap-2 bg-slate-900/80 p-2 rounded-lg backdrop-blur border border-slate-800">
            <button onClick={() => setZoomLevel(p => Math.min(p + 0.2, 3))} className="w-8 h-8 flex items-center justify-center bg-slate-800 rounded hover:bg-slate-700 text-white font-bold">+</button>
            <span className="text-white text-xs text-center">{Math.round(zoomLevel * 100)}%</span>
            <button onClick={() => setZoomLevel(p => Math.max(p - 0.2, 0.4))} className="w-8 h-8 flex items-center justify-center bg-slate-800 rounded hover:bg-slate-700 text-white font-bold">-</button>
            <button onClick={() => setZoomLevel(1)} className="w-8 h-8 flex items-center justify-center bg-slate-800 rounded hover:bg-slate-700 text-white text-xs">Reset</button>
          </div>
          {/* Hall Canvas */}`
);

smContent = smContent.replace(
  `<div
            className="absolute inset-0 select-none overflow-hidden"
            onMouseMove={(e) => {
              if (mode === 'edit' && dragState) {
                const rect = e.currentTarget.getBoundingClientRect();
                onCanvasMove(e.clientX - rect.left, e.clientY - rect.top);
              }
            }}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
          >`,
  `<div
            className="absolute inset-0 select-none overflow-auto"
            onMouseMove={(e) => {
              if (mode === 'edit' && dragState) {
                const rect = e.currentTarget.children[0].getBoundingClientRect();
                onCanvasMove((e.clientX - rect.left) / zoomLevel, (e.clientY - rect.top) / zoomLevel);
              }
            }}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
          >
          <div style={{ transform: \`scale(\${zoomLevel})\`, transformOrigin: 'top left', minWidth: '100%', minHeight: '100%' }} className="relative w-full h-full">`
);

// Close the new wrapper div
smContent = smContent.replace(
  `{/* End of canvas */}`,
  `{/* End of canvas */}
          </div>`
);

smContent = smContent.replace(
  `const onCanvasMove = (clientX: number, clientY: number) => {
    if (!dragState || mode !== 'edit') return;
    const dx = (clientX - dragState.startX) / 8;
    const dy = (clientY - dragState.startY) / 4;`,
  `const onCanvasMove = (clientX: number, clientY: number) => {
    if (!dragState || mode !== 'edit') return;
    // Calculate dx dy based on the original start position taking zoom into account
    // We already passed scaled clientX/Y
    const dx = (clientX - dragState.startX) / 8;
    const dy = (clientY - dragState.startY) / 4;`
);

smContent = smContent.replace(
  `const startDrag = (item: any, type: 'seat' | 'table' | 'element', clientX: number, clientY: number) => {`,
  `const startDrag = (item: any, type: 'seat' | 'table' | 'element', clientX: number, clientY: number, currentTarget: HTMLElement) => {`
);

smContent = smContent.replace(
  `setDragState({
      id: item.id,
      type,
      startX: clientX,
      startY: clientY,`,
  `const rect = currentTarget.closest('.overflow-auto')?.children[0].getBoundingClientRect();
    const scaledX = rect ? (clientX - rect.left) / zoomLevel : clientX;
    const scaledY = rect ? (clientY - rect.top) / zoomLevel : clientY;
    
    setDragState({
      id: item.id,
      type,
      startX: scaledX,
      startY: scaledY,`
);

smContent = smContent.replace(
  `onMouseDown={(e) => {
                       e.stopPropagation();
                       startDrag({ id: box.id, position_x: box.x/8, position_y: box.y/4 }, 'table', e.clientX, e.clientY);
                    }}`,
  `onMouseDown={(e) => {
                       e.stopPropagation();
                       startDrag({ id: box.id, position_x: box.x/8, position_y: box.y/4 }, 'table', e.clientX, e.clientY, e.currentTarget);
                    }}`
);

smContent = smContent.replace(
  `onMouseDown={(e) => {
                       e.stopPropagation();
                       startDrag(el, 'element', e.clientX, e.clientY);
                    }}`,
  `onMouseDown={(e) => {
                       e.stopPropagation();
                       startDrag(el, 'element', e.clientX, e.clientY, e.currentTarget);
                    }}`
);

smContent = smContent.replace(
  `onMouseDown={(e) => {
                       e.stopPropagation();
                       startDrag(seat, 'seat', e.clientX, e.clientY);
                    }}`,
  `onMouseDown={(e) => {
                       e.stopPropagation();
                       startDrag(seat, 'seat', e.clientX, e.clientY, e.currentTarget);
                    }}`
);

fs.writeFileSync(smPath, smContent);
console.log('Added Zooming logic');
