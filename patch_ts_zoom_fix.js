import fs from 'fs';

const smPath = 'e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx';
let smContent = fs.readFileSync(smPath, 'utf-8');

smContent = smContent.replace(
  /startDrag\(\{ id: box\.id, position_x: box\.x\/8, position_y: box\.y\/4 \}, 'table', e\.clientX, e\.clientY, e\.currentTarget, zoomLevel\);/g,
  `startDrag({ id: box.id, position_x: box.x/8, position_y: box.y/4 }, 'table', e.clientX, e.clientY, e.currentTarget);`
);

smContent = smContent.replace(
  /startDrag\(el, 'element', e\.clientX, e\.clientY, e\.currentTarget, zoomLevel\);/g,
  `startDrag(el, 'element', e.clientX, e.clientY, e.currentTarget);`
);

smContent = smContent.replace(
  /startDrag\(seat, 'seat', e\.clientX, e\.clientY, e\.currentTarget, zoomLevel\);/g,
  `startDrag(seat, 'seat', e.clientX, e.clientY, e.currentTarget);`
);

smContent = smContent.replace(
  `const startDrag = (item: any, type: 'seat' | 'table' | 'element', clientX: number, clientY: number, currentTarget: HTMLElement, currentZoom: number) => {`,
  `const startDrag = (item: any, type: 'seat' | 'table' | 'element', clientX: number, clientY: number, currentTarget: HTMLElement) => {
    const currentZoom = (window as any).currentZoomLevel || 1;`
);

smContent = smContent.replace(
  `const [zoomLevel, setZoomLevel] = useState<number>(1);`,
  `const [zoomLevel, setZoomLevel] = useState<number>(1);
  useEffect(() => { (window as any).currentZoomLevel = zoomLevel; }, [zoomLevel]);`
);

fs.writeFileSync(smPath, smContent);
console.log('Fixed TS zoom scope the react way');
