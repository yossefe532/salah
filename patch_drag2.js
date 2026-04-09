import fs from 'fs';

let content = fs.readFileSync('e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx', 'utf-8');

content = content.replace(
  `const commitDraftHistory = (nextDraft: Record<string, { position_x: number; position_y: number }>) => {`,
  `const commitDraftHistory = (nextDraft: Record<string, { type: 'seat' | 'table' | 'element'; position_x: number; position_y: number }>) => {`
);

content = content.replace(
  `const startDrag = (seat: Seat, clientX: number, clientY: number) => {
    if (mode !== 'edit') return;
    const seatView = getSeatView(seat);
    setDragState({
      seatId: seat.id,
      startX: clientX,
      startY: clientY,
      originX: Number(seatView.position_x || 0),
      originY: Number(seatView.position_y || 0)
    });
  };`,
  `const startDrag = (item: any, type: 'seat' | 'table' | 'element', clientX: number, clientY: number) => {
    if (mode !== 'edit') return;
    const patch = layoutDraft[item.id];
    const originX = patch ? patch.position_x : Number(item.position_x || 0);
    const originY = patch ? patch.position_y : Number(item.position_y || 0);
    setDragState({
      id: item.id,
      type,
      startX: clientX,
      startY: clientY,
      originX,
      originY
    });
  };`
);

content = content.replace(
  `const onCanvasMove = (clientX: number, clientY: number) => {
    if (!dragState || mode !== 'edit') return;
    const dx = (clientX - dragState.startX) / 8;
    const dy = (clientY - dragState.startY) / 4;
    const nextDraft = {
      ...layoutDraft,
      [dragState.seatId]: {
        position_x: Math.max(0, Math.round((dragState.originX + dx) * 10) / 10),
        position_y: Math.max(0, Math.round((dragState.originY + dy) * 10) / 10)
      }
    };
    setLayoutDraft(nextDraft);
  };`,
  `const onCanvasMove = (clientX: number, clientY: number) => {
    if (!dragState || mode !== 'edit') return;
    const dx = (clientX - dragState.startX) / 8;
    const dy = (clientY - dragState.startY) / 4;
    
    const nextX = Math.max(0, Math.round((dragState.originX + dx) * 10) / 10);
    const nextY = Math.max(0, Math.round((dragState.originY + dy) * 10) / 10);
    
    const nextDraft = { ...layoutDraft };
    nextDraft[dragState.id] = { type: dragState.type, position_x: nextX, position_y: nextY };
    
    // If we drag a table, we should also drag its associated seats proportionally
    if (dragState.type === 'table') {
        const table = payload.tables.find(t => t.id === dragState.id);
        if (table) {
            const deltaX = nextX - Number(table.position_x || 0);
            const deltaY = nextY - Number(table.position_y || 0);
            payload.seats.filter(s => s.table_id === table.id).forEach(s => {
                const sPatch = layoutDraft[s.id];
                const sOrigX = Number(s.position_x || 0);
                const sOrigY = Number(s.position_y || 0);
                nextDraft[s.id] = { type: 'seat', position_x: sOrigX + deltaX, position_y: sOrigY + deltaY };
            });
        }
    }
    
    setLayoutDraft(nextDraft);
  };`
);

content = content.replace(
  `const endDrag = () => {
    if (!dragState) return;
    commitDraftHistory(layoutDraft);
    const seat = payload.seats.find((s) => s.id === dragState.seatId);
    const patch = layoutDraft[dragState.seatId];
    if (seat && patch) {
      setEditSeatState((prev) => ({
        ...prev,
        position_x: patch.position_x,
        position_y: patch.position_y
      }));
    }
    setDragState(null);
  };`,
  `const endDrag = () => {
    if (!dragState) return;
    commitDraftHistory(layoutDraft);
    if (dragState.type === 'seat') {
      const patch = layoutDraft[dragState.id];
      if (patch) {
        setEditSeatState((prev) => ({
          ...prev,
          position_x: patch.position_x,
          position_y: patch.position_y
        }));
      }
    }
    setDragState(null);
  };`
);

content = content.replace(
  `const publishLayoutDraft = async () => {
    const updates = Object.entries(layoutDraft).map(([id, val]) => ({
      id,
      position_x: val.position_x,
      position_y: val.position_y
    }));
    if (!updates.length) return;
    await api.post('/seating/update-layout', { event_id: eventId, updates });
    setLayoutDraft({});
    setHistory([{}]);
    setHistoryIndex(0);
    await loadMap();
  };`,
  `const publishLayoutDraft = async () => {
    const updates = Object.entries(layoutDraft).map(([id, val]) => ({
      id,
      type: val.type,
      position_x: val.position_x,
      position_y: val.position_y
    }));
    if (!updates.length) return;
    await api.post('/seating/update-layout', { event_id: eventId, updates });
    setLayoutDraft({});
    setHistory([{}]);
    setHistoryIndex(0);
    await loadMap();
  };`
);

content = content.replace(
  `const quickMove = (xDelta: number, yDelta: number) => {
    if (!selectedSeatId) return;
    const seat = payload.seats.find((s) => s.id === selectedSeatId);
    if (!seat) return;
    const current = layoutDraft[selectedSeatId] || { position_x: Number(seat.position_x || 0), position_y: Number(seat.position_y || 0) };
    const nextDraft = {
      ...layoutDraft,
      [selectedSeatId]: {
        position_x: Math.max(0, current.position_x + xDelta),
        position_y: Math.max(0, current.position_y + yDelta)
      }
    };
    setLayoutDraft(nextDraft);
    commitDraftHistory(nextDraft);
    setEditSeatState((prev) => ({
      ...prev,
      position_x: Math.max(0, prev.position_x + xDelta),
      position_y: Math.max(0, prev.position_y + yDelta)
    }));
  };`,
  `const quickMove = (xDelta: number, yDelta: number) => {
    if (!selectedSeatId) return;
    const seat = payload.seats.find((s) => s.id === selectedSeatId);
    if (!seat) return;
    const current = layoutDraft[selectedSeatId] || { type: 'seat', position_x: Number(seat.position_x || 0), position_y: Number(seat.position_y || 0) };
    const nextDraft = {
      ...layoutDraft,
      [selectedSeatId]: {
        type: 'seat',
        position_x: Math.max(0, current.position_x + xDelta),
        position_y: Math.max(0, current.position_y + yDelta)
      }
    };
    setLayoutDraft(nextDraft as any);
    commitDraftHistory(nextDraft as any);
    setEditSeatState((prev) => ({
      ...prev,
      position_x: Math.max(0, prev.position_x + xDelta),
      position_y: Math.max(0, prev.position_y + yDelta)
    }));
  };`
);

fs.writeFileSync('e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx', content);
console.log('Updated drag and drop logic');
