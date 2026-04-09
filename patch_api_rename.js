import fs from 'fs';

const apiPath = 'e:\\شغل\\شغل\\ص\\src\\lib\\api.ts';
let apiContent = fs.readFileSync(apiPath, 'utf-8');

apiContent = apiContent.replace(
  `if (endpoint === '/seating/delete-element') {`,
  `if (endpoint === '/seating/update-table-id') {
      const { old_id, new_id } = body || {};
      if (!old_id || !new_id) throw new Error('بيانات غير مكتملة');
      
      // Update table ID
      const { error: tErr } = await supabase.from('seat_tables').update({ id: new_id, table_order: parseInt(new_id.split('-T')[1]) || 0 }).eq('id', old_id);
      if (tErr) throw new Error(tErr.message);
      
      // Update associated seats
      const { data: seats } = await supabase.from('seats').select('id, seat_code').eq('table_id', old_id);
      for (const s of seats || []) {
        const newCode = s.seat_code.replace(old_id.split('-T')[1], new_id.split('-T')[1]);
        const newSeatId = s.id.replace(old_id, new_id);
        await supabase.from('seats').update({ id: newSeatId, table_id: new_id, seat_code: newCode }).eq('id', s.id);
      }
      return { success: true };
    }
    
    if (endpoint === '/seating/delete-element') {`
);

fs.writeFileSync(apiPath, apiContent);
console.log('Added table rename API endpoint');
