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

const SeatNode = React.memo(({ seat, selected, mode, onSeatClick, onSeatDoubleClick, onDragStart, inGroup }: any) => {
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
      className={`absolute text-[8px] w-6 h-6 rounded-full border flex flex-col items-center justify-center text-white ${selected ? 'bg-blue-600 ring-2 ring-blue-300 scale-110 z-10' : (statusColor[seat.status] || 'bg-slate-500')} ${mode === 'edit' ? 'cursor-move' : ''} ${inGroup ? 'outline outline-2 outline-orange-500 outline-dashed outline-offset-2 z-20' : 'border-white/20'}`}
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
           prev.inGroup === next.inGroup &&
           prev.mode === next.mode;
  });

const TableNode = React.memo(({ box, selected, mode, onDoubleClick, onDragStart, inGroup }: any) => {
  return (
    <div
      onDoubleClick={(e) => {
         e.stopPropagation();
         onDoubleClick(box.id, box.id.split('-T')[1]);
      }}
      onMouseDown={(e) => {
         e.stopPropagation();
         onDragStart(box, 'table', e.clientX, e.clientY, e.currentTarget);
      }}
      className={`absolute border-2 ${selected ? 'border-red-500 bg-red-500/40' : 'border-indigo-400 bg-indigo-600/30'} rounded-lg flex flex-col items-center justify-center ${mode === 'edit' ? 'cursor-move' : 'cursor-pointer hover:bg-indigo-500/50'} ${inGroup ? 'outline outline-2 outline-orange-500 outline-dashed outline-offset-4 z-20' : ''} transition-colors`}
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
           prev.inGroup === next.inGroup &&
           prev.mode === next.mode;
});
const TableAssignModalComponent = ({ isOpen, tableId, mapSeats, attendees, onClose, onAssign, onUnassign }: any) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSeat, setSelectedSeat] = useState<Seat | null>(null);
  const [showAlreadySeated, setShowAlreadySeated] = useState(false);
  
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setSelectedSeat(null);
      setShowAlreadySeated(false);
    }
  }, [isOpen]);

  if (!isOpen || !tableId) return null;

  const tableSeats = mapSeats.filter((s: Seat) => s.table_id === tableId);
  const tClass = tableSeats[0]?.seat_class || 'A';
  
  // Find bounding box to center the table view
  const xs = tableSeats.map((s: Seat) => Number(s.position_x || 0));
  const ys = tableSeats.map((s: Seat) => Number(s.position_y || 0));
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);

  const assignedAttendeeIds = new Set(mapSeats.map((s: Seat) => s.attendee_id).filter(Boolean));

  const filteredAttendees = attendees
    .filter((a: any) => a.seat_class === tClass)
    .filter((a: any) => {
       // Only show unseated unless showAlreadySeated is true
      if (!showAlreadySeated && assignedAttendeeIds.has(a.id)) return false;
       
       const term = searchTerm.toLowerCase();
       const name = (a.full_name || a.name || '').toLowerCase();
       const phone = (a.phone || '').toLowerCase();
       return name.includes(term) || phone.includes(term);
    });

  return (
     <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
        <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-4xl h-[80vh] flex overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
           
           {/* Left Side: Table Layout */}
           <div className="flex-1 border-l border-slate-800 p-6 flex flex-col items-center justify-center relative bg-slate-950">
             <h2 className="absolute top-6 left-6 text-2xl font-bold text-slate-300">ترابيزة: {tableId.split('-T')[1]}</h2>
             <div className="relative w-[300px] h-[300px] bg-indigo-900/10 rounded-full border-4 border-indigo-900/30 flex items-center justify-center shadow-[inset_0_0_50px_rgba(0,0,0,0.5)]">
               <span className="text-4xl font-black text-indigo-800/50">T-{tableId.split('-T')[1]}</span>
               {tableSeats.map((seat: Seat, index: number) => {
                  // Perfect circle layout based on index and total seats
                  const totalSeats = tableSeats.length;
                  const angle = (index / totalSeats) * 2 * Math.PI - Math.PI / 2; // -PI/2 starts at top
                  const radius = 45; // 45% radius to fit within 100% container
                  const leftPos = 50 + radius * Math.cos(angle);
                  const topPos = 50 + radius * Math.sin(angle);
                  
                  return (
                    <button
                      key={seat.id}
                      onClick={() => setSelectedSeat(seat)}
                      className={`absolute w-12 h-12 rounded-full border-2 flex flex-col items-center justify-center text-white transition-all transform hover:scale-110 -translate-x-1/2 -translate-y-1/2 ${selectedSeat?.id === seat.id ? 'ring-4 ring-blue-500 scale-110 z-10' : ''} ${seat.status === 'booked' ? 'bg-rose-600 border-rose-400 shadow-[0_0_15px_rgba(225,29,72,0.5)]' : 'bg-slate-600 border-slate-400 opacity-80'}`}
                      style={{
                         left: `${leftPos}%`,
                         top: `${topPos}%`,
                      }}
                      title={seat.seat_code}
                    >
                      <span className="font-bold text-sm">{seat.seat_number}</span>
                    </button>
                  );
               })}
             </div>
             <div className="absolute bottom-6 w-full text-center text-slate-500 text-sm">
                المسرح / STAGE (الاتجاه الأمامي)
             </div>
           </div>

           {/* Right Side: Attendee Selection */}
           <div className="w-[400px] bg-slate-900 p-6 flex flex-col">
              {selectedSeat ? (
                <>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-white">تسكين المقعد: {selectedSeat.seat_code}</h3>
                    {selectedSeat.status === 'booked' && (
                      <button onClick={() => { onUnassign(selectedSeat.id); setSelectedSeat(null); }} className="px-3 py-1 bg-red-600/20 text-red-400 border border-red-600/50 rounded hover:bg-red-600 hover:text-white transition text-xs">
                        إلغاء التسكين
                      </button>
                    )}
                  </div>
                  
                  {selectedSeat.status === 'booked' && (
                    <div className="p-4 bg-indigo-900/30 border border-indigo-700/50 rounded-lg mb-4">
                      <p className="text-sm text-indigo-300 mb-1">المقعد محجوز حالياً لـ:</p>
                      <p className="text-lg font-bold text-white">
                        {attendees.find((a: any) => a.id === selectedSeat.attendee_id)?.full_name || 'غير معروف'}
                      </p>
                    </div>
                  )}

                  <div className="flex flex-col gap-2 mb-4">
                    <input 
                      type="text" 
                      placeholder="ابحث بالاسم أو رقم التليفون..." 
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white"
                    />
                    <label className="flex items-center gap-2 cursor-pointer select-none px-1">
                       <input 
                         type="checkbox" 
                         checked={showAlreadySeated} 
                         onChange={e => setShowAlreadySeated(e.target.checked)}
                         className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                       />
                       <span className="text-xs text-slate-400">عرض الجميع (بمن فيهم المسكنين بالفعل)</span>
                    </label>
                  </div>
                  
                  <div className="flex-1 flex flex-col gap-2 overflow-y-auto pr-2 custom-scrollbar">
                    {filteredAttendees.map((a: any) => (
                          <button 
                            key={a.id}
                            onClick={() => {
                               onAssign(selectedSeat.id, a.id);
                               setSelectedSeat(null);
                            }}
                            className="flex items-center justify-between p-4 rounded-lg border border-slate-700 bg-slate-800/50 hover:bg-indigo-600 hover:border-indigo-500 transition text-right"
                          >
                            <div className="flex flex-col">
                               <span className="font-bold text-white text-sm">{a.full_name || a.name}</span>
                               <span className="text-xs text-slate-400 mt-1">{a.phone}</span>
                            </div>
                            <span className="text-xs bg-slate-700 px-3 py-1.5 rounded text-slate-300">تسكين</span>
                          </button>
                       ))
                    }
                    {filteredAttendees.length === 0 && (
                       <div className="text-center text-slate-500 py-8 flex flex-col items-center">
                          <span className="text-4xl mb-2">🪑</span>
                          <span>لا يوجد عملاء غير مسكنين في فئة {tClass}</span>
                       </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-center px-4">
                   <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-4 border border-slate-700">
                     <span className="text-3xl">👈</span>
                   </div>
                   <h3 className="text-lg font-bold text-slate-300 mb-2">اختر مقعداً من المخطط</h3>
                   <p className="text-sm">اضغط على أي مقعد فارغ (رمادي) أو محجوز (أحمر) في الترابيزة لبدء التسكين أو التعديل.</p>
                </div>
              )}
              
              <button onClick={onClose} className="mt-4 py-3 w-full bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition font-bold">إغلاق الترابيزة</button>
           </div>
        </div>
     </div>
  );
};
const normalizeGov = (val: string) => {
  const v = String(val || '').trim().toLowerCase();
  if (v.includes('minya') || v.includes('منيا')) return 'minya';
  if (v.includes('asyut') || v.includes('أسيوط') || v.includes('اسيوط')) return 'asyut';
  if (v.includes('sohag') || v.includes('سوهاج')) return 'sohag';
  if (v.includes('qena') || v.includes('قنا')) return 'qena';
  return v;
};

const AssignmentModalComponent = ({ isOpen, seat, attendees, mapSeats, onClose, onAssign, onUnassign }: any) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAlreadySeated, setShowAlreadySeated] = useState(false);
  
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setShowAlreadySeated(false);
    }
  }, [isOpen]);

  if (!isOpen || !seat) return null;

  const filteredAttendees = attendees
    .filter((a: any) => a.seat_class === seat.seat_class)
    .filter((a: any) => {
      if (!showAlreadySeated && mapSeats.some((s: any) => s.attendee_id === a.id)) return false;
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

           <div className="flex flex-col gap-2">
              <input 
                type="text" 
                autoFocus
                placeholder="ابحث بالاسم أو رقم التليفون لتبديل التسكين..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
              />
              <label className="flex items-center gap-2 cursor-pointer select-none px-1">
                 <input 
                   type="checkbox" 
                   checked={showAlreadySeated} 
                   onChange={e => setShowAlreadySeated(e.target.checked)}
                   className="w-3 h-3 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                 />
                 <span className="text-[10px] text-slate-400">عرض الجميع (بمن فيهم المسكنين بالفعل)</span>
              </label>
           </div>
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

interface EditModeState {
  action: 'add' | 'move' | 'delete' | 'edit_details' | null;
  addType: 'table' | 'wave' | 'seat' | 'blocked' | 'stage' | 'aisle' | null;
  addClass: 'A' | 'B' | 'C' | null;
  addName: string;
  addCount: number;
}

const SeatingManagement: React.FC = () => {
  const [copiedGroup, setCopiedGroup] = useState<any[]>([]);
  const [mainMode, setMainMode] = useState<'assign' | 'edit'>('assign');
  const [assignMode, setAssignMode] = useState<'tables' | 'chairs'>('tables');
  const [classFilter, setClassFilter] = useState<'A' | 'B' | 'C'>('A');
  const [waitingListSearch, setWaitingListSearch] = useState('');
  const [editModeState, setEditModeState] = useState<EditModeState>({
    action: null,
    addType: 'table',
    addClass: 'A',
    addName: '',
    addCount: 12
  });
  const [editSeatState, setEditSeatState] = useState<any>({});
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [selectedElement, setSelectedElement] = useState<{id: string, type: 'table' | 'element' | 'wave' | 'seat'} | null>(null);
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
  
  const [selectionBox, setSelectionBox] = useState<{startX: number, startY: number, endX: number, endY: number} | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string[]>([]);
  const [dragState, setDragState] = useState<{
    id: string;
    type: 'seat' | 'table' | 'element' | 'wave';
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    groupOrigins?: Record<string, {x: number, y: number, type: string}>;
  } | null>(null);
  const [layoutDraft, setLayoutDraft] = useState<Record<string, any>>({});
  const [history, setHistory] = useState<Array<Record<string, any>>>([{}]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const [versions, setVersions] = useState<LayoutVersionLite[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [versionName, setVersionName] = useState('');
  const [assignmentModal, setAssignmentModal] = useState<{isOpen: boolean, seat: Seat | null, isTableModal: boolean, tableId: string | null}>({isOpen: false, seat: null, isTableModal: false, tableId: null});
  const [zoomLevel, setZoomLevel] = useState(1);
  const [editTableModal, setEditTableModal] = useState<{isOpen: boolean, tableId: string, currentName: string, currentClass: string, currentCount: number}>({isOpen: false, tableId: '', currentName: '', currentClass: 'A', currentCount: 12});

  const [drawState, setDrawState] = useState<{
    active: boolean;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null>(null);

  const [drawModal, setDrawModal] = useState<{
    isOpen: boolean;
    type: string;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    name: string;
    shape: string;
    count: number;
    seatClass: string;
  }>({ isOpen: false, type: '', startX: 0, startY: 0, endX: 0, endY: 0, name: '', shape: 'rect', count: 10, seatClass: 'C' });

  const commitDraftHistory = useCallback((nextDraft: Record<string, any>) => {
    const base = history.slice(0, historyIndex + 1);
    const cloned = JSON.parse(JSON.stringify(nextDraft || {}));
    const nextHistory = [...base, cloned];
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
  }, [history, historyIndex]);

  const [governorate, setGovernorate] = useState('Minya');
  const [eventId, setEventId] = useState('MINYA-2026-MAIN');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<SeatingMapPayload>({ event_id: 'MINYA-2026-MAIN', tables: [], seats: [], layout_elements: [] });
  const [attendees, setAttendees] = useState<AttendeeLite[]>([]);

  const mapSeats = useMemo(() => {
    const baseSeats = payload.seats.filter(s => {
       const draft = layoutDraft[s.id] as any;
       return !draft?.is_deleted;
    });
    
    const newSeats = Object.entries(layoutDraft)
        .filter(([_, v]) => (v as any).is_new && (v as any).type === 'seat')
        .map(([id, v]: any) => ({
            id,
            ...v,
            status: 'available',
            event_id: eventId,
            governorate
        }));
    
    return [...baseSeats, ...newSeats].sort((a, b) => {
      const ay = Number(a.position_y || 0);
      const by = Number(b.position_y || 0);
      if (ay !== by) return ay - by;
      return Number(a.position_x || 0) - Number(b.position_x || 0);
    });
  }, [payload.seats, layoutDraft]);

  const mapElements = useMemo(() => {
      const baseEls = (payload.layout_elements || []).filter(el => {
         const draft = layoutDraft[el.id] as any;
         return !draft?.is_deleted;
      });
      const newEls = Object.entries(layoutDraft)
          .filter(([_, v]) => (v as any).is_new && ['element', 'stage', 'aisle', 'blocked'].includes((v as any).type))
          .map(([id, v]: any) => ({
              id,
              ...v,
              event_id: eventId,
              governorate
          }));
      return [...baseEls, ...newEls];
  }, [payload.layout_elements, layoutDraft]);

  const tableBoxes = useMemo(() => {
    const seatsByTable = new Map<string, Seat[]>();
    for (const seat of mapSeats || []) {
      if (!seat.table_id) continue;
      const list = seatsByTable.get(seat.table_id) || [];
      list.push(seat as any);
      seatsByTable.set(seat.table_id, list as any);
    }
    const boxes: Array<{ id: string; x: number; y: number; w: number; h: number; cls: string }> = [];
    for (const [tableId, list] of seatsByTable.entries()) {
      if (!list.length) continue;
      const xs = list.map((s: any) => Number(s.position_x || 0));
      const ys = list.map((s: any) => Number(s.position_y || 0));
      const minX = Math.min(...xs) * 8;
      const maxX = Math.max(...xs) * 8 + 24; 
      const minY = Math.min(...ys) * 4;
      const maxY = Math.max(...ys) * 4 + 24; 
      
      const tableW = Math.max(32, maxX - minX - 24);
      const tableH = Math.max(16, maxY - minY - 32);

      boxes.push({
        id: tableId,
        x: minX + 12,
        y: minY + 16,
        w: tableW,
        h: tableH,
        cls: list[0].seat_class as string
      });
    }
    return boxes;
  }, [mapSeats]);

  const handleDeleteElement = useCallback(async (id: string, type: 'table' | 'element' | 'wave' | 'seat') => {
    const targets = selectedGroup.includes(id) && selectedGroup.length > 1 ? selectedGroup : [id];
    
    if (targets.length > 1) {
       if (!window.confirm(`هل أنت متأكد من مسح ${targets.length} عناصر معاً؟ (سيتم إلغاء تسكين أي كراسي محجوزة)`)) return;
    } else {
       if (type === 'seat') {
         const seat = payload.seats.find(s => s.id === id);
         if (seat && seat.status === 'booked') {
           if (!window.confirm('هذا المقعد محجوز! هل أنت متأكد من مسحه؟ (سيتم إلغاء تسكين الشخص)')) return;
         }
       } else if (type === 'table') {
         if (!window.confirm('هل أنت متأكد من مسح هذه الترابيزة بالكامل؟ (سيتم إلغاء تسكين جميع كراسيها)')) return;
       } else if (type === 'element') {
         if (!window.confirm('هل أنت متأكد من مسح هذه المنطقة؟')) return;
       }
    }
    
    const nextDraft = { ...layoutDraft };
    targets.forEach(tId => {
       const isTable = tableBoxes.some(t => t.id === tId);
       const isElement = mapElements?.some(e => e.id === tId);
       let tType = isTable ? 'table' : isElement ? 'element' : 'seat';
       nextDraft[tId] = { type: tType as any, position_x: 0, position_y: 0, is_deleted: true };
    });
    
    setLayoutDraft(nextDraft as any);
    commitDraftHistory(nextDraft as any);
    setSelectedGroup([]);
    setSelectedElement(null);
    setSelectedSeatId('');
  }, [selectedGroup, payload.seats, tableBoxes, mapElements, layoutDraft, commitDraftHistory]);

  useEffect(() => {
     const handleKeyDown = (e: KeyboardEvent) => {
        if (mainMode !== 'edit') return;
        
        // Disable shortcuts if typing in an input or modal is open
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        if (assignmentModal.isOpen || editTableModal.isOpen || drawModal.isOpen) return;

        // Delete
        if (e.key === 'Delete' || e.key === 'Backspace') {
           if (selectedGroup.length > 0) {
               const firstId = selectedGroup[0];
               const isTable = tableBoxes.some(t => t.id === firstId);
               const isElement = mapElements?.some(el => el.id === firstId);
               handleDeleteElement(firstId, isTable ? 'table' : isElement ? 'element' : 'seat');
           } else if (selectedElement) {
               handleDeleteElement(selectedElement.id, selectedElement.type);
           }
        }
        
        // Undo (Ctrl+Z)
        if (e.ctrlKey && e.key === 'z') {
           e.preventDefault();
           if (historyIndex > 0) {
              const newIndex = historyIndex - 1;
              setHistoryIndex(newIndex);
              setLayoutDraft(history[newIndex] || {});
           }
        }
        
        // Redo (Ctrl+Y or Ctrl+Shift+Z)
        if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
           e.preventDefault();
           if (historyIndex < history.length - 1) {
              const newIndex = historyIndex + 1;
              setHistoryIndex(newIndex);
              setLayoutDraft(history[newIndex] || {});
           }
        }
        
        // Copy (Ctrl+C)
        if (e.ctrlKey && e.key === 'c') {
           const itemsToCopy = selectedGroup.length > 0 ? selectedGroup : (selectedElement ? [selectedElement.id] : []);
           if (itemsToCopy.length > 0) {
               const copiedData = itemsToCopy.map(id => {
                   const patch = layoutDraft[id] as any;
                   const isTable = tableBoxes.find(t => t.id === id);
                   if (isTable) return { id, type: 'table', x: patch && !patch.is_new ? patch.position_x : isTable.x / 8, y: patch && !patch.is_new ? patch.position_y : isTable.y / 4 };
                   
                   const isElement = mapElements?.find(el => el.id === id);
                   if (isElement) return { id, type: 'element', x: patch && !patch.is_new ? patch.position_x : Number(isElement.position_x || 0), y: patch && !patch.is_new ? patch.position_y : Number(isElement.position_y || 0), width: isElement.width, height: isElement.height, name: isElement.name, elType: isElement.type };
                   
                   const isSeat = mapSeats.find(s => s.id === id);
                   if (isSeat) return { id, type: 'seat', x: patch && !patch.is_new ? patch.position_x : Number(isSeat.position_x || 0), y: patch && !patch.is_new ? patch.position_y : Number(isSeat.position_y || 0), seat_class: isSeat.seat_class, table_id: isSeat.table_id };
                   
                   return null;
               }).filter(Boolean);
               
               if (copiedData.length > 0) {
                   // Calculate center of copied items to offset on paste
                   const xs = copiedData.map(d => d.x);
                   const ys = copiedData.map(d => d.y);
                   const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
                   const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
                   setCopiedGroup(copiedData.map(d => ({ ...d, dx: d.x - cx, dy: d.y - cy })));
               }
           }
        }
        
        // Paste (Ctrl+V)
        if (e.ctrlKey && e.key === 'v' && copiedGroup.length > 0) {
           const timestamp = Date.now();
           const nextDraft = { ...layoutDraft };
           const newSelection: string[] = [];
           
           // Paste roughly in the center of the view, offset by 10 units
           const pasteCx = 50; 
           const pasteCy = 50;
           
           copiedGroup.forEach((item, index) => {
               const newId = `local-${item.type}-${timestamp}-${index}`;
               const px = pasteCx + item.dx + 5; // Slight offset so it doesn't perfectly overlap
               const py = pasteCy + item.dy + 5;
               
               if (item.type === 'element') {
                   nextDraft[newId] = { is_new: true, type: item.elType, position_x: px, position_y: py, width: item.width, height: item.height, name: item.name } as any;
                   newSelection.push(newId);
               } else if (item.type === 'seat' && !item.table_id) { // Only paste free seats, table seats are pasted via table
                   nextDraft[newId] = { is_new: true, type: 'seat', position_x: px, position_y: py, seat_class: item.seat_class, seat_number: index + 1, seat_code: `C-COPY-S${index+1}` } as any;
                   newSelection.push(newId);
               } else if (item.type === 'table') {
                   // To paste a table, we need to recreate its seats
                   const originalSeats = mapSeats.filter(s => s.table_id === item.id);
                   originalSeats.forEach((s, sIdx) => {
                       const sId = `${newId}-S${sIdx+1}`;
                       const sPatch = layoutDraft[s.id] as any;
                       const sx = sPatch && !sPatch.is_new ? sPatch.position_x : Number(s.position_x || 0);
                       const sy = sPatch && !sPatch.is_new ? sPatch.position_y : Number(s.position_y || 0);
                       const sDx = sx - item.x;
                       const sDy = sy - item.y;
                       nextDraft[sId] = { is_new: true, type: 'seat', position_x: px + sDx, position_y: py + sDy, seat_class: s.seat_class, seat_number: sIdx + 1, seat_code: `COPY-T-S${sIdx+1}`, table_id: newId } as any;
                   });
                   newSelection.push(newId); // Select the table
               }
           });
           
           setLayoutDraft(nextDraft);
           commitDraftHistory(nextDraft);
           setSelectedGroup(newSelection);
        }
     };
     
     window.addEventListener('keydown', handleKeyDown);
     return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mainMode, selectedGroup, selectedElement, layoutDraft, copiedGroup, payload, tableBoxes, history, historyIndex, mapSeats, mapElements]);


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

  const seatStats = useMemo(() => {
    const list = mapSeats.filter((s) => s.seat_class === classFilter);
    return {
      total: list.length,
      available: list.filter((s) => s.status === 'available').length,
      booked: list.filter((s) => s.status === 'booked').length,
      reserved: list.filter((s) => s.status === 'reserved').length,
      vip: list.filter((s) => s.status === 'vip').length
    };
  }, [mapSeats, classFilter]);
  const selectedSeat = useMemo(() => mapSeats.find((s) => s.id === selectedSeatId) || null, [mapSeats, selectedSeatId]);
  const selectedSeatAttendee = useMemo(() => attendees.find((a) => a.id === selectedSeat?.attendee_id) || null, [attendees, selectedSeat?.attendee_id]);

  const getSeatView = (seat: Seat) => {
    const patch = layoutDraft[seat.id] as any;
    if (!patch) return seat;
    if (patch.is_deleted) return { ...seat, is_deleted: true };
    return {
      ...seat,
      position_x: patch.position_x !== undefined ? patch.position_x : seat.position_x,
      position_y: patch.position_y !== undefined ? patch.position_y : seat.position_y
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

  const assignSelected = async (passedAttendeeId?: any, passedSeatId?: string) => {
    const aid = typeof passedAttendeeId === 'string' ? passedAttendeeId : selectedAttendeeId;
    const sId = typeof passedSeatId === 'string' ? passedSeatId : selectedSeatId;
    if (!sId || !aid) return;

    const targetSeat = payload.seats.find(s => s.id === sId);
    
    // Check if attendee is already seated
    const currentSeat = payload.seats.find(s => s.attendee_id === aid);
    if (currentSeat) {
       const seatCode = currentSeat.seat_code;
       if (!window.confirm(`هذا الشخص مسكن بالفعل في المقعد (${seatCode}). هل تريد نقله إلى المقعد الجديد؟`)) {
          return;
       }
    }

    try {
      setLoading(true);
      setError(null);
      await api.post('/seating/assign-attendee', { event_id: eventId, seat_id: sId, attendee_id: aid });
      
      // Optimistic update for instant UI feedback
      const oldAttendeeIdInTargetSeat = targetSeat?.attendee_id;
      
      setPayload(prev => ({
        ...prev,
        seats: prev.seats.map(s => {
          if (s.id === sId) return { ...s, status: 'booked', attendee_id: aid };
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

  const unassignSelected = async (passedSeatId?: string) => {
    const sId = typeof passedSeatId === 'string' ? passedSeatId : selectedSeatId;
    if (!sId) return;
    try {
      setLoading(true);
      setError(null);
      
      const targetSeat = payload.seats.find(s => s.id === sId);
      const oldAttendeeId = targetSeat?.attendee_id;
      
      await api.post('/seating/unassign-attendee', { event_id: eventId, seat_id: sId, attendee_id: oldAttendeeId });
      
      // Clear data from attendees list too
      if (oldAttendeeId) {
         setAttendees(prev => prev.map(a => 
            a.id === oldAttendeeId ? { ...a, seat_number: null, barcode: null } : a
         ));
      }
      
      setPayload(prev => ({
        ...prev,
        seats: prev.seats.map(s => {
          if (s.id === sId) return { ...s, status: 'available', attendee_id: null };
          // If the attendee was in another seat somehow, clear that too
          if (oldAttendeeId && s.attendee_id === oldAttendeeId) return { ...s, status: 'available', attendee_id: null };
          return s;
        })
      }));
      
      loadMap();
      loadAttendees();
    } catch (e: any) {
      setError(e.message || 'فشل إلغاء التسكين');
    } finally {
      setLoading(false);
      setAssignmentModal({isOpen: false, seat: null, isTableModal: false, tableId: null});
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
    setLoading(true);
    setError(null);
    try {
      const updates = [];
      const deletions = [];
      const inserts: any = { seats: [], elements: [] };
      
      for (const [id, val] of Object.entries(layoutDraft)) {
        const anyVal = val as any;
        if (anyVal.is_deleted) {
          if (!anyVal.is_new) deletions.push({ id, type: anyVal.type });
        } else if (anyVal.is_new) {
          if (anyVal.type === 'seat') inserts.seats.push({ id, ...anyVal });
          else inserts.elements.push({ id, ...anyVal });
        } else {
          updates.push({
            id,
            type: anyVal.type,
            position_x: anyVal.position_x,
            position_y: anyVal.position_y
          });
        }
      }
      
      await api.post('/seating/bulk-save', { event_id: eventId, updates, deletions, inserts });
      
      setLayoutDraft({});
      setHistory([{}]);
      setHistoryIndex(0);
      await loadMap();
    } catch(e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddElement = async (type: string, cls: string, name: string, count: number) => {
    try {
      setLoading(true);
      const gov = eventId.split('-')[0] || 'MINYA';
      const offsetX = 40 + Math.floor(Math.random() * 20);
      const offsetY = 40 + Math.floor(Math.random() * 20);
      const timestamp = Date.now();
      const uniqueSuffix = Math.floor(Math.random() * 1000000);
      
      const nextDraft = { ...layoutDraft };
      
      if (type === 'table') {
        const tableName = name || String(uniqueSuffix % 1000);
        const chairsCount = Number(count || 12);
        const tableId = `${gov}-${cls}-T${tableName}`;
        
        for(let i = 1; i <= chairsCount; i++) {
          const cols = Math.ceil(chairsCount / 2);
          const localRow = Math.floor((i - 1) / cols);
          const localCol = (i - 1) % cols;
          const seatX = offsetX + (localCol - (cols/2 - 0.5)) * 2.2;
          const seatY = offsetY + (localRow - 0.5) * 2.2;
          const newId = `${tableId}-S${i}`;
          
          nextDraft[newId] = {
            is_new: true,
            type: 'seat',
            position_x: seatX,
            position_y: seatY,
            seat_class: cls,
            seat_number: i,
            seat_code: `T${tableName}-S${i}`,
            table_id: tableId
          };
        }
      } else if (type === 'seat') {
         const newId = `${gov}-${cls}-S${uniqueSuffix}`;
         nextDraft[newId] = {
            is_new: true,
            type: 'seat',
            position_x: offsetX,
            position_y: offsetY,
            seat_class: cls,
            seat_number: 1,
            seat_code: `S${uniqueSuffix}`
         };
      }
      
      setLayoutDraft(nextDraft as any);
      commitDraftHistory(nextDraft as any);
      setEditModeState(p => ({...p, addName: '', addCount: 12}));
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
        setLayoutDraft({});
        setHistory([{}]);
        setHistoryIndex(0);
        await loadMap();
     } catch(e: any) {
        setError(e.message || 'فشل مسح الخريطة');
     } finally {
        setLoading(false);
     }
  };

  const startDrag = useCallback((element: any, type: 'table' | 'element' | 'wave' | 'seat', clientX: number, clientY: number, currentTarget: any) => {
    if (mainMode !== 'edit') return;
    const currentZoom = zoomLevel;
    
    let groupIds = [element.id];
    if (selectedGroup.includes(element.id)) {
       groupIds = [...selectedGroup];
    } else {
       setSelectedGroup([element.id]);
    }

    let groupOrigins: Record<string, {x: number, y: number, type: string}> = {};
    
    groupIds.forEach(gId => {
       const isTable = tableBoxes.some(t => t.id === gId);
       const isElement = mapElements?.some(e => e.id === gId);
       const isSeat = mapSeats.some(s => s.id === gId);
       
       let tType = isTable ? 'table' : isElement ? 'element' : isSeat ? 'seat' : null;
       if (!tType) return;
       
       const patch = layoutDraft[gId] as any;
       let ox = 0, oy = 0;
       
       if (tType === 'table') {
          const box = tableBoxes.find(t => t.id === gId);
          if (!box) return;
          ox = patch && !patch.is_new ? patch.position_x : box.x / 8;
          oy = patch && !patch.is_new ? patch.position_y : box.y / 4;
          
          mapSeats.filter(s => s.table_id === gId).forEach(s => {
             const sPatch = layoutDraft[s.id] as any;
             groupOrigins[s.id] = {
                x: sPatch && !sPatch.is_new ? sPatch.position_x : Number(s.position_x || 0),
                y: sPatch && !sPatch.is_new ? sPatch.position_y : Number(s.position_y || 0),
                type: 'seat'
             };
          });
       } else if (tType === 'element') {
          const el = mapElements?.find(e => e.id === gId);
          if (!el) return;
          ox = patch && !patch.is_new ? patch.position_x : Number(el.position_x || 0);
          oy = patch && !patch.is_new ? patch.position_y : Number(el.position_y || 0);
       } else if (tType === 'seat') {
          const seat = mapSeats.find(s => s.id === gId);
          if (!seat) return;
          ox = patch && !patch.is_new ? patch.position_x : Number(seat.position_x || 0);
          oy = patch && !patch.is_new ? patch.position_y : Number(seat.position_y || 0);
       }
       
       groupOrigins[gId] = { x: ox, y: oy, type: tType };
    });

    const rect = document.getElementById('seating-canvas-inner')?.getBoundingClientRect();
    const scaledX = rect ? (clientX - rect.left) / currentZoom : clientX;
    const scaledY = rect ? (clientY - rect.top) / currentZoom : clientY;
    
    setDragState({
      id: element.id,
      type,
      startX: scaledX,
      startY: scaledY,
      originX: groupOrigins[element.id]?.x || 0,
      originY: groupOrigins[element.id]?.y || 0,
      groupOrigins
    });
    setSelectedElement({ id: element.id, type });
  }, [mainMode, layoutDraft, mapSeats, tableBoxes, mapElements, zoomLevel, selectedGroup]);


  const handleCanvasMouseDown = (e: React.MouseEvent) => {
     if (mainMode !== 'edit') return;
     const isBgClick = e.target === e.currentTarget || (e.target as HTMLElement).id === 'seating-canvas-inner' || (e.target as HTMLElement).classList.contains('bg-grid');
     
     if (isBgClick) {
        const rect = e.currentTarget.getBoundingClientRect();
        const startX = e.clientX - rect.left;
        const startY = e.clientY - rect.top;
        
        if (editModeState.action === 'add' && ['wave', 'stage', 'blocked', 'aisle'].includes(editModeState.addType || '')) {
            setDrawState({ active: true, startX, startY, endX: startX, endY: startY });
        } else {
            setSelectionBox({ startX, startY, endX: startX, endY: startY });
            setSelectedGroup([]);
        }
     }
  };

  const onCanvasMove = (clientX: number, clientY: number) => {
    if (drawState?.active) {
        const container = document.getElementById('seating-canvas-inner');
        const rect = container?.getBoundingClientRect();
        if (!rect) return;
        const endX = clientX - rect.left;
        const endY = clientY - rect.top;
        requestAnimationFrame(() => {
            setDrawState(prev => prev ? { ...prev, endX, endY } : null);
        });
        return;
    }
    
    if (selectionBox) {
       const container = document.getElementById('seating-canvas-inner');
       const rect = container?.getBoundingClientRect();
       if (!rect) return;
       const endX = clientX - rect.left;
       const endY = clientY - rect.top;
       // Limit to max 50 updates per second for performance
       requestAnimationFrame(() => {
          setSelectionBox(prev => prev ? { ...prev, endX, endY } : null);
          
          // Live preview of selection
          const minX = Math.min(selectionBox.startX, endX) / zoomLevel / 8;
          const maxX = Math.max(selectionBox.startX, endX) / zoomLevel / 8;
          const minY = Math.min(selectionBox.startY, endY) / zoomLevel / 4;
          const maxY = Math.max(selectionBox.startY, endY) / zoomLevel / 4;
          
          const newSelection: string[] = [];
          
          tableBoxes.forEach(box => {
             const draft = layoutDraft[box.id] as any;
             if (draft?.is_deleted) return;
             const bx = draft && draft.position_x !== undefined ? Number(draft.position_x) : box.x / 8;
             const by = draft && draft.position_y !== undefined ? Number(draft.position_y) : box.y / 4;
             const bw = box.w / 8;
             const bh = box.h / 4;
             if (bx < maxX && bx + bw > minX && by < maxY && by + bh > minY) {
                newSelection.push(box.id);
             }
          });
          
          mapSeats.forEach(seat => {
             if (seat.table_id) return; 
             const draft = layoutDraft[seat.id] as any;
             if (draft?.is_deleted) return;
             const sx = draft && draft.position_x !== undefined ? Number(draft.position_x) : Number(seat.position_x || 0);
             const sy = draft && draft.position_y !== undefined ? Number(draft.position_y) : Number(seat.position_y || 0);
             const sw = 3; 
             const sh = 6; 
             if (sx < maxX && sx + sw > minX && sy < maxY && sy + sh > minY) {
                newSelection.push(seat.id);
             }
          });
          
          mapElements?.forEach(el => {
             const draft = layoutDraft[el.id] as any;
             if (draft?.is_deleted) return;
             const ex = draft && draft.position_x !== undefined ? Number(draft.position_x) : Number(el.position_x || 0);
             const ey = draft && draft.position_y !== undefined ? Number(draft.position_y) : Number(el.position_y || 0);
             const ew = Number(el.width || 8);
             const eh = Number(el.height || 4);
             if (ex < maxX && ex + ew > minX && ey < maxY && ey + eh > minY) {
                newSelection.push(el.id);
             }
          });
          
          setSelectedGroup(newSelection);
       });
       return;
    }
    
    if (!dragState || mainMode !== 'edit') return;
    
    const currentZoom = zoomLevel;
    const container = document.getElementById('seating-canvas-inner');
    const rect = container?.getBoundingClientRect();
    
    const currentScaledX = rect ? (clientX - rect.left) / currentZoom : clientX;
    const currentScaledY = rect ? (clientY - rect.top) / currentZoom : clientY;

    const dx = (currentScaledX - dragState.startX) / 8;
    const dy = (currentScaledY - dragState.startY) / 4;
    
    const nextDraft = { ...layoutDraft };
    
    if (dragState.groupOrigins) {
       Object.keys(dragState.groupOrigins).forEach(id => {
          const startPos = dragState.groupOrigins![id];
          nextDraft[id] = {
             ...nextDraft[id],
             type: startPos.type as any,
             position_x: Math.max(0, Math.round((startPos.x + dx) * 10) / 10),
             position_y: Math.max(0, Math.round((startPos.y + dy) * 10) / 10)
          };
       });
    } else {
       const nextX = Math.max(0, Math.round((dragState.originX + dx) * 10) / 10);
       const nextY = Math.max(0, Math.round((dragState.originY + dy) * 10) / 10);
       nextDraft[dragState.id] = { type: dragState.type, position_x: nextX, position_y: nextY };
    }
    
    setLayoutDraft(nextDraft);
  };

  const endDrag = () => {
    if (drawState?.active) {
        setDrawState(prev => prev ? { ...prev, active: false } : null);
        setDrawModal(prev => ({
            ...prev,
            isOpen: true,
            type: editModeState.addType || 'wave',
            startX: drawState.startX / zoomLevel / 8,
            startY: drawState.startY / zoomLevel / 4,
            endX: drawState.endX / zoomLevel / 8,
            endY: drawState.endY / zoomLevel / 4,
            name: editModeState.addType === 'stage' ? 'المسرح' : editModeState.addType === 'aisle' ? 'ممر' : ''
        }));
        return;
    }

    if (selectionBox) {
       setSelectionBox(null);
       return;
    }
    
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

  
  const handleSeatClick = useCallback((seat: Seat) => {
    if (mainMode === 'edit' && editModeState.action === 'delete') {
       if (seat.status === 'booked') {
          if (!window.confirm('هذا المقعد محجوز! هل أنت متأكد من مسحه؟ (سيتم إلغاء تسكين الشخص)')) return;
       } else {
          if (!window.confirm('هل أنت متأكد من حذف هذا الكرسي؟')) return;
       }
       handleDeleteElement(seat.id, 'seat');
       return;
    }
    if (mainMode === 'assign' && assignMode === 'tables' && seat.seat_class !== 'C') {
        setSelectedSeatId(seat.id);
        setAssignmentModal({ isOpen: true, seat, isTableModal: true, tableId: seat.table_id || null });
        return;
    }
    setSelectedSeatId(seat.id);
    setSelectedElement({ id: seat.id, type: 'seat' });
    setEditSeatState({
      position_x: Number(seat.position_x || 0),
      position_y: Number(seat.position_y || 0),
      row_number: seat.row_number
    });
  }, [mainMode, editModeState.action, assignMode]);
  
  const handleSeatDoubleClick = useCallback((seat: Seat) => {
    if (mainMode === 'assign') {
        setSelectedSeatId(seat.id);
        setAssignmentModal({ isOpen: true, seat, isTableModal: false, tableId: null });
    }
  }, [mainMode]);

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

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-6 space-y-4" dir="rtl">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">Seating Studio</h1>
            <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded-full border border-indigo-500/30">{eventId}</span>
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

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
          <button onClick={() => setMainMode('assign')} className={`px-4 py-2 rounded-md text-sm border ${mainMode === 'assign' ? 'bg-indigo-600 border-indigo-500' : 'border-slate-700 bg-slate-800'}`}>مود التسكين</button>
          <button onClick={() => {
             setMainMode('edit');
             setEditModeState(p => ({...p, action: 'move'}));
          }} className={`px-4 py-2 rounded-md text-sm border ${mainMode === 'edit' ? 'bg-indigo-600 border-indigo-500' : 'border-slate-700 bg-slate-800'}`}>مود التعديل</button>
          <button onClick={initHall} className="px-4 py-2 rounded-md text-sm border border-slate-700 bg-slate-800 text-rose-400">تهيئة القاعة (مسح وإعادة بناء)</button>
          <button onClick={async () => {
             if (!window.confirm('هل أنت متأكد من تسكين جميع العملاء المتبقين عشوائياً؟')) return;
             try {
                setLoading(true);
                const eligible = attendees.filter(a => !a.seat_number);
                await api.post('/seating/auto-assign-all', { event_id: eventId });
                await loadMap();
             } catch(e: any) { alert(e.message); }
             finally { setLoading(false); }
          }} className="px-4 py-2 rounded-md text-sm bg-emerald-600">تسكين تلقائي شامل للكل</button>
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
        {mainMode === 'assign' && (
           <>
             <button onClick={() => setAssignMode('tables')} className={`px-3 py-2 rounded-md text-sm border ${assignMode === 'tables' ? 'bg-indigo-600 border-indigo-500' : 'bg-slate-900 border-slate-700'}`}>الترابيزات (Class A, B)</button>
             <button onClick={() => setAssignMode('chairs')} className={`px-3 py-2 rounded-md text-sm border ${assignMode === 'chairs' ? 'bg-indigo-600 border-indigo-500' : 'bg-slate-900 border-slate-700'}`}>الكراسي الحرة (Class C)</button>
           </>
        )}
        {mainMode === 'edit' && (
           <>
             <button onClick={() => setEditModeState(p => ({...p, action: 'add'}))} className={`px-3 py-2 rounded-md text-sm border ${editModeState.action === 'add' ? 'bg-emerald-600 border-emerald-500' : 'bg-slate-900 border-slate-700'}`}>إضافة (Add)</button>
             <button onClick={() => setEditModeState(p => ({...p, action: 'move'}))} className={`px-3 py-2 rounded-md text-sm border ${editModeState.action === 'move' ? 'bg-amber-600 border-amber-500' : 'bg-slate-900 border-slate-700'}`}>تحريك (Move)</button>
             <button onClick={() => setEditModeState(p => ({...p, action: 'edit_details'}))} className={`px-3 py-2 rounded-md text-sm border ${editModeState.action === 'edit_details' ? 'bg-blue-600 border-blue-500' : 'bg-slate-900 border-slate-700'}`}>تعديل تفاصيل (Edit Details)</button>
             <button onClick={() => setEditModeState(p => ({...p, action: 'delete'}))} className={`px-3 py-2 rounded-md text-sm border ${editModeState.action === 'delete' ? 'bg-red-600 border-red-500' : 'bg-slate-900 border-slate-700'}`}>مسح (Delete)</button>
           </>
        )}
        <div className="px-3 py-2 rounded-md bg-slate-900 border border-slate-700 text-sm">الإجمالي: {seatStats.total}</div>
        <div className="px-3 py-2 rounded-md bg-slate-900 border border-slate-700 text-sm">المتاح: {seatStats.available}</div>
      </div>

      {mainMode === 'edit' && editModeState.action === 'add' && (
        <div className="rounded-xl border border-emerald-800 bg-emerald-950/20 p-4 flex flex-wrap gap-3 items-center">
          <label className="text-sm font-bold text-emerald-400">نوع الإضافة:</label>
          <select 
            value={editModeState.addType || 'table'} 
            onChange={e => setEditModeState(p => ({...p, addType: e.target.value as any}))}
            className="rounded-md px-3 py-2 bg-slate-800 border border-slate-700 text-sm"
          >
            <option value="table">ترابيزة (Table)</option>
            <option value="wave">ويف (Wave)</option>
            <option value="seat">كرسي فردي (Chair)</option>
            <option value="blocked">منطقة محظورة (Blocked)</option>
            <option value="stage">المسرح (Stage)</option>
            <option value="aisle">ممر (Aisle)</option>
          </select>

          {['table', 'seat'].includes(editModeState.addType || '') && (
            <select 
              value={editModeState.addClass || 'A'} 
              onChange={e => setEditModeState(p => ({...p, addClass: e.target.value as any}))}
              className="rounded-md px-3 py-2 bg-slate-800 border border-slate-700 text-sm"
            >
              <option value="A">Class A</option>
              <option value="B">Class B</option>
              <option value="C">Class C</option>
            </select>
          )}

          {['table'].includes(editModeState.addType || '') && (
            <>
              <input 
                type="text" 
                placeholder="اسم الترابيزة (مثال: T1)"
                value={editModeState.addName}
                onChange={e => setEditModeState(p => ({...p, addName: e.target.value}))}
                className="rounded-md px-3 py-2 bg-slate-800 border border-slate-700 text-sm w-48"
              />
              <input 
                type="number" 
                placeholder="عدد الكراسي"
                value={editModeState.addCount}
                onChange={e => setEditModeState(p => ({...p, addCount: Number(e.target.value)}))}
                className="rounded-md px-3 py-2 bg-slate-800 border border-slate-700 text-sm w-32"
              />
              <button 
                onClick={() => handleAddElement(
                  editModeState.addType || 'table',
                  editModeState.addClass || 'A',
                  editModeState.addName,
                  editModeState.addCount
                )}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-sm font-bold transition"
              >
                حفظ وإضافة
              </button>
            </>
          )}
          
          {['wave', 'stage', 'blocked', 'aisle'].includes(editModeState.addType || '') && (
             <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 border border-amber-500/50 rounded-md text-amber-300 text-sm font-bold animate-pulse shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                <span className="text-lg">🖌️</span>
                اضغط واسحب الماوس على القاعة لرسم العنصر
             </div>
          )}
        </div>
      )}

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
            <div className="h-12 rounded-md border border-indigo-800 bg-indigo-900/30 text-center font-bold flex items-center justify-center mb-3">STAGE / المسرح</div>
            <div id="seating-canvas-container" className="relative rounded-md border border-slate-800 overflow-auto" style={{ height: 600 }}>
              <div
                id="seating-canvas-inner"
                className="relative min-w-[1600px] min-h-[1200px]"
                onMouseMove={(e) => onCanvasMove(e.clientX, e.clientY)}
                onMouseDown={handleCanvasMouseDown}
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
              {drawState?.active && editModeState.addType === 'wave' && (
                   <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-[200]">
                       <line 
                           x1={drawState.startX / zoomLevel} 
                           y1={drawState.startY / zoomLevel} 
                           x2={drawState.endX / zoomLevel} 
                           y2={drawState.endY / zoomLevel} 
                           stroke="#0ea5e9" strokeWidth="4" strokeDasharray="5,5" 
                       />
                   </svg>
              )}
              {drawState?.active && editModeState.addType === 'aisle' && (
                   <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-[200]">
                       <line 
                           x1={drawState.startX / zoomLevel} 
                           y1={drawState.startY / zoomLevel} 
                           x2={drawState.endX / zoomLevel} 
                           y2={drawState.endY / zoomLevel} 
                           stroke="#f8fafc" strokeWidth="6" 
                       />
                   </svg>
              )}
              {drawState?.active && ['stage', 'blocked'].includes(editModeState.addType || '') && (
                 <div 
                    className="absolute pointer-events-none z-[200]"
                    style={{
                       left: Math.min(drawState.startX, drawState.endX) / zoomLevel,
                       top: Math.min(drawState.startY, drawState.endY) / zoomLevel,
                       width: Math.abs(drawState.endX - drawState.startX) / zoomLevel,
                       height: Math.abs(drawState.endY - drawState.startY) / zoomLevel,
                       border: editModeState.addType === 'stage' ? '2px dashed #6366f1' : '2px dashed #ef4444',
                       backgroundColor: editModeState.addType === 'stage' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(239, 68, 68, 0.2)'
                    }}
                 />
              )}
              {selectionBox && (
                 <div 
                    className="absolute border border-purple-500 bg-purple-500/20 pointer-events-none z-[200]"
                    style={{
                       left: Math.min(selectionBox.startX, selectionBox.endX) / zoomLevel,
                       top: Math.min(selectionBox.startY, selectionBox.endY) / zoomLevel,
                       width: Math.abs(selectionBox.endX - selectionBox.startX) / zoomLevel,
                       height: Math.abs(selectionBox.endY - selectionBox.startY) / zoomLevel
                    }}
                 />
              )}
              {tableBoxes.map((box) => {
                  const draft = layoutDraft[box.id] as any;
                  if (draft?.is_deleted) return null;
                  const x = draft ? draft.position_x * 8 : box.x;
                  const y = draft ? draft.position_y * 4 : box.y;
                  const isFade = mainMode === 'assign' && assignMode === 'chairs';
                  return (
                     <div key={box.id} style={{ opacity: isFade ? 0.2 : 1, pointerEvents: isFade ? 'none' : 'auto', transition: 'opacity 0.3s' }}>
                       <TableNode 
                          box={{ ...box, x, y }} 
                          selected={selectedElement?.id === box.id} 
                          mode={mainMode === 'edit' && editModeState.action === 'move' ? 'edit' : 'view'}
                          onDoubleClick={(id: string, currentName: string) => {
                             if (mainMode === 'assign') {
                                setAssignmentModal({ isOpen: true, seat: null, isTableModal: true, tableId: id });
                             } else if (mainMode === 'edit' && editModeState.action === 'edit_details') {
                                const currentTable = payload.tables.find(t => t.id === id);
                                setEditTableModal({ 
                                   isOpen: true, 
                                   tableId: id, 
                                   currentName,
                                   currentClass: currentTable?.seat_class || 'A',
                                   currentCount: currentTable?.seats_count || 12
                                });
                             }
                          }}
                          onDragStart={(b: any, type: string, clientX: number, clientY: number, target: any) => {
                             if (mainMode === 'edit' && editModeState.action === 'move') {
                                startDrag({ id: b.id, position_x: box.x/8, position_y: box.y/4 }, 'table', clientX, clientY, target);
                                setSelectedElement({ id: b.id, type: 'table' });
                             } else if (mainMode === 'edit' && editModeState.action === 'delete') {
                                if (window.confirm('هل أنت متأكد من مسح هذه الترابيزة بالكامل؟ (سيتم إلغاء تسكين جميع كراسيها)')) {
                                   handleDeleteElement(b.id, 'table');
                                }
                             }
                          }}
                       />
                     </div>
                  );
              })} 
              {/* Drawn Shapes Layer */}
              {mapElements?.map((el) => {
                  const draft = layoutDraft[el.id] as any;
                  if (draft?.is_deleted) return null;
                  const x = draft ? draft.position_x * 8 : Number(el.position_x || 0) * 8;
                  const y = draft ? draft.position_y * 4 : Number(el.position_y || 0) * 4;
                  const w = Number(el.width || 8) * 8;
                  const h = Number(el.height || 4) * 4;
                  
                  let meta = { label: el.name || '', shape: 'rect', startX: 0, startY: 0, endX: 0, endY: 0 };
                  try { if (el.name && el.name.startsWith('{')) meta = JSON.parse(el.name); } catch(e) {}
                  
                  const isSelected = selectedGroup.includes(el.id) || selectedElement?.id === el.id;
                  const baseClasses = `absolute flex items-center justify-center transition-all ${mainMode === 'edit' ? (editModeState.action === 'move' ? 'cursor-move' : 'cursor-pointer') : ''} ${isSelected ? 'outline outline-2 outline-orange-500 outline-dashed outline-offset-2 z-[60]' : 'z-0'}`;
                  
                  if (el.type === 'aisle' || meta.shape === 'line') {
                       const length = Math.hypot((meta.endX - meta.startX)*8, (meta.endY - meta.startY)*4);
                       const angle = Math.atan2((meta.endY - meta.startY)*4, (meta.endX - meta.startX)*8) * 180 / Math.PI;
                       return (
                          <div 
                              key={el.id} 
                              className={`${baseClasses} bg-white/40 rounded-full hover:bg-white/60`} 
                              style={{
                                  left: (meta.startX || 0) * 8, top: (meta.startY || 0) * 4,
                                  width: length, height: 6, transform: `rotate(${angle}deg)`, transformOrigin: '0 0'
                              }} 
                              onMouseDown={(e) => {
                                 if (mainMode === 'edit' && editModeState.action === 'move') { e.stopPropagation(); startDrag(el, 'element', e.clientX, e.clientY, e.currentTarget); }
                                 else if (mainMode === 'edit' && editModeState.action === 'delete') { e.stopPropagation(); handleDeleteElement(el.id, 'element'); }
                              }}
                              title={meta.label || 'ممر'}
                          >
                              {meta.label && <span className="absolute -top-6 text-white/50 text-xs whitespace-nowrap pointer-events-none drop-shadow-md" style={{transform: `rotate(${-angle}deg)`}}>{meta.label}</span>}
                          </div>
                       );
                  }
                  
                  let shapeClasses = 'bg-white/10 border-2 border-white/40 text-white/50';
                  if (el.type === 'stage') shapeClasses = 'bg-indigo-900/60 border-2 border-indigo-500 text-indigo-200 text-xl font-black shadow-[0_0_30px_rgba(79,70,229,0.3)]';
                  if (el.type === 'element' || el.type === 'blocked') {
                      shapeClasses = 'bg-red-900/30 border-2 border-red-500 text-red-200';
                      if (meta.shape === 'hollow_rect') shapeClasses = 'border-4 border-red-600 bg-transparent text-red-500';
                      if (meta.shape === 'hollow_circle') shapeClasses = 'border-4 border-red-600 bg-transparent rounded-full text-red-500';
                  }
                  
                  if (meta.shape === 'circle') shapeClasses += ' rounded-full';
                  if (meta.shape === 'half-circle') shapeClasses += ' rounded-t-full';
                  if (meta.shape === 'quarter-circle') shapeClasses += ' rounded-tl-full';

                  return (
                     <div 
                        key={el.id}
                        onMouseDown={(e) => {
                           if (mainMode === 'edit' && editModeState.action === 'move') {
                              e.stopPropagation();
                              startDrag(el, 'element', e.clientX, e.clientY, e.currentTarget);
                           } else if (mainMode === 'edit' && editModeState.action === 'delete') {
                              e.stopPropagation();
                              handleDeleteElement(el.id, 'element');
                           }
                        }}
                        className={`${baseClasses} ${shapeClasses}`}
                        style={{ left: x, top: y, width: w, height: h }}
                     >
                        <span className="pointer-events-none drop-shadow-md text-center px-2">{meta.label || (el.type === 'stage' ? 'STAGE / المسرح' : el.name || 'محظور')}</span>
                     </div>
                  );
              })}
              {/* Draw Modals */}
              {drawModal.isOpen && (
                 <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setDrawModal(p => ({...p, isOpen: false}))}>
                    <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-sm p-6 flex flex-col gap-4 shadow-2xl" onClick={e => e.stopPropagation()}>
                       <h3 className="text-lg font-bold text-white">
                          {drawModal.type === 'wave' ? 'تفاصيل الـ Wave' : drawModal.type === 'stage' ? 'تفاصيل المسرح' : drawModal.type === 'aisle' ? 'تفاصيل الممر' : 'تفاصيل المنطقة المحظورة'}
                       </h3>
                       
                       <label className="text-sm text-slate-300">الاسم / المعرف</label>
                       <input 
                         type="text" autoFocus value={drawModal.name} onChange={e => setDrawModal(p => ({...p, name: e.target.value}))}
                         className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                         placeholder={drawModal.type === 'wave' ? 'مثال: W1' : 'الاسم...'}
                       />
                       
                       {drawModal.type === 'wave' && (
                          <>
                             <label className="text-sm text-slate-300">عدد الكراسي</label>
                             <input type="number" value={drawModal.count} onChange={e => setDrawModal(p => ({...p, count: Number(e.target.value)}))} className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white" />
                             
                             <label className="text-sm text-slate-300">الفئة</label>
                             <select value={drawModal.seatClass} onChange={e => setDrawModal(p => ({...p, seatClass: e.target.value}))} className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white">
                               <option value="A">Class A</option>
                               <option value="B">Class B</option>
                               <option value="C">Class C</option>
                             </select>
                          </>
                       )}

                       {(drawModal.type === 'stage' || drawModal.type === 'blocked') && (
                          <>
                             <label className="text-sm text-slate-300">الشكل الهندسي</label>
                             <select value={drawModal.shape} onChange={e => setDrawModal(p => ({...p, shape: e.target.value}))} className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white">
                               {drawModal.type === 'stage' ? (
                                  <>
                                     <option value="rect">مستطيل / مربع</option>
                                     <option value="circle">دائري</option>
                                     <option value="half-circle">نصف دائري</option>
                                     <option value="quarter-circle">ربع دائري</option>
                                  </>
                               ) : (
                                  <>
                                     <option value="rect">مستطيل / مربع (مصمت)</option>
                                     <option value="hollow_rect">مستطيل مفرغ</option>
                                     <option value="circle">دائري مصمت</option>
                                     <option value="hollow_circle">دائري مفرغ</option>
                                     <option value="line">خط مستقيم</option>
                                  </>
                               )}
                             </select>
                          </>
                       )}

                       <div className="flex gap-2 mt-4">
                         <button 
                           onClick={async () => {
                              try {
                                  setLoading(true);
                                  const gov = eventId.split('-')[0] || 'MINYA';
                                  const timestamp = Date.now();
                                  const nextDraft = { ...layoutDraft };
                                  
                                  if (drawModal.type === 'wave') {
                                      const count = drawModal.count;
                                      for (let i = 0; i < count; i++) {
                                          const t = count > 1 ? i / (count - 1) : 0.5;
                                          const sx = drawModal.startX + t * (drawModal.endX - drawModal.startX);
                                          const sy = drawModal.startY + t * (drawModal.endY - drawModal.startY);
                                          const newId = `${gov}-${drawModal.seatClass}-${drawModal.name}-S${i+1}-${crypto.randomUUID().slice(0,4)}`;
                                          
                                          nextDraft[newId] = {
                                              is_new: true,
                                              type: 'seat',
                                              seat_class: drawModal.seatClass,
                                              wave_number: drawModal.name,
                                              seat_number: i + 1,
                                              seat_code: `${drawModal.seatClass}-${drawModal.name}-S${i+1}`,
                                              position_x: Math.round(sx * 10) / 10,
                                              position_y: Math.round(sy * 10) / 10
                                          };
                                      }
                                  } else {
                                      const px = Math.min(drawModal.startX, drawModal.endX);
                                      const py = Math.min(drawModal.startY, drawModal.endY);
                                      const w = Math.abs(drawModal.endX - drawModal.startX);
                                      const h = Math.abs(drawModal.endY - drawModal.startY);
                                      const meta = JSON.stringify({ label: drawModal.name, shape: drawModal.type === 'aisle' ? 'line' : drawModal.shape, startX: drawModal.startX, startY: drawModal.startY, endX: drawModal.endX, endY: drawModal.endY });
                                      
                                      const newId = `local-element-${timestamp}`;
                                      nextDraft[newId] = {
                                          is_new: true,
                                          type: drawModal.type === 'blocked' ? 'element' : drawModal.type,
                                          position_x: px,
                                          position_y: py,
                                          width: w,
                                          height: h,
                                          name: meta
                                      };
                                  }
                                  
                                  setLayoutDraft(nextDraft as any);
                                  commitDraftHistory(nextDraft as any);
                                  setDrawModal(p => ({...p, isOpen: false}));
                              } catch(e: any) { alert(e.message); } finally { setLoading(false); }
                           }}
                           className="flex-1 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition font-bold"
                         >
                           إضافة
                         </button>
                         <button onClick={() => setDrawModal(p => ({...p, isOpen: false}))} className="flex-1 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition">إلغاء</button>
                       </div>
                    </div>
                 </div>
              )}

              {/* Edit Table Modal */}
              {editTableModal.isOpen && (
                 <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setEditTableModal({isOpen: false, tableId: '', currentName: '', currentClass: 'A', currentCount: 12})}>
                    <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-sm p-6 flex flex-col gap-4 shadow-2xl" onClick={e => e.stopPropagation()}>
                       <h3 className="text-lg font-bold text-white">تعديل تفاصيل الترابيزة</h3>
                       
                       <label className="text-sm text-slate-300">اسم/رقم الترابيزة</label>
                       <input 
                         type="text" 
                         autoFocus
                         value={editTableModal.currentName}
                         onChange={e => setEditTableModal(p => ({...p, currentName: e.target.value}))}
                         className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                       />
                       
                       <label className="text-sm text-slate-300">الفئة</label>
                       <select 
                         value={editTableModal.currentClass}
                         onChange={e => setEditTableModal(p => ({...p, currentClass: e.target.value}))}
                         className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                       >
                         <option value="A">Class A</option>
                         <option value="B">Class B</option>
                         <option value="C">Class C</option>
                       </select>
                       
                       <label className="text-sm text-slate-300">عدد الكراسي</label>
                       <input 
                         type="number" 
                         value={editTableModal.currentCount}
                         onChange={e => setEditTableModal(p => ({...p, currentCount: Number(e.target.value)}))}
                         className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                       />

                       <div className="flex gap-2 mt-4">
                         <button 
                           onClick={async () => {
                              const tableSeats = payload.seats.filter(s => s.table_id === editTableModal.tableId);
                              if (editTableModal.currentCount < tableSeats.length) {
                                  const emptySeats = tableSeats.filter(s => s.status === 'available');
                                  const seatsToRemoveCount = tableSeats.length - editTableModal.currentCount;
                                  
                                  if (seatsToRemoveCount > emptySeats.length) {
                                      const bookedToRemove = seatsToRemoveCount - emptySeats.length;
                                      if (!window.confirm(`تنبيه! سيتم حذف ${bookedToRemove} مقعد محجوز وإلغاء تسكين أصحابهم. هل تريد المتابعة؟`)) {
                                          return;
                                      }
                                  }
                              }
                              try {
                                 setLoading(true);
                                 await api.post('/seating/edit-table', { 
                                    event_id: eventId, 
                                    table_id: editTableModal.tableId, 
                                    name: editTableModal.currentName,
                                    seat_class: editTableModal.currentClass,
                                    chairs_count: editTableModal.currentCount
                                 });
                                 await loadMap();
                                 setEditTableModal({isOpen: false, tableId: '', currentName: '', currentClass: 'A', currentCount: 12});
                              } catch(e: any) {
                                 alert(e.message || 'فشل تعديل الترابيزة');
                              } finally {
                                 setLoading(false);
                              }
                           }}
                           className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-bold"
                         >
                           حفظ التعديلات
                         </button>
                         <button 
                           onClick={() => setEditTableModal({isOpen: false, tableId: '', currentName: '', currentClass: 'A', currentCount: 12})}
                           className="flex-1 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition"
                         >
                           إلغاء
                         </button>
                       </div>
                    </div>
                 </div>
              )}
              {assignmentModal.isOpen && !assignmentModal.isTableModal && assignmentModal.seat && (
                 <AssignmentModalComponent 
                    isOpen={assignmentModal.isOpen} 
                    seat={assignmentModal.seat} 
                    attendees={attendees} 
                    mapSeats={mapSeats}
                    onClose={() => setAssignmentModal({isOpen: false, seat: null, isTableModal: false, tableId: null})} 
                    onAssign={(id: string) => {
                       setAssignmentModal({isOpen: false, seat: null, isTableModal: false, tableId: null});
                       assignSelected(id);
                    }}
                    onUnassign={unassignSelected}
                 />
              )}
              {assignmentModal.isOpen && assignmentModal.isTableModal && assignmentModal.tableId && (
                 <TableAssignModalComponent
                    isOpen={assignmentModal.isOpen}
                    tableId={assignmentModal.tableId}
                    mapSeats={payload.seats}
                    attendees={attendees}
                    onClose={() => setAssignmentModal({isOpen: false, seat: null, isTableModal: false, tableId: null})}
                    onAssign={(seatId: string, attendeeId: string) => {
                       setSelectedSeatId(seatId);
                       assignSelected(attendeeId, seatId);
                    }}
                    onUnassign={(seatId: string) => {
                       setSelectedSeatId(seatId);
                       unassignSelected(seatId);
                    }}
                 />
              )}
              {mapSeats.map((seat) => {
                const seatView = getSeatView(seat) as any;
                if (seatView.is_deleted) return null;
                const isTableSeat = !!seat.table_id;
                
                // Also hide seat if its parent table is deleted in draft
                if (isTableSeat) {
                   const tableDraft = layoutDraft[seat.table_id] as any;
                   if (tableDraft?.is_deleted) return null;
                }
                const isFade = (mainMode === 'assign' && assignMode === 'tables') || 
                               (mainMode === 'assign' && assignMode === 'chairs' && isTableSeat) || 
                               (mainMode === 'edit' && editModeState.action === 'move' && isTableSeat) ||
                               (mainMode === 'edit' && editModeState.action === 'edit_details' && isTableSeat);
                const isScale = mainMode === 'assign' && assignMode === 'chairs' && !isTableSeat;
                
                return (
                   <div key={seat.id} style={{ opacity: isFade ? 0.2 : 1, pointerEvents: isFade ? 'none' : 'auto', transition: 'opacity 0.3s, transform 0.3s', transform: isScale ? 'scale(1.2)' : 'scale(1)' }}>
                     <SeatNode 
                        seat={seatView} 
                        selected={selectedSeatId === seat.id}
                        inGroup={selectedGroup.includes(seat.id)}
                        mode={mainMode === 'edit' && editModeState.action === 'move' ? 'edit' : 'view'}
                        onSeatClick={handleSeatClick}
                        onSeatDoubleClick={handleSeatDoubleClick}
                        onDragStart={startDrag}
                     />
                   </div>
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

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 flex flex-col max-h-[500px]">
             <h2 className="text-sm font-bold mb-3 flex justify-between items-center">
                <span>قائمة الانتظار</span>
                <span className="bg-indigo-600 text-white px-2 py-0.5 rounded text-xs">
                   {attendees.filter((a: any) => !mapSeats.some(s => s.attendee_id === a.id)).length}
                </span>
             </h2>
             
             <div className="mb-3">
                <input 
                   type="text" 
                   placeholder="بحث في المنتظرين..." 
                   value={waitingListSearch}
                   onChange={e => setWaitingListSearch(e.target.value)}
                   className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white focus:ring-1 focus:ring-indigo-500"
                />
             </div>

             <div className="overflow-y-auto pr-1 flex flex-col gap-4 flex-1 custom-scrollbar">
                {['A', 'B', 'C'].map(cls => {
                   const classAttendees = attendees.filter((a: any) => 
                      a.seat_class === cls && 
                      !mapSeats.some(s => s.attendee_id === a.id) && 
                      (waitingListSearch === '' || 
                       (a.full_name || '').toLowerCase().includes(waitingListSearch.toLowerCase()) || 
                       (a.phone || '').includes(waitingListSearch))
                   );
                   
                   if (classAttendees.length === 0 && waitingListSearch !== '') return null;
                   
                   return (
                      <div key={cls} className="space-y-2">
                         <div className="flex items-center gap-2 sticky top-0 bg-slate-900 py-1 z-10">
                            <span className={`w-2 h-2 rounded-full ${cls === 'A' ? 'bg-amber-500' : cls === 'B' ? 'bg-blue-500' : 'bg-slate-500'}`} />
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Class {cls} ({classAttendees.length})</span>
                            <div className="flex-1 h-[1px] bg-slate-800" />
                         </div>
                         <div className="flex flex-col gap-1.5">
                            {classAttendees.map((a: any) => (
                               <div 
                                  key={a.id} 
                                  className="p-2 bg-slate-800/50 border border-slate-700/50 rounded text-sm flex justify-between items-center hover:bg-slate-800 transition group cursor-pointer"
                                  onClick={() => {
                                     if (selectedSeatId) {
                                        assignSelected(a.id);
                                     } else {
                                        alert('برجاء اختيار مقعد أولاً من الخريطة');
                                     }
                                  }}
                               >
                                  <div className="truncate text-right">
                                    <div className="font-bold text-white truncate text-xs">{a.full_name}</div>
                                    <div className="text-[10px] text-slate-500">{a.phone || '-'}</div>
                                  </div>
                                  <div className="opacity-0 group-hover:opacity-100 transition">
                                     <span className="text-[10px] bg-indigo-600 text-white px-1.5 py-0.5 rounded">تسكين</span>
                                  </div>
                               </div>
                            ))}
                         </div>
                      </div>
                   );
                })}
                {attendees.filter((a: any) => !mapSeats.some(s => s.attendee_id === a.id)).length === 0 && (
                   <div className="text-xs text-slate-500 text-center py-4">لا يوجد مشتركون في قائمة الانتظار</div>
                )}
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

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 hidden">
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="text-sm font-bold mb-3 flex justify-between items-center">
           <span>المسكنين في هذه القاعة</span>
           <span className="text-xs text-slate-500">إجمالي المسكنين: {attendees.filter(a => mapSeats.some(s => s.attendee_id === a.id)).length}</span>
        </h2>
        <div className="max-h-56 overflow-auto custom-scrollbar">
          <table className="w-full text-sm">
            <thead className="text-slate-400 sticky top-0 bg-slate-900 z-10">
              <tr>
                <th className="text-right p-2">الاسم</th>
                <th className="text-right p-2">Class</th>
                <th className="text-right p-2">المقعد</th>
                <th className="text-right p-2">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {attendees
                .filter((a) => mapSeats.some(s => s.attendee_id === a.id))
                .sort((a, b) => (a.seat_class || '').localeCompare(b.seat_class || ''))
                .map((a) => {
                   const seat = mapSeats.find(s => s.attendee_id === a.id) || payload.seats.find(s => s.attendee_id === a.id);
                   return (
                    <tr key={a.id} className="border-t border-slate-800 hover:bg-slate-800/50 transition">
                      <td className="p-2">
                         <div className="font-bold">{a.full_name}</div>
                         <div className="text-[10px] text-slate-500">{a.phone}</div>
                      </td>
                      <td className="p-2 text-center">
                         <span className={`px-2 py-0.5 rounded text-[10px] ${a.seat_class === 'A' ? 'bg-amber-500/20 text-amber-500' : a.seat_class === 'B' ? 'bg-blue-500/20 text-blue-500' : 'bg-slate-500/20 text-slate-500'}`}>
                            {a.seat_class}
                         </span>
                      </td>
                      <td className="p-2 text-indigo-400 font-mono text-xs">{a.barcode || seat?.seat_code || '-'}</td>
                      <td className="p-2 text-left">
                         <button 
                            onClick={() => {
                               const sid = seat?.id || payload.seats.find(s => s.attendee_id === a.id)?.id;
                               if (sid) unassignSelected(sid);
                            }}
                            className="text-red-400 hover:text-red-300 text-[10px] border border-red-900/50 px-2 py-1 rounded bg-red-950/20"
                         >
                            إلغاء التسكين
                         </button>
                      </td>
                    </tr>
                   );
                })
              }
              {attendees.filter((a) => mapSeats.some(s => s.attendee_id === a.id)).length === 0 && (
                  <tr>
                     <td colSpan={4} className="p-8 text-center text-slate-500">لا يوجد مسكنين حالياً في هذه القاعة</td>
                  </tr>
               )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SeatingManagement;
