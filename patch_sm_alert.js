import fs from 'fs';

const smPath = 'e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx';
let smContent = fs.readFileSync(smPath, 'utf-8');

smContent = smContent.replace(
  `const initHall = async () => {
    try {
      setLoading(true);
      await api.post('/seating/init', { event_id: eventId, governorate, classA: adminConfig.classA, classB: adminConfig.classB, classC: adminConfig.classC });
      await loadMap();
    } catch(e: any) {
      setError(e.message || 'فشل تهيئة القاعة');
    } finally {
      setLoading(false);
    }
  };`,
  `const initHall = async () => {
    try {
      setLoading(true);
      await api.post('/seating/init', { event_id: eventId, governorate, classA: adminConfig.classA, classB: adminConfig.classB, classC: adminConfig.classC });
      await loadMap();
    } catch(e: any) {
      setError(e.message || 'فشل تهيئة القاعة');
      alert('حدث خطأ أثناء تهيئة القاعة: ' + e.message);
    } finally {
      setLoading(false);
    }
  };`
);

fs.writeFileSync(smPath, smContent);
console.log('Added alert for init error');
