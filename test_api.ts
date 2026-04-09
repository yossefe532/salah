import { api } from './src/lib/api.ts';

async function test() {
  try {
    console.log('Testing init...');
    const res = await api.post('/seating/init', { event_id: 'MINYA-2026-MAIN', governorate: 'Minya' });
    console.log('Success:', res);
  } catch(e) {
    console.error('Error:', e.message);
  }
}
test();