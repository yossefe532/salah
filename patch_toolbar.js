import fs from 'fs';

const fileContent = fs.readFileSync('e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx', 'utf-8');

let updated = fileContent.replace(
  `{mode === 'edit' && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
            <h2 className="font-semibold text-white">مود التعديل</h2>
            <div className="text-sm text-slate-300">المقعد: {selectedSeat?.seat_code || 'لا يوجد'}</div>`,
  `{mode === 'edit' && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="font-semibold text-white">مود التعديل</h2>
              <div className="flex gap-2">
                 <button onClick={() => alert('Add Table A')} className="px-2 py-1 bg-indigo-600 text-xs rounded">+ Table A</button>
                 <button onClick={() => alert('Add Table B')} className="px-2 py-1 bg-indigo-600 text-xs rounded">+ Table B</button>
                 <button onClick={() => alert('Add Wave (Class C)')} className="px-2 py-1 bg-indigo-600 text-xs rounded">+ Wave</button>
                 <button onClick={() => alert('Add Stage')} className="px-2 py-1 bg-amber-600 text-xs rounded">+ Stage</button>
                 <button onClick={() => alert('Add Blocked')} className="px-2 py-1 bg-rose-600 text-xs rounded">+ Blocked</button>
                 <button onClick={() => alert('Add Allowed')} className="px-2 py-1 bg-emerald-600 text-xs rounded">+ Allowed</button>
              </div>
            </div>
            <div className="text-sm text-slate-300">المقعد: {selectedSeat?.seat_code || 'لا يوجد'}</div>`
);

fs.writeFileSync('e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx', updated);
console.log('Added Toolbar');
