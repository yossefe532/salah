import fs from 'fs';

const content = fs.readFileSync('e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx', 'utf-8');

let updated = content.replace(
  `const handleAddElement = async (type: string, cls?: string) => {`,
  `const handleDeleteElement = async (id: string, type: 'table' | 'element' | 'wave' | 'seat') => {
    if (!window.confirm('هل أنت متأكد من الحذف؟')) return;
    try {
      setLoading(true);
      await api.post('/seating/delete-element', { event_id: eventId, id, type });
      await loadMap();
    } catch(e: any) {
      setError(e.message || 'فشل الحذف');
    } finally {
      setLoading(false);
    }
  };

  const handleAddElement = async (type: string, cls?: string) => {`
);

// Allow clicking on Table to select it
updated = updated.replace(
  `const handleSeatClick = (seat: Seat) => {
    if (mode === 'assign' && seat.status === 'booked') return;
    setSelectedSeatId(seat.id);
  };`,
  `const [selectedElement, setSelectedElement] = useState<{id: string, type: 'table' | 'element' | 'wave' | 'seat'} | null>(null);
  
  const handleSeatClick = (seat: Seat) => {
    if (mode === 'assign' && seat.status === 'booked') return;
    setSelectedSeatId(seat.id);
    setSelectedElement({ id: seat.id, type: 'seat' });
  };`
);

// Attach onClick to table
updated = updated.replace(
  `onMouseDown={(e) => startDrag({ id: box.id, position_x: box.x/8, position_y: box.y/4 }, 'table', e.clientX, e.clientY)}
                    className={\`absolute border border-indigo-500/40 rounded-md bg-indigo-500/10 flex flex-col items-center justify-center \${mode === 'edit' ? 'cursor-move' : 'pointer-events-none'}\`}`,
  `onClick={() => setSelectedElement({ id: box.id, type: 'table' })}
                    onMouseDown={(e) => startDrag({ id: box.id, position_x: box.x/8, position_y: box.y/4 }, 'table', e.clientX, e.clientY)}
                    className={\`absolute border \${selectedElement?.id === box.id ? 'border-red-500 bg-red-500/20' : 'border-indigo-500/40 bg-indigo-500/10'} rounded-md flex flex-col items-center justify-center \${mode === 'edit' ? 'cursor-move' : 'pointer-events-none'}\`}`
);

// Attach onClick to layout_elements
updated = updated.replace(
  `onMouseDown={(e) => startDrag(el, 'element', e.clientX, e.clientY)}
                    className={\`absolute border rounded flex items-center justify-center font-bold text-xs \${mode === 'edit' ? 'cursor-move' : 'pointer-events-none'} \${isStage ? 'bg-amber-900/30 border-amber-500 text-amber-200' : isBlocked ? 'bg-rose-900/30 border-rose-500 text-rose-200' : 'bg-emerald-900/30 border-emerald-500 text-emerald-200'}\`}`,
  `onClick={() => setSelectedElement({ id: el.id, type: 'element' })}
                    onMouseDown={(e) => startDrag(el, 'element', e.clientX, e.clientY)}
                    className={\`absolute border rounded flex items-center justify-center font-bold text-xs \${mode === 'edit' ? 'cursor-move' : 'pointer-events-none'} \${selectedElement?.id === el.id ? 'ring-2 ring-red-500' : ''} \${isStage ? 'bg-amber-900/30 border-amber-500 text-amber-200' : isBlocked ? 'bg-rose-900/30 border-rose-500 text-rose-200' : 'bg-emerald-900/30 border-emerald-500 text-emerald-200'}\`}`
);

// Add Delete Button in the Edit Panel
updated = updated.replace(
  `<div className="text-sm text-slate-300">المقعد: {selectedSeat?.seat_code || 'لا يوجد'}</div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input type="number" value={editSeatState.position_x} onChange={(e) => setEditSeatState((p) => ({ ...p, position_x: Number(e.target.value) }))} className="rounded-md px-3 py-2 bg-slate-800 border border-slate-700" placeholder="X" />
              <input type="number" value={editSeatState.position_y} onChange={(e) => setEditSeatState((p) => ({ ...p, position_y: Number(e.target.value) }))} className="rounded-md px-3 py-2 bg-slate-800 border border-slate-700" placeholder="Y" />
              <input type="number" value={editSeatState.row_number} onChange={(e) => setEditSeatState((p) => ({ ...p, row_number: Number(e.target.value) }))} className="rounded-md px-3 py-2 bg-slate-800 border border-slate-700" placeholder="Row" />
              <button disabled={!selectedSeatId || loading} onClick={saveSeatLayout} className="px-4 py-2 rounded-md bg-indigo-600 disabled:opacity-50">حفظ التعديل</button>
            </div>`,
  `<div className="flex justify-between items-center">
              <div className="text-sm text-slate-300">المحدد: {selectedElement?.id || 'لا يوجد'} ({selectedElement?.type || '-'})</div>
              {selectedElement && (
                <button onClick={() => handleDeleteElement(selectedElement.id, selectedElement.type)} className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition">حذف المحدد</button>
              )}
            </div>
            
            <div className="text-sm text-slate-300 mt-2 border-t border-slate-800 pt-2">المقعد: {selectedSeat?.seat_code || 'لا يوجد'}</div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input type="number" value={editSeatState.position_x} onChange={(e) => setEditSeatState((p) => ({ ...p, position_x: Number(e.target.value) }))} className="rounded-md px-3 py-2 bg-slate-800 border border-slate-700" placeholder="X" />
              <input type="number" value={editSeatState.position_y} onChange={(e) => setEditSeatState((p) => ({ ...p, position_y: Number(e.target.value) }))} className="rounded-md px-3 py-2 bg-slate-800 border border-slate-700" placeholder="Y" />
              <input type="number" value={editSeatState.row_number} onChange={(e) => setEditSeatState((p) => ({ ...p, row_number: Number(e.target.value) }))} className="rounded-md px-3 py-2 bg-slate-800 border border-slate-700" placeholder="Row" />
              <button disabled={!selectedSeatId || loading} onClick={saveSeatLayout} className="px-4 py-2 rounded-md bg-indigo-600 disabled:opacity-50">حفظ تعديل المقعد فقط</button>
            </div>`
);

fs.writeFileSync('e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx', updated);
console.log('Added Delete UI and Selection logic');
