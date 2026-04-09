import fs from 'fs';

const smPath = 'e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx';
let smContent = fs.readFileSync(smPath, 'utf-8');

smContent = smContent.replace(
  `<button onClick={initHall} className="px-4 py-2 rounded-md text-sm border border-slate-700 bg-slate-800">تهيئة ذكية للقاعة</button>`,
  `<button onClick={initHall} className="px-4 py-2 rounded-md text-sm border border-slate-700 bg-slate-800">تهيئة ذكية للقاعة</button>
          <button onClick={async () => {
             if (!window.confirm('هل أنت متأكد من تسكين جميع العملاء المتبقين عشوائياً؟')) return;
             try {
                setLoading(true);
                const eligible = attendees.filter(a => !a.seat_number);
                for (const a of eligible) {
                   await api.post('/seating/auto-assign', { event_id: eventId, attendee_id: a.id });
                }
                await loadMap();
             } catch(e: any) { alert(e.message); }
             finally { setLoading(false); }
          }} className="px-4 py-2 rounded-md text-sm border border-slate-700 bg-slate-800 text-blue-400">تسكين تلقائي للكل</button>`
);

smContent = smContent.replace(
  `<button onClick={() => handleAddElement('table', 'A')} className="px-2 py-1 bg-indigo-600 text-xs rounded">+ Table A</button>`,
  `<button onClick={() => handleAddElement('table', 'A')} className="px-2 py-1 bg-indigo-600 text-xs rounded">+ Table A</button>
                 <button onClick={() => handleAddElement('seat', 'A')} className="px-2 py-1 bg-indigo-600 text-xs rounded">+ Chair A</button>`
);

smContent = smContent.replace(
  `<button onClick={() => handleAddElement('table', 'B')} className="px-2 py-1 bg-indigo-600 text-xs rounded">+ Table B</button>`,
  `<button onClick={() => handleAddElement('table', 'B')} className="px-2 py-1 bg-indigo-600 text-xs rounded">+ Table B</button>
                 <button onClick={() => handleAddElement('seat', 'B')} className="px-2 py-1 bg-indigo-600 text-xs rounded">+ Chair B</button>`
);

fs.writeFileSync(smPath, smContent);
console.log('Added auto-assign all and single chair buttons');
