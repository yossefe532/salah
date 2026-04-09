import fs from 'fs';

const content = fs.readFileSync('e:\\شغل\\شغل\\ص\\src\\lib\\api.ts', 'utf-8');

let updated = content.replace(
  `await supabase.from('layout_elements').insert([{`,
  `const { error } = await supabase.from('layout_elements').insert([{`
);

updated = updated.replace(
  `label: type.toUpperCase()
        }]);`,
  `label: type.toUpperCase()
        }]);
        if (error) throw new Error("قاعدة البيانات لم يتم تحديثها. يجب تشغيل السكربت SQL في Supabase أولاً.");`
);

updated = updated.replace(
  `await supabase.from('seat_tables').insert([{`,
  `const { error: tableErr } = await supabase.from('seat_tables').insert([{`
);

updated = updated.replace(
  `height: 8
        }]);`,
  `height: 8
        }]);
        if (tableErr) throw new Error("قاعدة البيانات لم يتم تحديثها. يجب تشغيل السكربت SQL في Supabase أولاً.");`
);

updated = updated.replace(
  `await supabase.from('seats').insert(seats);`,
  `const { error: seatsErr } = await supabase.from('seats').insert(seats);
        if (seatsErr) throw new Error("قاعدة البيانات لم يتم تحديثها. يجب تشغيل السكربت SQL في Supabase أولاً.");`
);

fs.writeFileSync('e:\\شغل\\شغل\\ص\\src\\lib\\api.ts', updated);
console.log('Fixed API to throw errors');
