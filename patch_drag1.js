import fs from 'fs';

const fileContent = fs.readFileSync('e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx', 'utf-8');

let updated = fileContent.replace(
  `const [dragState, setDragState] = useState<{
    seatId: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);`,
  `const [dragState, setDragState] = useState<{
    id: string;
    type: 'seat' | 'table' | 'element';
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);`
);

updated = updated.replace(
  `const [layoutDraft, setLayoutDraft] = useState<Record<string, { position_x: number; position_y: number }>>({});`,
  `const [layoutDraft, setLayoutDraft] = useState<Record<string, { type: 'seat' | 'table' | 'element'; position_x: number; position_y: number }>>({});`
);

updated = updated.replace(
  `const [history, setHistory] = useState<Array<Record<string, { position_x: number; position_y: number }>>>([{}]);`,
  `const [history, setHistory] = useState<Array<Record<string, { type: 'seat' | 'table' | 'element'; position_x: number; position_y: number }>>>([{}]);`
);

fs.writeFileSync('e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx', updated);
console.log('Updated state definitions');
