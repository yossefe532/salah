import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { api } from '../lib/api';
import { Seat, SeatTable } from '../types';

import { LayoutElement } from '../types';

type SeatingMapPayload = {
  event_id: string;
  tables: SeatTable[];
  seats: Seat[];
  layout_elements?: LayoutElement[];
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

const SeatNode = React.memo(({ seat, selected, mode, onSeatClick, onSeatDoubleClick, onDragStart }: any) => {
  return (
    <button
      onClick={(e) => {
         e.stopPropagation();
         onSeatClick(seat);
      }}
      onDoubleClick={(e) => {
         e.stopPropagation();
         onSeatDoubleClick(seat);
      }}
      onMouseDown={(e) => {
         e.stopPropagation();
         onDragStart(seat, 'seat', e.clientX, e.clientY, e.currentTarget);
      }}
      className={`absolute text-[8px] w-6 h-6 rounded-full border border-white/20 flex flex-col items-center justify-center text-white ${selected ? 'bg-blue-600 ring-2 ring-blue-300 scale-110 z-10' : (statusColor[seat.status] || 'bg-slate-500')} ${mode === 'edit' ? 'cursor-move' : ''}`}
      style={{
        left: `${Number(seat.position_x || 0) * 8}px`,
        top: `${Number(seat.position_y || 0) * 4}px`
      }}
      title={`${seat.seat_code} - ${statusLabel[seat.status] || seat.status}`}
    >
      <span className="leading-none font-bold text-[9px]">{seat.seat_number}</span>
      <span className="leading-none text-[6px] opacity-80">{seat.seat_class}</span>
    </button>
  );
}, (prev, next) => {
  return prev.seat.position_x === next.seat.position_x &&
         prev.seat.position_y === next.seat.position_y &&
         prev.seat.status === next.seat.status &&
         prev.selected === next.selected &&
         prev.mode === next.mode;
});

const TableNode = React.memo(({ box, selected, mode, onDoubleClick, onDragStart }: any) => {
  return (
    <div
      onDoubleClick={(e) => {
         e.stopPropagation();
         if (mode === 'edit') onDoubleClick(box.id, box.id.split('-T')[1]);
      }}
      onMouseDown={(e) => {
         e.stopPropagation();
         onDragStart(box, 'table', e.clientX, e.clientY, e.currentTarget);
      }}
      className={`absolute border-2 ${selected ? 'border-red-500 bg-red-500/40' : 'border-indigo-400 bg-indigo-600/30'} rounded-lg flex flex-col items-center justify-center ${mode === 'edit' ? 'cursor-move' : 'pointer-events-none'} transition-colors`}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
      title={box.id}
    >
      <span className="text-[12px] font-bold text-indigo-100/80">{box.id.split('-T')[1]}</span>
    </div>
  );
}, (prev, next) => {
  return prev.box.x === next.box.x &&
         prev.box.y === next.box.y &&
         prev.box.w === next.box.w &&
         prev.box.h === next.box.h &&
         prev.selected === next.selected &&
         prev.mode === next.mode;
});

const AssignmentModalComponent = ({ isOpen, seat, attendees, governorate, onClose, onAssign, onUnassign }: any) => {
  const [searchTerm, setSearchTerm] = useState('');
  
  useEffect(() => {
    if (isOpen) setSearchTerm('');
  }, [isOpen]);

  if (!isOpen || !seat) return null;

  const filteredAttendees = attendees
    .filter((a: any) => a.seat_class === seat.seat_class && !a.seat_number && ((val: string) => val.trim().toLowerCase())(a.governorate) === ((val: string) => val.trim().toLowerCase())(governorate))
    .filter((a: any) => {
       const term = searchTerm.toLowerCase();
       const name = (a.full_name || a.name || '').toLowerCase();
       const phone = (a.phone || '').toLowerCase();
       return name.includes(term) || phone.includes(term);
    });

  return (
     <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
        <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-6 flex flex-col gap-4 shadow-2xl" onClick={e => e.stopPropagation()}>
           <div className="flex justify-between items-center">
             <h3 className="text-lg font-bold text-white">تسكين المقعد: {seat.seat_code}</h3>
             {seat.status === 'booked' && (
               <button onClick={onUnassign} className="px-3 py-1 bg-red-600/20 text-red-400 border border-red-600/50 rounded hover:bg-red-600 hover:text-white transition text-xs">
                 إلغاء التسكين الحالي
               </button>
             )}
           </div>
           
           {seat.status === 'booked' && (
             <div className="p-3 bg-indigo-900/30 border border-indigo-700/50 rounded-lg">
               <p className="text-xs text-indigo-300 mb-1">المقعد محجوز حالياً لـ:</p>
               <p className="font-bold text-white">
                 {attendees.find((a: any) => a.id === seat.attendee_id)?.full_name || 'غير معروف'}
               </p>
             </div>
           )}

           <input 
             type="text" 
             autoFocus
             placeholder="ابحث بالاسم أو رقم التليفون لتبديل التسكين..." 
             value={searchTerm}
             onChange={e => setSearchTerm(e.target.value)}
             className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
           />
           <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-2">
             {filteredAttendees.map((a: any) => (
                   <button 
                     key={a.id}
                     onClick={() => onAssign(a.id)}
                     className="flex items-center justify-between p-3 rounded-lg border border-slate-700 bg-slate-800/50 hover:bg-indigo-600 hover:border-indigo-500 transition text-right"
                   >
                     <div className="flex flex-col">
                        <span className="font-bold text-white">{a.full_name || a.name}</span>
                        <span className="text-xs text-slate-400">{a.phone}</span>
                     </div>
                     <span className="text-xs bg-slate-700 px-2 py-1 rounded text-slate-300">اختر</span>
                   </button>
                ))
             }
             {filteredAttendees.length === 0 && (
                <div className="text-center text-slate-500 py-4">لا يوجد عملاء غير مسكنين في هذه الفئة</div>
             )}
           </div>
           <button onClick={onClose} className="mt-2 py-2 text-slate-400 hover:text-white transition">إلغاء</button>
        </div>
     </div>
  );
};

const SeatingManagement: React.FC = () => {
  const [governorate, setGovernorate] = useState('Minya');
  const [eventId, setEventId] = useState('MINYA-2026-MAIN');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<SeatingMapPayload>({ event_id: 'MINYA-2026-MAIN', tables: [], seats: [], layout_elements: [] });
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
  const [layoutDraft, setLayoutDraft] = useState<Record<string, { type: 'seat' | 'table' | 'element'; position_x: number; position_y: number }>>({});
  const [history, setHistory] = useState<Array<Record<string, { type: 'seat' | 'table' | 'element'; position_x: number; position_y: number }>>>([{}]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [dragState, setDragState] = useState<{
    id: string;
    type: 'seat' | 'table' | 'element';
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    seatOrigins?: Record<string, {x: number, y: number}>;
  } | null>(null);
  const [versions, setVersions] = useState<LayoutVersionLite[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [versionName, setVersionName] = useState('');
  const [assignmentModal, setAssignmentModal] = useState<{isOpen: boolean, seat: Seat | null}>({isOpen: false, seat: null});
  const [zoomLevel, setZoomLevel] = useState(1);
  const [renameModal, setRenameModal] = useState<{isOpen: boolean, tableId: string, currentName: string}>({isOpen: false, tableId: '', currentName: ''});

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
      list.push(seat as any);
      seatsByTable.set(seat.table_id, list as any);
    }
    const boxes: Array<{ id: string; x: number; y: number; w: number; h: number; cls: string }> = [];
    for (const table of payload.tables || []) {
      const list = seatsByTable.get(table.id) || [];
      if (!list.length) continue;
      const xs = list.map((s: any) => Number(s.position_x || 0));
      const ys = list.map((s: any) => Number(s.position_y || 0));
      const minX = Math.min(...xs) * 8;
      const maxX = Math.max(...xs) * 8 + 24; // chair width is 24px
      const minY = Math.min(...ys) * 4;
      const maxY = Math.max(...ys) * 4 + 24; // chair height is 24px
      
      const tableW = Math.max(32, maxX - minX - 24);
      const tableH = Math.max(16, maxY - minY - 32);

      boxes.push({
        id: table.id,
        x: minX + 12,
        y: minY + 16,
        w: tableW,
        h: tableH,
        cls: table.seat_class
      });
    }
    return boxes;
  }, [payload.seats, payload.tables]);

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

  const assignSelected = async (passedAttendeeId?: any) => {
    const aid = typeof passedAttendeeId === 'string' ? passedAttendeeId : selectedAttendeeId;
    if (!selectedSeatId || !aid) return;
    try {
      setLoading(true);
      setError(null);
      await api.post('/seating/assign-attendee', { event_id: eventId, seat_id: selectedSeatId, attendee_id: aid });
      
      // Optimistic update for instant UI feedback
      const targetSeat = payload.seats.find(s => s.id === selectedSeatId);
      const oldAttendeeIdInTargetSeat = targetSeat?.attendee_id;
      
      setPayload(prev => ({
        ...prev,
        seats: prev.seats.map(s => {
          if (s.id === selectedSeatId) return { ...s, status: 'booked', attendee_id: aid };
          if (s.attendee_id === aid) return { ...s, status: 'available', attendee_id: null };
          return s;
        })
      }));
      
      if (targetSeat) {
        setAttendees(prev => prev.map(a => {
           if (a.id === aid) return { ...a, seat_number: targetSeat.seat_number, barcode: targetSeat.seat_code };
           if (a.id === oldAttendeeIdInTargetSeat) return { ...a, seat_number: undefined, barcode: undefined };
           return a;
        }));
      }
      
      // Background reload
      loadMap();
      loadAttendees();
    } catch (e: any) {
      setError(e.message || 'فشل تسكين المشارك');
    } finally {
      setLoading(false);
    }
  };

  const unassignSelected = async () => {
    if (!selectedSeatId) return;
    try {
      setLoading(true);
      setError(null);
      await api.post('/seating/unassign-attendee', { event_id: eventId, seat_id: selectedSeatId });
      
      const targetSeat = payload.seats.find(s => s.id === selectedSeatId);
      const oldAttendeeId = targetSeat?.attendee_id;
      
      setPayload(prev => ({
        ...prev,
        seats: prev.seats.map(s => {
          if (s.id === selectedSeatId) return { ...s, status: 'available', attendee_id: null };
          return s;
        })
      }));
      if (oldAttendeeId) {
        setAttendees(prev => prev.map(a => a.id === oldAttendeeId ? { ...a, seat_number: undefined, barcode: undefined } : a));
      }
      
      loadMap();
      loadAttendees();
    } catch (e: any) {
      setError(e.message || 'فشل إلغاء التسكين');
    } finally {
      setLoading(false);
      setAssignmentModal({isOpen: false, seat: null});
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

  const handleDeleteElement = async (id: string, type: 'table' | 'element' | 'wave' | 'seat') => {
    if (!window.confirm('هل أنت متأكد من الحذف؟')) return;
    try {
      setLoading(true);
      await api.post('/seating/delete-element', { event_id: eventId, id, type });
      await loadMap();
    } catch(e: any) {
      setError(e.message || 'فشل الحذف');
    } finally {
      setLoading(false);
    }
  };

  const handleAddElement = async (type: string, cls?: string) => {
    try {
      setLoading(true);
      await api.post('/seating/add-element', { event_id: eventId, governorate, type, seat_class: cls });
      await loadMap();
    } catch(e: any) {
      setError(e.message || 'Failed to add element');
    } finally {
      setLoading(false);
    }
  };
  
  const handleClearMap = async () => {
     if (!window.confirm('هل أنت متأكد من مسح جميع العناصر من الخريطة؟ هذا الإجراء لا يمكن التراجع عنه.')) return;
     try {
        setLoading(true);
        const elements = payload.layout_elements || [];
        const tables = payload.tables || [];
        const waves = [...new Set((payload.seats || []).filter(s => s.wave_number).map(s => s.wave_number))];
        const looseSeats = (payload.seats || []).filter(s => !s.table_id && !s.wave_number);
        
        for (const el of elements) {
           await api.post('/seating/delete-element', { event_id: eventId, id: el.id, type: 'element' });
        }
        for (const t of tables) {
           await api.post('/seating/delete-element', { event_id: eventId, id: t.id, type: 'table' });
        }
        for (const w of waves) {
           await api.post('/seating/delete-element', { event_id: eventId, id: w, type: 'wave' });
        }
        for (const s of looseSeats) {
           await api.post('/seating/delete-element', { event_id: eventId, id: s.id, type: 'seat' });
        }
        await loadMap();
     } catch(e: any) {
        setError(e.message || 'فشل مسح الخريطة');
     } finally {
        setLoading(false);
     }
  };

  const startDrag = (item: any, type: 'seat' | 'table' | 'element', clientX: number, clientY: number, currentTarget: HTMLElement) => {
    const currentZoom = zoomLevel;
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

    const rect = document.getElementById('seating-canvas-inner')?.getBoundingClientRect();
    const scaledX = rect ? (clientX - rect.left) / currentZoom : clientX;
    const scaledY = rect ? (clientY - rect.top) / currentZoom : clientY;
    
    setDragState({
      id: item.id,
      type,
      startX: scaledX,
      startY: scaledY,
      originX,
      originY,
      seatOrigins
    });
  };

  const onCanvasMove = (clientX: number, clientY: number) => {
    if (!dragState || mode !== 'edit') return;
    
    const currentZoom = zoomLevel;
    // We need to calculate dx and dy based on the scaled position change
    // Let's get the container rect to find the current scaled position
    const container = document.getElementById('seating-canvas-inner');
    const rect = container?.getBoundingClientRect();
    
    const currentScaledX = rect ? (clientX - rect.left) / currentZoom : clientX;
    const currentScaledY = rect ? (clientY - rect.top) / currentZoom : clientY;

    // dx and dy are the differences in grid units (unscaled difference divided by grid size)
    const dx = (currentScaledX - dragState.startX) / 8;
    const dy = (currentScaledY - dragState.startY) / 4;
    
    const nextX = Math.max(0, Math.round((dragState.originX + dx) * 10) / 10);
    const nextY = Math.max(0, Math.round((dragState.originY + dy) * 10) / 10);
    
    const nextDraft = { ...layoutDraft };
    nextDraft[dragState.id] = { type: dragState.type, position_x: nextX, position_y: nextY };
    
    // If we drag a table, we should also drag its associated seats proportionally
    if (dragState.type === 'table' && dragState.seatOrigins) {
        Object.keys(dragState.seatOrigins).forEach(seatId => {
            const startPos = dragState.seatOrigins![seatId];
            if (startPos) {
                nextDraft[seatId] = { 
                  type: 'seat', 
                  position_x: Math.max(0, Math.round((startPos.x + dx) * 10) / 10), 
                  position_y: Math.max(0, Math.round((startPos.y + dy) * 10) / 10) 
                };
            }
        });
    }
    
    setLayoutDraft(nextDraft);
  };

  const endDrag = () => {
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
  };

  const [selectedElement, setSelectedElement] = useState<{id: string, type: 'table' | 'element' | 'wave' | 'seat'} | null>(null);
  
  const handleSeatClick = useCallback((seat: Seat) => {
    setSelectedSeatId(seat.id);
    setSelectedElement({ id: seat.id, type: 'seat' });
  }, []);
  
  const handleSeatDoubleClick = useCallback((seat: Seat) => {
    if (mode === 'assign') {
        setSelectedSeatId(seat.id);
        setAssignmentModal({ isOpen: true, seat });
    }
  }, [mode]);

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

  const commitDraftHistory = (nextDraft: Record<string, { type: 'seat' | 'table' | 'element'; position_x: number; position_y: number }>) => {
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
          <button onClick={initHall} className="px-4 py-2 rounded-md text-sm border border-slate-700 bg-slate-800">تهيئة ذكية للقاعة</button>
          <button onClick={async () => {
             if (!window.confirm('هل أنت متأكد من تسكين جميع العملاء المتبقين عشوائياً؟')) return;
             try {
                setLoading(true);
                const eligible = attendees.filter(a => !a.seat_number);
                await api.post('/seating/auto-assign-all', { event_id: eventId });
                await loadMap();
             } catch(e: any) { alert(e.message); }
             finally { setLoading(false); }
          }} className="px-4 py-2 rounded-md text-sm border border-slate-700 bg-slate-800 text-blue-400">تسكين تلقائي للكل</button>
          <button onClick={handleClearMap} className="px-4 py-2 rounded-md text-sm bg-red-600">تفريغ الخريطة بالكامل</button>
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
            <div className="flex gap-2 items-center" dir="ltr">
              <button onClick={() => setZoomLevel(p => Math.max(0.2, p - 0.1))} className="px-3 py-1 bg-slate-800 border border-slate-700 hover:bg-slate-700 rounded-md text-xl leading-none">-</button>
              <span className="text-sm w-12 text-center font-bold text-indigo-300">{Math.round(zoomLevel * 100)}%</span>
              <button onClick={() => setZoomLevel(p => Math.min(3, p + 0.1))} className="px-3 py-1 bg-slate-800 border border-slate-700 hover:bg-slate-700 rounded-md text-xl leading-none">+</button>
            </div>
            <div className="text-xs text-slate-400">سحب وإفلات في مود التعديل لتغيير المكان</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-2">
            <div id="seating-canvas-container" className="relative rounded-md border border-slate-800 overflow-auto" style={{ height: 600 }}>
              <div
                id="seating-canvas-inner"
                className="relative min-w-[1600px] min-h-[1200px]"
                onMouseMove={(e) => onCanvasMove(e.clientX, e.clientY)}
                onMouseUp={endDrag}
                onMouseLeave={endDrag}
                style={{
                  transform: `scale(${zoomLevel})`,
                  transformOrigin: 'top right',
                  backgroundImage:
                    'linear-gradient(to right, rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.08) 1px, transparent 1px)',
                  backgroundSize: '24px 24px'
                }}
              >
                <div className="absolute top-0 left-0 right-0 h-16 border-b border-indigo-800 bg-indigo-900/20 flex items-center justify-center font-bold text-xl text-indigo-300 tracking-widest z-0 pointer-events-none">
                   STAGE / المسرح
                </div>
              {tableBoxes.map((box) => {
                  const draft = layoutDraft[box.id];
                  const x = draft ? draft.position_x * 8 : box.x;
                  const y = draft ? draft.position_y * 4 : box.y;
                  return (
                     <TableNode 
                        key={box.id} 
                        box={{ ...box, x, y }} 
                        selected={selectedElement?.id === box.id} 
                        mode={mode}
                        onDoubleClick={(id: string, currentName: string) => setRenameModal({ isOpen: true, tableId: id, currentName })}
                        onDragStart={(b: any, type: string, clientX: number, clientY: number, target: any) => {
                           startDrag({ id: b.id, position_x: box.x/8, position_y: box.y/4 }, 'table', clientX, clientY, target);
                           setSelectedElement({ id: b.id, type: 'table' });
                        }}
                     />
                  );
              })} 
              {/* Layout elements removed as they require DB migration */}
              
              {/* Assignment Modal */}
              {renameModal.isOpen && (
                 <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setRenameModal({isOpen: false, tableId: '', currentName: ''})}>
                    <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-sm p-6 flex flex-col gap-4 shadow-2xl" onClick={e => e.stopPropagation()}>
                       <h3 className="text-lg font-bold text-white">تغيير اسم الترابيزة</h3>
                       <input 
                         type="text" 
                         autoFocus
                         value={renameModal.currentName}
                         onChange={e => setRenameModal(prev => ({...prev, currentName: e.target.value}))}
                         className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                       />
                       <div className="flex gap-2 mt-2">
                           <button onClick={async () => {
                               const { tableId, currentName } = renameModal;
                               const oldNum = tableId.split('-T')[1];
                               if (currentName && currentName !== oldNum) {
                                   try {
                                      const newId = tableId.split('-T')[0] + '-T' + currentName;
                                      setLoading(true);
                                      await api.post('/seating/update-table-id', { old_id: tableId, new_id: newId });
                                      setSelectedElement({ id: newId, type: 'table' });
                                      await loadMap();
                                   } catch(err: any) { alert(err.message); }
                                   finally { setLoading(false); }
                               }
                               setRenameModal({isOpen: false, tableId: '', currentName: ''});
                           }} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition">حفظ</button>
                           <button onClick={() => setRenameModal({isOpen: false, tableId: '', currentName: ''})} className="flex-1 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition">إلغاء</button>
                       </div>
                    </div>
                 </div>
              )}
              <AssignmentModalComponent 
                 isOpen={assignmentModal.isOpen} 
                 seat={assignmentModal.seat} 
                 attendees={attendees} 
                 governorate={governorate} 
                 onClose={() => setAssignmentModal({isOpen: false, seat: null})} 
                 onAssign={(id: string) => {
                    setAssignmentModal({isOpen: false, seat: null});
                    assignSelected(id);
                 }}
                 onUnassign={unassignSelected}
              />
              {mapSeats.map((seat) => {
                const seatView = getSeatView(seat);
                return (
                   <SeatNode 
                      key={seat.id} 
                      seat={seatView} 
                      selected={selectedSeatId === seat.id}
                      mode={mode}
                      onSeatClick={handleSeatClick}
                      onSeatDoubleClick={handleSeatDoubleClick}
                      onDragStart={startDrag}
                   />
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
            <div className="flex justify-between items-center">
              <h2 className="font-semibold text-white">مود التعديل</h2>
              <div className="flex gap-2">
                 <button onClick={() => handleAddElement('table', 'A')} className="px-2 py-1 bg-indigo-600 text-xs rounded">+ Table A</button>
                 <button onClick={() => handleAddElement('seat', 'A')} className="px-2 py-1 bg-indigo-600 text-xs rounded">+ Chair A</button>
                 <button onClick={() => handleAddElement('table', 'B')} className="px-2 py-1 bg-indigo-600 text-xs rounded">+ Table B</button>
                 <button onClick={() => handleAddElement('seat', 'B')} className="px-2 py-1 bg-indigo-600 text-xs rounded">+ Chair B</button>
                 <button onClick={() => handleAddElement('wave', 'C')} className="px-2 py-1 bg-indigo-600 text-xs rounded">+ Wave C</button>
                 <button onClick={() => handleAddElement('seat', 'C')} className="px-2 py-1 bg-indigo-600 text-xs rounded">+ Chair C</button>
                 <button onClick={() => handleAddElement('stage')} className="px-2 py-1 bg-amber-600 text-xs rounded">+ Stage</button>
                 <button onClick={() => handleAddElement('blocked')} className="px-2 py-1 bg-rose-600 text-xs rounded">+ Blocked</button>
                 <button onClick={() => handleAddElement('allowed')} className="px-2 py-1 bg-emerald-600 text-xs rounded">+ Allowed</button>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <div className="text-sm text-slate-300">المحدد: {selectedElement?.id || 'لا يوجد'} ({selectedElement?.type || '-'})</div>
              {selectedElement && (
                <button onClick={() => handleDeleteElement(selectedElement.id, selectedElement.type)} className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition">حذف المحدد</button>
              )}
            </div>
            
            {selectedElement?.type === 'table' && (
               <div className="flex gap-2 items-center text-sm text-slate-300 mt-2 border-t border-slate-800 pt-2">
                 <span>تغيير اسم الطاولة:</span>
                 <input 
                   type="text" 
                   defaultValue={selectedElement.id.split('-T')[1]} 
                   onBlur={async (e) => {
                     const newNum = e.target.value;
                     if (!newNum || newNum === selectedElement.id.split('-T')[1]) return;
                     try {
                        const newId = selectedElement.id.split('-T')[0] + '-T' + newNum;
                        setLoading(true);
                        await api.post('/seating/update-table-id', { old_id: selectedElement.id, new_id: newId });
                        setSelectedElement({ id: newId, type: 'table' });
                        await loadMap();
                     } catch(err: any) { alert(err.message); }
                     finally { setLoading(false); }
                   }} 
                   className="rounded px-2 py-1 bg-slate-800 w-20 text-white border border-slate-700" 
                 />
               </div>
            )}
            
            <div className="text-sm text-slate-300 mt-2 border-t border-slate-800 pt-2">المقعد: {selectedSeat?.seat_code || 'لا يوجد'}</div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input type="number" value={editSeatState.position_x} onChange={(e) => setEditSeatState((p) => ({ ...p, position_x: Number(e.target.value) }))} className="rounded-md px-3 py-2 bg-slate-800 border border-slate-700" placeholder="X" />
              <input type="number" value={editSeatState.position_y} onChange={(e) => setEditSeatState((p) => ({ ...p, position_y: Number(e.target.value) }))} className="rounded-md px-3 py-2 bg-slate-800 border border-slate-700" placeholder="Y" />
              <input type="number" value={editSeatState.row_number} onChange={(e) => setEditSeatState((p) => ({ ...p, row_number: Number(e.target.value) }))} className="rounded-md px-3 py-2 bg-slate-800 border border-slate-700" placeholder="Row" />
              <button disabled={!selectedSeatId || loading} onClick={saveSeatLayout} className="px-4 py-2 rounded-md bg-indigo-600 disabled:opacity-50">حفظ تعديل المقعد فقط</button>
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
