import fs from 'fs';

const smPath = 'e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx';
let smContent = fs.readFileSync(smPath, 'utf-8');

smContent = smContent.replace(
  `const startDrag = (item: any, type: 'seat' | 'table' | 'element', clientX: number, clientY: number, currentTarget: HTMLElement) => {
    if (mode !== 'edit') return;
    const patch = layoutDraft[item.id];
    const originX = patch ? patch.position_x : Number(item.position_x || 0);
    const originY = patch ? patch.position_y : Number(item.position_y || 0);
    
    let seatOrigins: Record<string, {x: number, y: number}> = {};
    if (type === 'table') {
      payload.seats.filter(s => s.table_id === item.id).forEach(s => {
        const sPatch = layoutDraft[s.id];
        seatOrigins[s.id] = {
          x: sPatch ? sPatch.position_x : Number(s.position_x || 0),
          y: sPatch ? sPatch.position_y : Number(s.position_y || 0)
        };
      });
    }

    const rect = currentTarget.closest('.overflow-auto')?.children[0].getBoundingClientRect();
    const scaledX = rect ? (clientX - rect.left) / zoomLevel : clientX;
    const scaledY = rect ? (clientY - rect.top) / zoomLevel : clientY;`,
  `const startDrag = (item: any, type: 'seat' | 'table' | 'element', clientX: number, clientY: number, currentTarget: HTMLElement, currentZoom: number) => {
    if (mode !== 'edit') return;
    const patch = layoutDraft[item.id];
    const originX = patch ? patch.position_x : Number(item.position_x || 0);
    const originY = patch ? patch.position_y : Number(item.position_y || 0);
    
    let seatOrigins: Record<string, {x: number, y: number}> = {};
    if (type === 'table') {
      payload.seats.filter(s => s.table_id === item.id).forEach(s => {
        const sPatch = layoutDraft[s.id];
        seatOrigins[s.id] = {
          x: sPatch ? sPatch.position_x : Number(s.position_x || 0),
          y: sPatch ? sPatch.position_y : Number(s.position_y || 0)
        };
      });
    }

    const rect = currentTarget.closest('.overflow-auto')?.children[0].getBoundingClientRect();
    const scaledX = rect ? (clientX - rect.left) / currentZoom : clientX;
    const scaledY = rect ? (clientY - rect.top) / currentZoom : clientY;`
);

smContent = smContent.replace(
  `startDrag({ id: box.id, position_x: box.x/8, position_y: box.y/4 }, 'table', e.clientX, e.clientY, e.currentTarget);`,
  `startDrag({ id: box.id, position_x: box.x/8, position_y: box.y/4 }, 'table', e.clientX, e.clientY, e.currentTarget, zoomLevel);`
);

smContent = smContent.replace(
  `startDrag(el, 'element', e.clientX, e.clientY, e.currentTarget);`,
  `startDrag(el, 'element', e.clientX, e.clientY, e.currentTarget, zoomLevel);`
);

smContent = smContent.replace(
  `startDrag(seat, 'seat', e.clientX, e.clientY, e.currentTarget);`,
  `startDrag(seat, 'seat', e.clientX, e.clientY, e.currentTarget, zoomLevel);`
);

fs.writeFileSync(smPath, smContent);
console.log('Fixed TS zoomLevel scope');
