import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Seat, SeatTable } from '../types';

type SeatingMapPayload = {
  event_id: string;
  tables: SeatTable[];
  seats: Seat[];
};

type AttendeeLite = {
  id: string;
  full_name: string;
  governorate: string;
  seat_class: 'A' | 'B' | 'C';
  seat_number?: number | null;
  barcode?: string | null;
};

type LayoutVersionLite = {
  id: string;
  name: string;
  created_at: string;
};

const statusColor: Record<string, string> = {
  available: 'bg-emerald-500',
  booked: 'bg-rose-500',
  reserved: 'bg-amber-500',
  vip: 'bg-cyan-500'
};

const statusLabel: Record<string, string> = {
  available: 'متاح',
  booked: 'محجوز',
  reserved: 'مؤقت',
  vip: 'VIP'
};

const SeatingManagement: React.FC = () => {
  const [governorate, setGovernorate] = useState('Minya');
  const [eventId, setEventId] = useState('MINYA-2026-MAIN');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<SeatingMapPayload>({ event_id: 'MINYA-2026-MAIN', tables: [], seats: [] });
  const [attendees, setAttendees] = useState<AttendeeLite[]>([]);
  const [mode, setMode] = useState<'assign' | 'edit'>('assign');
  const [classFilter, setClassFilter] = useState<'A' | 'B' | 'C'>('A');
  const [selectedSeatId, setSelectedSeatId] = useState<string>('');
  const [selectedAttendeeId, setSelectedAttendeeId] = useState<string>('');
  const [swapA, setSwapA] = useState<string>('');
  const [swapB, setSwapB] = useState<string>('');
  const [adminConfig, setAdminConfig] = useState({
    classA_rows: 3,
    classA_tables_per_side: 3,
    classA_seats_per_table: 12,
    classB_rows: 3,
    classB_tables_per_side: 3,
    classB_seats_per_table: 12,
    classC_rows: 23,
    classC_seats_per_side_per_row: 8
  });
  const [editSeatState, setEditSeatState] = useState({ position_x: 0, position_y: 0, row_number: 1 });
  const [layoutDraft, setLayoutDraft] = useState<Record<string, { position_x: number; position_y: number }>>({});
  const [history, setHistory] = useState<Array<Record<string, { position_x: number; position_y: number }>>>([{}]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [dragState, setDragState] = useState<{
    seatId: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [versions, setVersions] = useState<LayoutVersionLite[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [versionName, setVersionName] = useState('');

  const loadMap = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.get(`/seating/map?eventId=${eventId}`);
      setPayload((data || { event_id: eventId, tables: [], seats: [] }) as SeatingMapPayload);
    } catch (e: any) {
      setError(e.message || 'فشل تحميل خريطة المقاعد');
    } finally {
      setLoading(false);
    }
  };

  const loadAttendees = async () => {
    try {
      const data = await api.get(`/seating/attendees?eventId=${eventId}`);
      setAttendees((Array.isArray(data) ? data : []) as AttendeeLite[]);
    } catch (e: any) {
      setError(e.message || 'فشل تحميل الحضور');
    }
  };

  const loadLayoutVersions = async () => {
    try {
      const data = await api.get(`/seating/layout-versions?eventId=${eventId}`);
      const items = Array.isArray(data) ? (data as LayoutVersionLite[]) : [];
      setVersions(items);
      if (items.length && !selectedVersionId) setSelectedVersionId(items[0].id);
    } catch (e: any) {
      setError(e.message || 'فشل تحميل نسخ التخطيط');
    }
  };

  useEffect(() => {
    setEventId(`${governorate.toUpperCase()}-2026-MAIN`);
  }, [governorate]);

  useEffect(() => {
    loadMap();
    loadAttendees();
    loadLayoutVersions();
    setLayoutDraft({});
    setHistory([{}]);
    setHistoryIndex(0);
  }, [eventId]);

  const mapSeats = useMemo(() => {
    return [...(payload.seats || [])].sort((a, b) => {
      const ay = Number(a.position_y || 0);
      const by = Number(b.position_y || 0);
      if (ay !== by) return ay - by;
      return Number(a.position_x || 0) - Number(b.position_x || 0);
    });
  }, [payload.seats]);

  const seatStats = useMemo(() => {
    const list = (payload.seats || []).filter((s) => s.seat_class === classFilter);
    return {
      total: list.length,
      available: list.filter((s) => s.status === 'available').length,
      booked: list.filter((s) => s.status === 'booked').length,
      reserved: list.filter((s) => s.status === 'reserved').length,
      vip: list.filter((s) => s.status === 'vip').length
    };
  }, [payload.seats, classFilter]);

  const tableBoxes = useMemo(() => {
    const seatsByTable = new Map<string, Seat[]>();
    for (const seat of payload.seats || []) {
      if (!seat.table_id) continue;
      const list = seatsByTable.get(seat.table_id) || [];
      const patch = layoutDraft[seat.id];
      list.push((patch ? { ...seat, position_x: patch.position_x, position_y: patch.position_y } : seat) as any);
      seatsByTable.set(seat.table_id, list as any);
    }
    const boxes: Array<{ id: string; x: number; y: number; w: number; h: number; cls: string }> = [];
    for (const table of payload.tables || []) {
      const list = seatsByTable.get(table.id) || [];
      if (!list.length) continue;
      const xs = list.map((s: any) => Number(s.position_x || 0));
      const ys = list.map((s: any) => Number(s.position_y || 0));
      const minX = Math.min(...xs) * 8 - 10;
      const maxX = Math.max(...xs) * 8 + 10;
      const minY = Math.min(...ys) * 4 - 10;
      const maxY = Math.max(...ys) * 4 + 10;
      boxes.push({
        id: table.id,
        x: minX,
        y: minY,
        w: Math.max(24, maxX - minX),
        h: Math.max(24, maxY - minY),
        cls: table.seat_class
      });
    }
    return boxes;
  }, [payload.seats, payload.tables, layoutDraft]);

  const selectedSeat = useMemo(() => payload.seats.find((s) => s.id === selectedSeatId) || null, [payload.seats, selectedSeatId]);
  const selectedSeatAttendee = useMemo(() => attendees.find((a) => a.id === selectedSeat?.attendee_id) || null, [attendees, selectedSeat?.attendee_id]);

  const getSeatView = (seat: Seat) => {
    const patch = layoutDraft[seat.id];
    if (!patch) return seat;
    return {
      ...seat,
      position_x: patch.position_x,
      position_y: patch.position_y
    };
  };

  useEffect(() => {
    if (!selectedSeat) return;
    setEditSeatState({
      position_x: Number(selectedSeat.position_x || 0),
      position_y: Number(selectedSeat.position_y || 0),
      row_number: Number(selectedSeat.row_number || 1)
    });
  }, [selectedSeatId]);

  const initHall = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.post('/seating/init', {
        event_id: eventId,
        governorate,
        classA: {
          rows: adminConfig.classA_rows,
          tables_per_side: adminConfig.classA_tables_per_side,
          seats_per_table: adminConfig.classA_seats_per_table
        },
        classB: {
          rows: adminConfig.classB_rows,
          tables_per_side: adminConfig.classB_tables_per_side,
          seats_per_table: adminConfig.classB_seats_per_table
        },
        classC: {
          rows: adminConfig.classC_rows,
          seats_per_side_per_row: adminConfig.classC_seats_per_side_per_row
        }
      });
      await Promise.all([loadMap(), loadAttendees()]);
    } catch (e: any) {
      setError(e.message || 'فشل إنشاء القاعة');
    } finally {
      setLoading(false);
    }
  };

  const assignSelected = async () => {
    if (!selectedSeatId || !selectedAttendeeId) return;
    try {
      setLoading(true);
      setError(null);
      await api.post('/seating/assign-attendee', { event_id: eventId, seat_id: selectedSeatId, attendee_id: selectedAttendeeId });
      await Promise.all([loadMap(), loadAttendees()]);
    } catch (e: any) {
      setError(e.message || 'فشل تسكين المشارك');
    } finally {
      setLoading(false);
    }
  };

  const autoAssign = async (cls?: 'A' | 'B' | 'C') => {
    try {
      setLoading(true);
      setError(null);
      await api.post('/seating/auto-assign', { event_id: eventId, seat_class: cls });
      await Promise.all([loadMap(), loadAttendees()]);
    } catch (e: any) {
      setError(e.message || 'فشل التسكين التلقائي');
    } finally {
      setLoading(false);
    }
  };

  const swapSeats = async () => {
    if (!swapA || !swapB) return;
    try {
      setLoading(true);
      setError(null);
      await api.post('/seating/swap-attendees', { event_id: eventId, attendee_a_id: swapA, attendee_b_id: swapB });
      await Promise.all([loadMap(), loadAttendees()]);
    } catch (e: any) {
      setError(e.message || 'فشل تبديل المقاعد');
    } finally {
      setLoading(false);
    }
  };

  const bookSelectedTable = async () => {
    if (!selectedSeat?.table_id) return;
    try {
      setLoading(true);
      setError(null);
      await api.post('/seating/book-table', { event_id: eventId, table_id: selectedSeat.table_id });
      await Promise.all([loadMap(), loadAttendees()]);
    } catch (e: any) {
      setError(e.message || 'فشل حجز الطاولة');
    } finally {
      setLoading(false);
    }
  };

  const saveLayoutVersion = async () => {
    try {
      setLoading(true);
      setError(null);
      await publishLayoutDraft();
      await api.post('/seating/layout-version/save', { event_id: eventId, name: versionName || undefined });
      setVersionName('');
      await loadLayoutVersions();
    } catch (e: any) {
      setError(e.message || 'فشل حفظ نسخة التخطيط');
    } finally {
      setLoading(false);
    }
  };

  const applyLayoutVersion = async () => {
    if (!selectedVersionId) return;
    try {
      setLoading(true);
      setError(null);
      await api.post('/seating/layout-version/apply', { event_id: eventId, version_id: selectedVersionId });
      setLayoutDraft({});
      setHistory([{}]);
      setHistoryIndex(0);
      await loadMap();
    } catch (e: any) {
      setError(e.message || 'فشل تطبيق نسخة التخطيط');
    } finally {
      setLoading(false);
    }
  };

  const publishLayoutDraft = async () => {
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
  };

  const undoLayout = () => {
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    setLayoutDraft(JSON.parse(JSON.stringify(history[nextIndex] || {})));
  };

  const redoLayout = () => {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    setLayoutDraft(JSON.parse(JSON.stringify(history[nextIndex] || {})));
  };

  const startDrag = (seat: Seat, clientX: number, clientY: number) => {
    if (mode !== 'edit') return;
    const seatView = getSeatView(seat);
    setDragState({
      seatId: seat.id,
      startX: clientX,
      startY: clientY,
      originX: Number(seatView.position_x || 0),
      originY: Number(seatView.position_y || 0)
    });
  };

  const onCanvasMove = (clientX: number, clientY: number) => {
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
  };

  const endDrag = () => {
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
  };

  const handleSeatClick = (seat: Seat) => {
    if (mode === 'assign' && seat.status === 'booked') return;
    setSelectedSeatId(seat.id);
  };

  const saveSeatLayout = async () => {
    if (!selectedSeatId) return;
    try {
      setLoading(true);
      setError(null);
      await api.post('/seating/update-layout', {
        event_id: eventId,
        updates: [{ id: selectedSeatId, ...editSeatState }]
      });
      await loadMap();
    } catch (e: any) {
      setError(e.message || 'فشل حفظ تعديل المقعد');
    } finally {
      setLoading(false);
    }
  };

  const commitDraftHistory = (nextDraft: Record<string, { position_x: number; position_y: number }>) => {
    const base = history.slice(0, historyIndex + 1);
    const cloned = JSON.parse(JSON.stringify(nextDraft || {}));
    const nextHistory = [...base, cloned];
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
  };

  const quickMove = (xDelta: number, yDelta: number) => {
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
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-6 space-y-4" dir="rtl">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">Seating Studio</h1>
            <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded-full border border-indigo-500/30">{eventId}</span>
            <span className="text-xs bg-slate-800 px-2 py-1 rounded-full border border-slate-700">Class {classFilter}</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-300">المحافظة</label>
            <select value={governorate} onChange={(e) => setGovernorate(e.target.value)} className="rounded-md px-3 py-2 bg-slate-800 border border-slate-700 text-sm">
              <option value="Minya">المنيا</option>
              <option value="Asyut">أسيوط</option>
              <option value="Sohag">سوهاج</option>
              <option value="Qena">قنا</option>
            </select>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2">
          <button onClick={() => setMode('assign')} className={`px-4 py-2 rounded-md text-sm border ${mode === 'assign' ? 'bg-indigo-600 border-indigo-500' : 'border-slate-700 bg-slate-800'}`}>مود التسكين</button>
          <button onClick={() => setMode('edit')} className={`px-4 py-2 rounded-md text-sm border ${mode === 'edit' ? 'bg-indigo-600 border-indigo-500' : 'border-slate-700 bg-slate-800'}`}>مود التعديل</button>
          <button onClick={initHall} className="px-4 py-2 rounded-md text-sm border border-slate-700 bg-slate-800">تهيئة القاعة</button>
          <button onClick={() => autoAssign()} className="px-4 py-2 rounded-md text-sm bg-emerald-600">تسكين تلقائي شامل</button>
          <button onClick={() => autoAssign(classFilter)} className="px-4 py-2 rounded-md text-sm border border-slate-700 bg-slate-800">تسكين تلقائي {classFilter}</button>
        </div>
        <div className="mt-2 grid grid-cols-2 md:grid-cols-6 gap-2">
          <button onClick={undoLayout} disabled={historyIndex <= 0} className="px-3 py-2 rounded-md text-sm border border-slate-700 bg-slate-800 disabled:opacity-50">Undo</button>
          <button onClick={redoLayout} disabled={historyIndex >= history.length - 1} className="px-3 py-2 rounded-md text-sm border border-slate-700 bg-slate-800 disabled:opacity-50">Redo</button>
          <button onClick={publishLayoutDraft} disabled={!Object.keys(layoutDraft).length || loading} className="px-3 py-2 rounded-md text-sm bg-indigo-600 disabled:opacity-50">نشر تعديلات التخطيط</button>
          <input value={versionName} onChange={(e) => setVersionName(e.target.value)} placeholder="اسم النسخة" className="px-3 py-2 rounded-md text-sm bg-slate-800 border border-slate-700" />
          <button onClick={saveLayoutVersion} className="px-3 py-2 rounded-md text-sm border border-slate-700 bg-slate-800">حفظ نسخة</button>
          <div className="flex gap-2">
            <select value={selectedVersionId} onChange={(e) => setSelectedVersionId(e.target.value)} className="flex-1 px-2 py-2 rounded-md text-sm bg-slate-800 border border-slate-700">
              <option value="">نسخ التخطيط</option>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
            <button onClick={applyLayoutVersion} disabled={!selectedVersionId} className="px-3 py-2 rounded-md text-sm border border-slate-700 bg-slate-800 disabled:opacity-50">تطبيق</button>
          </div>
        </div>
      </div>

      {error && <div className="p-3 rounded-md border border-rose-700 bg-rose-950/60 text-rose-200">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <button onClick={() => setClassFilter('A')} className={`px-3 py-2 rounded-md text-sm border ${classFilter === 'A' ? 'bg-indigo-600 border-indigo-500' : 'bg-slate-900 border-slate-700'}`}>Class A</button>
        <button onClick={() => setClassFilter('B')} className={`px-3 py-2 rounded-md text-sm border ${classFilter === 'B' ? 'bg-indigo-600 border-indigo-500' : 'bg-slate-900 border-slate-700'}`}>Class B</button>
        <button onClick={() => setClassFilter('C')} className={`px-3 py-2 rounded-md text-sm border ${classFilter === 'C' ? 'bg-indigo-600 border-indigo-500' : 'bg-slate-900 border-slate-700'}`}>Class C</button>
        <div className="px-3 py-2 rounded-md bg-slate-900 border border-slate-700 text-sm">الإجمالي: {seatStats.total}</div>
        <div className="px-3 py-2 rounded-md bg-slate-900 border border-slate-700 text-sm">المتاح: {seatStats.available}</div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-9 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm text-slate-300">لوحة القاعة التفاعلية</div>
            <div className="text-xs text-slate-400">دبل كليك على المقعد في مود التعديل لتحديده ثم تعديل مكانه</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-2">
            <div className="h-12 rounded-md border border-indigo-800 bg-indigo-900/30 text-center font-bold flex items-center justify-center">STAGE / المسرح</div>
            <div
              className="relative mt-3 rounded-md border border-slate-800 overflow-auto"
              onMouseMove={(e) => onCanvasMove(e.clientX, e.clientY)}
              onMouseUp={endDrag}
              onMouseLeave={endDrag}
              style={{
                height: 560,
                backgroundImage:
                  'linear-gradient(to right, rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.08) 1px, transparent 1px)',
                backgroundSize: '24px 24px'
              }}
            >
              {tableBoxes.map((box) => (
                <div
                  key={box.id}
                  className="absolute border border-white/20 rounded-md bg-white/[0.03] pointer-events-none"
                  style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
                  title={box.id}
                />
              ))}
              {mapSeats.map((seat) => {
                const seatView = getSeatView(seat);
                const selected = selectedSeatId === seat.id;
                return (
                  <button
                    key={seat.id}
                    onClick={() => handleSeatClick(seat)}
                    onMouseDown={(e) => startDrag(seat, e.clientX, e.clientY)}
                    className={`absolute text-[10px] w-10 h-10 rounded-full border border-white/20 flex flex-col items-center justify-center text-white ${selected ? 'bg-blue-600 ring-2 ring-blue-300 scale-110 z-10' : (statusColor[seat.status] || 'bg-slate-500')}`}
                    style={{
                      left: `${Number(seatView.position_x || 0) * 8}px`,
                      top: `${Number(seatView.position_y || 0) * 4}px`
                    }}
                    title={`${seat.seat_code} - ${statusLabel[seat.status] || seat.status}`}
                  >
                    <span className="leading-none">{seat.seat_number}</span>
                    <span className="leading-none text-[8px] opacity-90">{seat.seat_class}</span>
                  </button>
                );
              })}
              <div className="absolute top-[110px] left-4 text-xs text-indigo-200 bg-indigo-900/40 border border-indigo-700/50 px-2 py-1 rounded pointer-events-none">CLASS A</div>
              <div className="absolute top-[265px] left-4 text-xs text-indigo-200 bg-indigo-900/40 border border-indigo-700/50 px-2 py-1 rounded pointer-events-none">CLASS B</div>
              <div className="absolute top-[430px] left-4 text-xs text-indigo-200 bg-indigo-900/40 border border-indigo-700/50 px-2 py-1 rounded pointer-events-none">CLASS C</div>
              <div className="absolute top-10 left-6 text-[11px] text-slate-300 pointer-events-none">LEFT SECTION</div>
              <div className="absolute top-10 right-6 text-[11px] text-slate-300 pointer-events-none">RIGHT SECTION</div>
              <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-7 bg-white/10 border-x border-white/20 pointer-events-none" />
              <div className="absolute top-16 left-8 w-5 h-20 bg-white/20 rounded pointer-events-none" />
              <div className="absolute top-16 right-8 w-5 h-20 bg-white/20 rounded pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="xl:col-span-3 space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="text-sm font-bold mb-3">الـ Legend</h2>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-emerald-500" /> متاح ({seatStats.available})</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-rose-500" /> محجوز ({seatStats.booked})</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-amber-500" /> مؤقت ({seatStats.reserved})</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-cyan-500" /> VIP ({seatStats.vip})</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-600" /> Selected</div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
            <h2 className="text-sm font-bold">إعدادات القاعة السريعة</h2>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" value={adminConfig.classA_rows} onChange={(e) => setAdminConfig(prev => ({ ...prev, classA_rows: Number(e.target.value) }))} className="rounded-md px-2 py-2 bg-slate-800 border border-slate-700 text-sm" placeholder="Rows A" />
              <input type="number" value={adminConfig.classA_tables_per_side} onChange={(e) => setAdminConfig(prev => ({ ...prev, classA_tables_per_side: Number(e.target.value) }))} className="rounded-md px-2 py-2 bg-slate-800 border border-slate-700 text-sm" placeholder="Tables A" />
              <input type="number" value={adminConfig.classB_rows} onChange={(e) => setAdminConfig(prev => ({ ...prev, classB_rows: Number(e.target.value) }))} className="rounded-md px-2 py-2 bg-slate-800 border border-slate-700 text-sm" placeholder="Rows B" />
              <input type="number" value={adminConfig.classC_rows} onChange={(e) => setAdminConfig(prev => ({ ...prev, classC_rows: Number(e.target.value) }))} className="rounded-md px-2 py-2 bg-slate-800 border border-slate-700 text-sm" placeholder="Rows C" />
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="text-sm font-bold mb-2">المقعد المختار</h2>
            <div className="text-xs text-slate-300">الكود: {selectedSeat?.seat_code || '-'}</div>
            <div className="text-xs text-slate-300">الحالة: {selectedSeat ? (statusLabel[selectedSeat.status] || selectedSeat.status) : '-'}</div>
            <div className="text-xs text-slate-300">المشارك: {selectedSeatAttendee?.full_name || '-'}</div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        {mode === 'edit' && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
            <h2 className="font-semibold text-white">مود التعديل</h2>
            <div className="text-sm text-slate-300">المقعد: {selectedSeat?.seat_code || 'لا يوجد'}</div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input type="number" value={editSeatState.position_x} onChange={(e) => setEditSeatState((p) => ({ ...p, position_x: Number(e.target.value) }))} className="rounded-md px-3 py-2 bg-slate-800 border border-slate-700" placeholder="X" />
              <input type="number" value={editSeatState.position_y} onChange={(e) => setEditSeatState((p) => ({ ...p, position_y: Number(e.target.value) }))} className="rounded-md px-3 py-2 bg-slate-800 border border-slate-700" placeholder="Y" />
              <input type="number" value={editSeatState.row_number} onChange={(e) => setEditSeatState((p) => ({ ...p, row_number: Number(e.target.value) }))} className="rounded-md px-3 py-2 bg-slate-800 border border-slate-700" placeholder="Row" />
              <button disabled={!selectedSeatId || loading} onClick={saveSeatLayout} className="px-4 py-2 rounded-md bg-indigo-600 disabled:opacity-50">حفظ التعديل</button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => quickMove(-1, 0)} className="px-3 py-1 border border-slate-700 rounded bg-slate-800">⬅</button>
              <button onClick={() => quickMove(1, 0)} className="px-3 py-1 border border-slate-700 rounded bg-slate-800">➡</button>
              <button onClick={() => quickMove(0, -1)} className="px-3 py-1 border border-slate-700 rounded bg-slate-800">⬆</button>
              <button onClick={() => quickMove(0, 1)} className="px-3 py-1 border border-slate-700 rounded bg-slate-800">⬇</button>
            </div>
          </div>
        )}

        {mode === 'assign' && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
            <h2 className="font-semibold text-white">مود التسكين</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <select value={selectedAttendeeId} onChange={(e) => setSelectedAttendeeId(e.target.value)} className="rounded-md px-3 py-2 bg-slate-800 border border-slate-700">
                <option value="">اختر مشارك ({classFilter} - {governorate})</option>
                {attendees
                  .filter((a) => a.seat_class === classFilter)
                  .map((a) => (
                    <option key={a.id} value={a.id}>{a.full_name}</option>
                  ))}
              </select>
              <input value={selectedSeat?.seat_code || ''} readOnly className="rounded-md px-3 py-2 bg-slate-800 border border-slate-700" placeholder="المقعد المختار" />
              <button disabled={!selectedSeatId || !selectedAttendeeId || loading} onClick={assignSelected} className="px-4 py-2 rounded-md bg-emerald-600 disabled:opacity-50">تسكين مباشر</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <select value={swapA} onChange={(e) => setSwapA(e.target.value)} className="rounded-md px-3 py-2 bg-slate-800 border border-slate-700">
                <option value="">المشارك الأول للتبديل</option>
                {attendees.filter((a) => a.seat_class === classFilter).map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
              </select>
              <select value={swapB} onChange={(e) => setSwapB(e.target.value)} className="rounded-md px-3 py-2 bg-slate-800 border border-slate-700">
                <option value="">المشارك الثاني للتبديل</option>
                {attendees.filter((a) => a.seat_class === classFilter).map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
              </select>
              <button disabled={!swapA || !swapB || loading} onClick={swapSeats} className="px-4 py-2 rounded-md border border-slate-700 bg-slate-800 disabled:opacity-50">تبديل مقعدين</button>
            </div>
            <button
              disabled={!selectedSeat?.table_id || loading}
              onClick={bookSelectedTable}
              className="px-4 py-2 rounded-md bg-indigo-600 disabled:opacity-50"
            >
              حجز الطاولة كاملة ({selectedSeat?.table_id ? 'متاحة' : 'اختر مقعد داخل طاولة'})
            </button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="text-sm font-bold mb-3">الحضور في القاعة الحالية</h2>
        <div className="max-h-56 overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="text-right p-2">الاسم</th>
                <th className="text-right p-2">Class</th>
                <th className="text-right p-2">المقعد</th>
                <th className="text-right p-2">Barcode</th>
              </tr>
            </thead>
            <tbody>
              {attendees
                .filter((a) => a.seat_class === classFilter)
                .map((a) => (
                  <tr key={a.id} className="border-t border-slate-800">
                    <td className="p-2">{a.full_name}</td>
                    <td className="p-2">{a.seat_class}</td>
                    <td className="p-2">{a.seat_number || '-'}</td>
                    <td className="p-2">{a.barcode || '-'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SeatingManagement;
