import fs from 'fs';

let content = fs.readFileSync('e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx', 'utf-8');

content = content.replace(
  `<button onClick={() => alert('Add Table A')} className="px-2 py-1 bg-indigo-600 text-xs rounded">+ Table A</button>
                 <button onClick={() => alert('Add Table B')} className="px-2 py-1 bg-indigo-600 text-xs rounded">+ Table B</button>
                 <button onClick={() => alert('Add Wave (Class C)')} className="px-2 py-1 bg-indigo-600 text-xs rounded">+ Wave</button>
                 <button onClick={() => alert('Add Stage')} className="px-2 py-1 bg-amber-600 text-xs rounded">+ Stage</button>
                 <button onClick={() => alert('Add Blocked')} className="px-2 py-1 bg-rose-600 text-xs rounded">+ Blocked</button>
                 <button onClick={() => alert('Add Allowed')} className="px-2 py-1 bg-emerald-600 text-xs rounded">+ Allowed</button>`,
  `<button onClick={() => handleAddElement('table', 'A')} className="px-2 py-1 bg-indigo-600 text-xs rounded">+ Table A</button>
                 <button onClick={() => handleAddElement('table', 'B')} className="px-2 py-1 bg-indigo-600 text-xs rounded">+ Table B</button>
                 <button onClick={() => handleAddElement('wave', 'C')} className="px-2 py-1 bg-indigo-600 text-xs rounded">+ Wave</button>
                 <button onClick={() => handleAddElement('stage')} className="px-2 py-1 bg-amber-600 text-xs rounded">+ Stage</button>
                 <button onClick={() => handleAddElement('blocked')} className="px-2 py-1 bg-rose-600 text-xs rounded">+ Blocked</button>
                 <button onClick={() => handleAddElement('allowed')} className="px-2 py-1 bg-emerald-600 text-xs rounded">+ Allowed</button>`
);

content = content.replace(
  `const startDrag = (item: any, type: 'seat' | 'table' | 'element', clientX: number, clientY: number) => {`,
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

  const startDrag = (item: any, type: 'seat' | 'table' | 'element', clientX: number, clientY: number) => {`
);

fs.writeFileSync('e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx', content);
console.log('Added handleAddElement');
