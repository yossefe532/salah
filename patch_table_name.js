import fs from 'fs';

const smPath = 'e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx';
let smContent = fs.readFileSync(smPath, 'utf-8');

smContent = smContent.replace(
  `{selectedElement && (
                <button onClick={() => handleDeleteElement(selectedElement.id, selectedElement.type)} className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition">حذف المحدد</button>
              )}
            </div>
            
            <div className="text-sm text-slate-300 mt-2 border-t border-slate-800 pt-2">المقعد: {selectedSeat?.seat_code || 'لا يوجد'}</div>`,
  `{selectedElement && (
                <button onClick={() => handleDeleteElement(selectedElement.id, selectedElement.type)} className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition">حذف المحدد</button>
              )}
            </div>
            
            {selectedElement?.type === 'table' && (
               <div className="flex gap-2 items-center text-sm text-slate-300 mt-2 border-t border-slate-800 pt-2">
                 <span>تغيير اسم الطاولة:</span>
                 <input 
                   type="text" 
                   defaultValue={selectedElement.id.split('-T')[1]} 
                   onBlur={async (e) => {
                     const newNum = e.target.value;
                     if (!newNum || newNum === selectedElement.id.split('-T')[1]) return;
                     try {
                        const newId = selectedElement.id.split('-T')[0] + '-T' + newNum;
                        setLoading(true);
                        await api.post('/seating/update-table-id', { old_id: selectedElement.id, new_id: newId });
                        setSelectedElement({ id: newId, type: 'table' });
                        await loadMap();
                     } catch(err: any) { alert(err.message); }
                     finally { setLoading(false); }
                   }} 
                   className="rounded px-2 py-1 bg-slate-800 w-20 text-white border border-slate-700" 
                 />
               </div>
            )}
            
            <div className="text-sm text-slate-300 mt-2 border-t border-slate-800 pt-2">المقعد: {selectedSeat?.seat_code || 'لا يوجد'}</div>`
);

fs.writeFileSync(smPath, smContent);
console.log('Added table name edit UI');
