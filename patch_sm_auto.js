import fs from 'fs';

const smPath = 'e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx';
let smContent = fs.readFileSync(smPath, 'utf-8');

smContent = smContent.replace(
  `for (const a of eligible) {
                   await api.post('/seating/auto-assign', { event_id: eventId, attendee_id: a.id });
                }`,
  `await api.post('/seating/auto-assign-all', { event_id: eventId });`
);

fs.writeFileSync(smPath, smContent);
console.log('Optimized UI auto-assign-all');
