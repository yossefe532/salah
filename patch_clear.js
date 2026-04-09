import fs from 'fs';

const content = fs.readFileSync('e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx', 'utf-8');

let updated = content.replace(
  `const handleAddElement = async (type: string, cls?: string) => {
    try {
      setLoading(true);
      await api.post('/seating/add-element', { event_id: eventId, governorate, type, seat_class: cls });
      await loadMap();
    } catch(e: any) {
      setError(e.message || 'Failed to add element');
    } finally {
      setLoading(false);
    }
  };`,
  `const handleAddElement = async (type: string, cls?: string) => {
    try {
      setLoading(true);
      await api.post('/seating/add-element', { event_id: eventId, governorate, type, seat_class: cls });
      await loadMap();
    } catch(e: any) {
      setError(e.message || 'Failed to add element');
    } finally {
      setLoading(false);
    }
  };
  
  const handleClearMap = async () => {
     if (!window.confirm('هل أنت متأكد من مسح جميع العناصر من الخريطة؟ هذا الإجراء لا يمكن التراجع عنه.')) return;
     try {
        setLoading(true);
        const elements = payload.layout_elements || [];
        const tables = payload.tables || [];
        const waves = [...new Set((payload.seats || []).filter(s => s.wave_number).map(s => s.wave_number))];
        const looseSeats = (payload.seats || []).filter(s => !s.table_id && !s.wave_number);
        
        for (const el of elements) {
           await api.post('/seating/delete-element', { event_id: eventId, id: el.id, type: 'element' });
        }
        for (const t of tables) {
           await api.post('/seating/delete-element', { event_id: eventId, id: t.id, type: 'table' });
        }
        for (const w of waves) {
           await api.post('/seating/delete-element', { event_id: eventId, id: w, type: 'wave' });
        }
        for (const s of looseSeats) {
           await api.post('/seating/delete-element', { event_id: eventId, id: s.id, type: 'seat' });
        }
        await loadMap();
     } catch(e: any) {
        setError(e.message || 'فشل مسح الخريطة');
     } finally {
        setLoading(false);
     }
  };`
);

updated = updated.replace(
  `<button onClick={initHall} className="px-4 py-2 rounded-md text-sm border border-slate-700 bg-slate-800">تهيئة القاعة</button>`,
  `<button onClick={initHall} className="px-4 py-2 rounded-md text-sm border border-slate-700 bg-slate-800">تهيئة ذكية للقاعة</button>
          <button onClick={handleClearMap} className="px-4 py-2 rounded-md text-sm bg-red-600">تفريغ الخريطة بالكامل</button>`
);

fs.writeFileSync('e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx', updated);
console.log('Added Clear Map capability');
