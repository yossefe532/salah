import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
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
  payment_type?: 'deposit' | 'full' | string;
  payment_amount?: number | null;
  phone?: string | null;
  phone_primary?: string | null;
  preferred_neighbor_name?: string | null;
  preferred_neighbor_ids?: string[];
  seat_number?: number | null;
  barcode?: string | null;
  profile_photo_url?: string | null;
  seat_change_pending?: boolean;
  seat_change_last_at?: string | null;
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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getLocalDraftKey = (eventId: string) => `seating-layout-draft:${eventId}`;

const parseElementMeta = (element: any) => {
  const fallback = {
    label: element?.name || '',
    shape: element?.type === 'aisle' ? 'line' : 'rect',
    startX: Number(element?.position_x || 0),
    startY: Number(element?.position_y || 0),
    endX: Number((element?.position_x || 0) + (element?.width || 8)),
    endY: Number((element?.position_y || 0) + (element?.height || 0)),
    lineWidth: 14
  };
  try {
    if (element?.name && String(element.name).startsWith('{')) {
      const parsed = JSON.parse(String(element.name));
      return {
        ...fallback,
        ...parsed,
        lineWidth: clamp(Number(parsed?.lineWidth || fallback.lineWidth), 6, 120)
      };
    }
  } catch {
    // Keep fallback
  }
  return fallback;
};

const getElementLineGeometryPx = (element: any) => {
  const meta = parseElementMeta(element);
  const originX = Math.min(Number(meta.startX || 0), Number(meta.endX || 0));
  const originY = Math.min(Number(meta.startY || 0), Number(meta.endY || 0));
  const deltaX = (Number(element?.position_x || 0) - originX) * 8;
  const deltaY = (Number(element?.position_y || 0) - originY) * 4;
  const startXPx = Number(meta.startX || 0) * 8 + deltaX;
  const startYPx = Number(meta.startY || 0) * 4 + deltaY;
  const endXPx = Number(meta.endX || 0) * 8 + deltaX;
  const endYPx = Number(meta.endY || 0) * 4 + deltaY;
  const lineWidthPx = clamp(Number(meta.lineWidth || 14), 6, 120);
  return {
    meta,
    startXPx,
    startYPx,
    endXPx,
    endYPx,
    lineWidthPx,
    lengthPx: Math.hypot(endXPx - startXPx, endYPx - startYPx),
    angleDeg: Math.atan2(endYPx - startYPx, endXPx - startXPx) * 180 / Math.PI
  };
};

const getElementBoundsPx = (element: any) => {
  const meta = parseElementMeta(element);
  const isLine = element?.type === 'aisle' || meta.shape === 'line';
  if (isLine) {
    const geo = getElementLineGeometryPx(element);
    const minX = Math.min(geo.startXPx, geo.endXPx) - geo.lineWidthPx / 2;
    const maxX = Math.max(geo.startXPx, geo.endXPx) + geo.lineWidthPx / 2;
    const minY = Math.min(geo.startYPx, geo.endYPx) - geo.lineWidthPx / 2;
    const maxY = Math.max(geo.startYPx, geo.endYPx) + geo.lineWidthPx / 2;
    return { left: minX, top: minY, right: maxX, bottom: maxY };
  }
  const x = Number(element?.position_x || 0) * 8;
  const y = Number(element?.position_y || 0) * 4;
  const w = Number(element?.width || 8) * 8;
  const h = Number(element?.height || 4) * 4;
  return { left: x, top: y, right: x + w, bottom: y + h };
};

const SeatNode = React.memo(({ seat, selected, mode, onSeatClick, onSeatDoubleClick, onDragStart, onTouchDragEnd, inGroup }: any) => {
  const lastTapRef = React.useRef(0);
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const touchMovedRef = React.useRef(false);
  return (
    <button
      onClick={(e) => {
         e.stopPropagation();
         onSeatClick(seat, e);
      }}
      onDoubleClick={(e) => {
         e.stopPropagation();
         onSeatDoubleClick(seat);
      }}
      onMouseDown={(e) => {
         e.preventDefault();
         e.stopPropagation();
         onDragStart(seat, 'seat', e.clientX, e.clientY, e.currentTarget, e);
      }}
      onTouchEnd={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (touchMovedRef.current) {
          onTouchDragEnd?.();
          touchMovedRef.current = false;
          touchStartRef.current = null;
          return;
        }
        const now = Date.now();
        if (now - lastTapRef.current < 280) {
          onSeatDoubleClick(seat);
        } else {
          onSeatClick(seat);
        }
        lastTapRef.current = now;
      }}
      onTouchStart={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const t = e.touches[0];
        touchStartRef.current = { x: t.clientX, y: t.clientY };
        touchMovedRef.current = false;
        if (mode === 'edit') {
          onDragStart(seat, 'seat', t.clientX, t.clientY, e.currentTarget, e);
        }
      }}
      onTouchMove={(e) => {
        const start = touchStartRef.current;
        if (!start) return;
        const t = e.touches[0];
        if (Math.hypot(t.clientX - start.x, t.clientY - start.y) > 6) {
          touchMovedRef.current = true;
        }
      }}
      className={`absolute select-none text-[8px] w-6 h-6 rounded-full border flex flex-col items-center justify-center text-white ${selected ? 'bg-blue-600 ring-2 ring-blue-300 scale-110 z-10' : (statusColor[seat.status] || 'bg-slate-500')} ${mode === 'edit' ? 'cursor-move' : ''} ${inGroup ? 'outline outline-2 outline-orange-500 outline-dashed outline-offset-2 z-20' : 'border-white/20'}`}
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

const TableNode = React.memo(({ box, selected, mode, onDoubleClick, onDragStart, onTouchDragEnd, inGroup }: any) => {
  const lastTapRef = React.useRef(0);
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const touchMovedRef = React.useRef(false);
  return (
    <div
      onDoubleClick={(e) => {
         e.stopPropagation();
         onDoubleClick(box.id, box.id.split('-T')[1]);
      }}
      onMouseDown={(e) => {
         e.preventDefault();
         e.stopPropagation();
         onDragStart(box, 'table', e.clientX, e.clientY, e.currentTarget, e);
      }}
      onTouchEnd={(e) => {
         e.preventDefault();
         e.stopPropagation();
         if (touchMovedRef.current) {
            onTouchDragEnd?.();
            touchMovedRef.current = false;
            touchStartRef.current = null;
            return;
         }
         const now = Date.now();
         if (now - lastTapRef.current < 280) {
            onDoubleClick(box.id, box.id.split('-T')[1]);
         }
         lastTapRef.current = now;
      }}
      onTouchStart={(e) => {
         e.preventDefault();
         e.stopPropagation();
         const t = e.touches[0];
         touchStartRef.current = { x: t.clientX, y: t.clientY };
         touchMovedRef.current = false;
         if (mode === 'edit') {
           onDragStart(box, 'table', t.clientX, t.clientY, e.currentTarget, e);
         }
      }}
      onTouchMove={(e) => {
         const start = touchStartRef.current;
         if (!start) return;
         const t = e.touches[0];
         if (Math.hypot(t.clientX - start.x, t.clientY - start.y) > 6) {
           touchMovedRef.current = true;
         }
      }}
      className={`absolute select-none border-2 ${selected ? 'border-red-500 bg-red-500/40' : 'border-indigo-400 bg-indigo-600/30'} rounded-lg flex flex-col items-center justify-center ${mode === 'edit' ? 'cursor-move' : 'cursor-pointer hover:bg-indigo-500/50'} ${inGroup ? 'outline outline-2 outline-orange-500 outline-dashed outline-offset-4 z-20' : ''} transition-colors`}
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
      const phone = (a.phone || a.phone_primary || '').toLowerCase();
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
                               <span className="text-xs text-slate-400 mt-1">{a.phone || a.phone_primary || '-'}</span>
                               {!!a.preferred_neighbor_name && (
                                 <span className="text-[10px] text-indigo-300 mt-1">
                                   يرغب الجلوس بجوار: {a.preferred_neighbor_name}
                                 </span>
                               )}
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
       const phone = (a.phone || a.phone_primary || '').toLowerCase();
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
                        <span className="text-xs text-slate-400">{a.phone || a.phone_primary || '-'}</span>
                        {!!a.preferred_neighbor_name && (
                          <span className="text-[10px] text-indigo-300 mt-1">
                            يرغب الجلوس بجوار: {a.preferred_neighbor_name}
                          </span>
                        )}
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
  const [waitingPaymentFilter, setWaitingPaymentFilter] = useState<'all' | 'paid' | 'unpaid_or_zero'>('all');
  const [photoStatusFilter, setPhotoStatusFilter] = useState<'all' | 'ready' | 'not_ready'>('all');
  const [autoSeatPaidMode, setAutoSeatPaidMode] = useState<'any_paid' | 'fully_paid'>('any_paid');
  const [autoSeatClassFilter, setAutoSeatClassFilter] = useState<'all' | 'A' | 'B' | 'C'>('all');
  const [seatSearchQuery, setSeatSearchQuery] = useState('');
  const [focusAttendeeId, setFocusAttendeeId] = useState('');
  const [targetNeighborId, setTargetNeighborId] = useState('');
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
  const [localDraftExists, setLocalDraftExists] = useState(false);
  const [assignmentModal, setAssignmentModal] = useState<{isOpen: boolean, seat: Seat | null, isTableModal: boolean, tableId: string | null}>({isOpen: false, seat: null, isTableModal: false, tableId: null});
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const [editTableModal, setEditTableModal] = useState<{isOpen: boolean, tableId: string, currentName: string, currentClass: string, currentCount: number, currentOrientation: 'horizontal' | 'vertical'}>({isOpen: false, tableId: '', currentName: '', currentClass: 'A', currentCount: 12, currentOrientation: 'horizontal'});

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
    aisleWidth: number;
  }>({ isOpen: false, type: '', startX: 0, startY: 0, endX: 0, endY: 0, name: '', shape: 'rect', count: 10, seatClass: 'C', aisleWidth: 18 });
  const [elementControls, setElementControls] = useState<{
    id: string;
    elementType: string;
    label: string;
    shape: string;
    width: number;
    height: number;
    lineWidth: number;
  } | null>(null);

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
  const liveSyncInFlightRef = useRef(false);
  const marqueeBaseSelectionRef = useRef<string[]>([]);
  const dragFrameRef = useRef<number | null>(null);
  const pendingDragPointRef = useRef<{ x: number; y: number } | null>(null);
  const dragStateRef = useRef<any>(null);
  const layoutDraftRef = useRef<Record<string, any>>({});
  const lastAppliedDragKeyRef = useRef<string>('');
  const lastMouseCanvasRef = useRef<{ x: number; y: number } | null>(null);
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef(1);
  const localDraftCheckedEventRef = useRef<string>('');

  useEffect(() => { dragStateRef.current = dragState; }, [dragState]);
  useEffect(() => { layoutDraftRef.current = layoutDraft; }, [layoutDraft]);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMapFullscreen) setIsMapFullscreen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMapFullscreen]);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    if (isMapFullscreen) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = originalOverflow; };
  }, [isMapFullscreen]);

  const restoreLocalDraft = useCallback((silent = false) => {
    try {
      const raw = localStorage.getItem(getLocalDraftKey(eventId));
      if (!raw) {
        setLocalDraftExists(false);
        return false;
      }
      const parsed = JSON.parse(raw);
      const draft = parsed?.draft || {};
      const hasAny = Object.keys(draft).length > 0;
      setLocalDraftExists(hasAny);
      if (!hasAny) return false;
      if (!silent) {
        const ok = window.confirm('تم العثور على مسودة محلية غير منشورة لهذه القاعة. هل تريد استرجاعها الآن؟');
        if (!ok) return false;
      }
      setLayoutDraft(draft);
      commitDraftHistory(draft);
      return true;
    } catch {
      return false;
    }
  }, [eventId, commitDraftHistory]);

  useEffect(() => {
    const key = getLocalDraftKey(eventId);
    if (Object.keys(layoutDraft).length === 0) {
      setLocalDraftExists(Boolean(localStorage.getItem(key)));
      return;
    }
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify({ draft: layoutDraft, eventId, savedAt: new Date().toISOString() }));
        setLocalDraftExists(true);
      } catch {
        // Ignore localStorage quota/availability issues.
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [layoutDraft, eventId]);

  useEffect(() => {
    if (localDraftCheckedEventRef.current === eventId) return;
    localDraftCheckedEventRef.current = eventId;
    if (Object.keys(layoutDraft).length > 0) return;
    // Try silent load once after event switch to avoid accidental loss after refresh.
    restoreLocalDraft(true);
  }, [eventId, layoutDraft, restoreLocalDraft]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (Object.keys(layoutDraftRef.current || {}).length === 0) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

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
      const baseEls = (payload.layout_elements || [])
        .filter((el) => {
          const draft = layoutDraft[el.id] as any;
          return !draft?.is_deleted;
        })
        .map((el) => {
          const patch = layoutDraft[el.id] as any;
          if (!patch || patch.is_new) return el;
          return {
            ...el,
            position_x: patch.position_x !== undefined ? Number(patch.position_x) : Number(el.position_x || 0),
            position_y: patch.position_y !== undefined ? Number(patch.position_y) : Number(el.position_y || 0),
            width: patch.width !== undefined ? Number(patch.width) : Number(el.width || 8),
            height: patch.height !== undefined ? Number(patch.height) : Number(el.height || 4),
            name: patch.name !== undefined ? patch.name : el.name
          };
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

  const mergeElementsFromDraft = useCallback((draft: Record<string, any>) => {
    const baseEls = (payload.layout_elements || []).filter((el) => !(draft?.[el.id] as any)?.is_deleted);
    const mergedBase = baseEls.map((el) => {
      const patch = draft?.[el.id] as any;
      if (!patch || patch.is_new) return el;
      return {
        ...el,
        position_x: patch.position_x !== undefined ? Number(patch.position_x) : Number(el.position_x || 0),
        position_y: patch.position_y !== undefined ? Number(patch.position_y) : Number(el.position_y || 0),
        width: patch.width !== undefined ? Number(patch.width) : Number(el.width || 8),
        height: patch.height !== undefined ? Number(patch.height) : Number(el.height || 4),
        name: patch.name !== undefined ? patch.name : el.name
      } as any;
    });
    const newEls = Object.entries(draft || {})
      .filter(([_, v]) => (v as any)?.is_new && ['element', 'stage', 'aisle', 'blocked'].includes((v as any)?.type))
      .map(([id, v]: any) => ({ id, ...v }));
    return [...mergedBase, ...newEls];
  }, [payload.layout_elements]);

  const validateLayoutElements = useCallback((elements: any[]) => {
    const active = (elements || []).filter((e) => !((e as any)?.is_deleted));
    const stageCount = active.filter((e) => String(e?.type) === 'stage').length;
    const baseStageCount = (payload.layout_elements || []).filter((e) => String((e as any)?.type) === 'stage').length;
    if (stageCount > 1 && stageCount > baseStageCount) return 'مسموح بمسرح واحد فقط داخل القاعة.';

    for (const el of active) {
      const meta = parseElementMeta(el);
      if ((el.type === 'aisle' || meta.shape === 'line') && (meta.lineWidth < 6 || meta.lineWidth > 120)) {
        return 'عرض الممر يجب أن يكون بين 6 و 120.';
      }
    }

    const boxes = active.map((el) => ({ id: String(el.id), type: String(el.type), box: getElementBoundsPx(el) }));
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        const overlap = !(a.box.right <= b.box.left || b.box.right <= a.box.left || a.box.bottom <= b.box.top || b.box.bottom <= a.box.top);
        if (!overlap) continue;
        return `يوجد تداخل بين العناصر (${a.type}) و(${b.type}). حرّك أحدهما أو عدل الأبعاد.`;
      }
    }
    return null;
  }, [payload.layout_elements]);

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

  const getTableOrientation = useCallback((tableId: string): 'horizontal' | 'vertical' => {
    const seats = mapSeats.filter((s) => s.table_id === tableId);
    if (!seats.length) return 'horizontal';
    const xs = seats.map((s) => Number((layoutDraft[s.id] as any)?.position_x ?? s.position_x ?? 0) * 8);
    const ys = seats.map((s) => Number((layoutDraft[s.id] as any)?.position_y ?? s.position_y ?? 0) * 4);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    return height > width ? 'vertical' : 'horizontal';
  }, [mapSeats, layoutDraft]);

  const getItemType = useCallback((id: string): 'table' | 'element' | 'seat' => {
    if (tableBoxes.some(t => t.id === id) || payload.tables.some(t => t.id === id)) return 'table';
    if ((mapElements || []).some(e => e.id === id) || (payload.layout_elements || []).some(e => e.id === id)) return 'element';
    return 'seat';
  }, [tableBoxes, payload.tables, mapElements, payload.layout_elements]);

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
    const persistedTargets: Array<{ id: string; type: 'table' | 'element' | 'seat' }> = [];
    targets.forEach(tId => {
       const isTable = tableBoxes.some(t => t.id === tId);
       const isElement = mapElements?.some(e => e.id === tId);
       let tType = isTable ? 'table' : isElement ? 'element' : 'seat';
       const patch = layoutDraft[tId] as any;
       if (patch?.is_new) {
         delete nextDraft[tId];
       } else {
         nextDraft[tId] = { ...(patch || {}), type: tType as any, position_x: 0, position_y: 0, is_deleted: true };
         persistedTargets.push({ id: tId, type: tType as any });
       }
    });
    
    setLayoutDraft(nextDraft as any);
    commitDraftHistory(nextDraft as any);
    setSelectedGroup([]);
    setSelectedElement(null);
    setSelectedSeatId('');

    // Persist delete immediately so item does not come back after refresh/navigation.
    if (persistedTargets.length > 0) {
      try {
        setLoading(true);
        const selectedTableIds = new Set(persistedTargets.filter(t => t.type === 'table').map(t => t.id));
        const deduped = persistedTargets.filter((t, idx, arr) => {
          if (t.type === 'seat') {
            const seat = payload.seats.find(s => s.id === t.id);
            if (seat?.table_id && selectedTableIds.has(seat.table_id)) return false;
          }
          return arr.findIndex(a => a.id === t.id && a.type === t.type) === idx;
        });
        await Promise.all(deduped.map(t => api.post('/seating/delete-element', { event_id: eventId, id: t.id, type: t.type })));
        await loadMap();
      } catch (e: any) {
        setError(e.message || 'فشل الحذف النهائي على السيرفر');
      } finally {
        setLoading(false);
      }
    }
  }, [selectedGroup, payload.seats, tableBoxes, mapElements, layoutDraft, commitDraftHistory, eventId]);

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
                  if (isSeat) return { id, type: 'seat', x: patch && !patch.is_new ? patch.position_x : Number(isSeat.position_x || 0), y: patch && !patch.is_new ? patch.position_y : Number(isSeat.position_y || 0), seat_class: isSeat.seat_class, table_id: isSeat.table_id, wave_number: isSeat.wave_number };
                   
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
           
           // Paste exactly near current mouse position on canvas (fallback: visible center).
           const container = document.getElementById('seating-canvas-container');
           let pasteCx = lastMouseCanvasRef.current?.x;
           let pasteCy = lastMouseCanvasRef.current?.y;
           if (pasteCx === undefined || pasteCy === undefined) {
             if (container) {
               const centerPxX = container.scrollLeft + container.clientWidth / 2;
               const centerPxY = container.scrollTop + container.clientHeight / 2;
               pasteCx = centerPxX / zoomLevel / 8;
               pasteCy = centerPxY / zoomLevel / 4;
             } else {
               pasteCx = 50;
               pasteCy = 50;
             }
           }
           const govPrefix = eventId.split('-')[0] || 'MINYA';
           const allTableOrders = new Set<number>();
           [...payload.tables, ...tableBoxes.map((b) => ({ id: b.id }))].forEach((t: any) => {
             const part = String(t?.id || '').split('-T')[1];
             const n = Number(String(part).split('-')[0]);
             if (Number.isFinite(n) && n > 0) allTableOrders.add(n);
           });
           Object.entries(layoutDraft).forEach(([id, patch]) => {
             const p: any = patch;
             if (p?.type !== 'table' || p?.is_deleted) return;
             const part = String(id || '').split('-T')[1];
             const n = Number(String(part).split('-')[0]);
             if (Number.isFinite(n) && n > 0) allTableOrders.add(n);
           });
           let nextTableOrder = allTableOrders.size ? Math.max(...Array.from(allTableOrders)) + 1 : 1;

           const extractWaveNo = (val: any) => {
             const m = String(val || '').match(/(\d+)/);
             return m ? Number(m[1]) : null;
           };
           const allWaveNos = new Set<number>();
           mapSeats.forEach((s) => {
             const n = extractWaveNo((s as any).wave_number);
             if (n && Number.isFinite(n)) allWaveNos.add(n);
           });
           Object.values(layoutDraft).forEach((patch: any) => {
             const n = extractWaveNo(patch?.wave_number);
             if (n && Number.isFinite(n)) allWaveNos.add(n);
           });
           let nextWaveNo = allWaveNos.size ? Math.max(...Array.from(allWaveNos)) + 1 : 1;
           const waveLabelMap = new Map<string, string>();
           
           copiedGroup.forEach((item, index) => {
               let newId = `local-${item.type}-${timestamp}-${index}`;
               const px = (pasteCx as number) + item.dx;
               const py = (pasteCy as number) + item.dy;
               
               if (item.type === 'element') {
                   nextDraft[newId] = { is_new: true, type: item.elType, position_x: px, position_y: py, width: item.width, height: item.height, name: item.name } as any;
                   newSelection.push(newId);
               } else if (item.type === 'seat' && !item.table_id) { // Only paste free seats, table seats are pasted via table
                   let nextWaveLabel: string | null = null;
                   if (item.wave_number) {
                     const key = String(item.wave_number);
                     if (!waveLabelMap.has(key)) {
                       waveLabelMap.set(key, `W${nextWaveNo}`);
                       nextWaveNo += 1;
                     }
                     nextWaveLabel = waveLabelMap.get(key) || null;
                   }
                   const seatNo = Number(item.seat_number || index + 1);
                   nextDraft[newId] = {
                     is_new: true,
                     type: 'seat',
                     position_x: px,
                     position_y: py,
                     seat_class: item.seat_class,
                     wave_number: nextWaveLabel,
                     seat_number: seatNo,
                     seat_code: `${item.seat_class || 'C'}-${nextWaveLabel || 'COPY'}-S${seatNo}`
                   } as any;
                   newSelection.push(newId);
               } else if (item.type === 'table') {
                   // To paste a table, we need to recreate its seats
                   const originalSeats = mapSeats.filter(s => s.table_id === item.id);
                   const tableClass = originalSeats[0]?.seat_class || 'A';
                   newId = `${govPrefix}-${tableClass}-T${nextTableOrder}`;
                   nextTableOrder += 1;
                   originalSeats.forEach((s, sIdx) => {
                       const seatNo = Number(s.seat_number || (sIdx + 1));
                       const sId = `${newId}-S${seatNo}`;
                       const sPatch = layoutDraft[s.id] as any;
                       const sx = sPatch && !sPatch.is_new ? sPatch.position_x : Number(s.position_x || 0);
                       const sy = sPatch && !sPatch.is_new ? sPatch.position_y : Number(s.position_y || 0);
                       const sDx = sx - item.x;
                       const sDy = sy - item.y;
                       nextDraft[sId] = {
                         is_new: true,
                         type: 'seat',
                         position_x: px + sDx,
                         position_y: py + sDy,
                         seat_class: s.seat_class,
                         seat_number: seatNo,
                         seat_code: `${tableClass}-T${nextTableOrder - 1}-S${seatNo}`,
                         table_id: newId
                       } as any;
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
  }, [mainMode, selectedGroup, selectedElement, layoutDraft, copiedGroup, payload, tableBoxes, history, historyIndex, mapSeats, mapElements, zoomLevel]);


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

  const refreshLiveData = useCallback(async () => {
    if (liveSyncInFlightRef.current) return;
    liveSyncInFlightRef.current = true;
    try {
      const [mapData, attendeesData] = await Promise.all([
        api.get(`/seating/map?eventId=${eventId}`),
        api.get(`/seating/attendees?eventId=${eventId}`)
      ]);
      const incoming = (mapData || { event_id: eventId, tables: [], seats: [] }) as SeatingMapPayload;
      setPayload((prev) => {
        const prevSeats = prev.seats || [];
        const nextSeats = Array.isArray(incoming.seats) ? incoming.seats : [];
        let changed = prevSeats.length !== nextSeats.length;
        if (!changed) {
          for (let i = 0; i < prevSeats.length; i += 1) {
            const a = prevSeats[i];
            const b = nextSeats[i];
            if (!b || a.id !== b.id || a.attendee_id !== b.attendee_id || a.status !== b.status || a.reserved_until !== b.reserved_until || a.reserved_by !== b.reserved_by) {
              changed = true;
              break;
            }
          }
        }
        if (!changed) return prev;
        return {
          ...prev,
          event_id: incoming.event_id || prev.event_id,
          seats: nextSeats,
          tables: Array.isArray(incoming.tables) && incoming.tables.length ? incoming.tables : prev.tables,
          layout_elements: Array.isArray(incoming.layout_elements) ? incoming.layout_elements : prev.layout_elements
        };
      });
      setAttendees((Array.isArray(attendeesData) ? attendeesData : []) as AttendeeLite[]);
    } catch {
      // Keep UI stable during background live refresh.
    } finally {
      liveSyncInFlightRef.current = false;
    }
  }, [eventId]);

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

  useEffect(() => {
    if (mainMode !== 'assign') return;
    const intervalId = window.setInterval(() => {
      if (document.hidden) return;
      if (assignmentModal.isOpen || !!dragState || !!selectionBox || !!drawState) return;
      if (loading) return;
      refreshLiveData();
    }, 3000);
    return () => window.clearInterval(intervalId);
  }, [mainMode, refreshLiveData, assignmentModal.isOpen, dragState, selectionBox, drawState, loading]);

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
  const isAttendeeSeated = useCallback((attendeeId: string) => payload.seats.some((s) => s.attendee_id === attendeeId), [payload.seats]);
  const filteredByPhotoStatus = useCallback((attendee: AttendeeLite) => {
    if (photoStatusFilter === 'all') return true;
    const hasPhoto = Boolean(String(attendee.profile_photo_url || '').trim());
    return photoStatusFilter === 'ready' ? hasPhoto : !hasPhoto;
  }, [photoStatusFilter]);
  const seatedByAttendeeId = useMemo(() => {
    const m = new Map<string, Seat>();
    for (const s of mapSeats) {
      if (s.attendee_id) m.set(String(s.attendee_id), s);
    }
    return m;
  }, [mapSeats]);
  const searchableAttendees = useMemo(() => {
    const q = seatSearchQuery.trim().toLowerCase();
    if (!q) return [];
    return attendees
      .filter((a) =>
        String(a.full_name || '').toLowerCase().includes(q)
        || String(a.id || '').toLowerCase().includes(q)
        || String(a.phone || a.phone_primary || '').toLowerCase().includes(q))
      .slice(0, 12);
  }, [attendees, seatSearchQuery]);
  const focusAttendee = useMemo(() => attendees.find((a) => a.id === focusAttendeeId) || null, [attendees, focusAttendeeId]);
  const focusSeat = useMemo(() => (focusAttendeeId ? seatedByAttendeeId.get(focusAttendeeId) || null : null), [focusAttendeeId, seatedByAttendeeId]);
  const focusNeighbors = useMemo(() => {
    if (!focusSeat) return [] as Array<{ id: string; full_name: string; seat_code: string }>;
    const seatClass = focusSeat.seat_class;
    const row = Number(focusSeat.row_number || 0);
    const num = Number(focusSeat.seat_number || 0);
    return mapSeats
      .filter((s) =>
        s.id !== focusSeat.id
        && s.attendee_id
        && s.seat_class === seatClass
        && Number(s.row_number || 0) === row
        && Math.abs(Number(s.seat_number || 0) - num) === 1)
      .map((s) => {
        const person = attendees.find((a) => a.id === s.attendee_id);
        return { id: String(s.attendee_id), full_name: String(person?.full_name || s.attendee_id), seat_code: String(s.seat_code || '-') };
      });
  }, [attendees, focusSeat, mapSeats]);

  useEffect(() => {
    if (!selectedElement || selectedElement.type !== 'element') {
      setElementControls(null);
      return;
    }
    const el = mapElements?.find((x) => x.id === selectedElement.id);
    if (!el) {
      setElementControls(null);
      return;
    }
    const meta = parseElementMeta(el);
    setElementControls({
      id: String(el.id),
      elementType: String(el.type || 'element'),
      label: String(meta.label || ''),
      shape: String(meta.shape || 'rect'),
      width: Number(el.width || 8),
      height: Number(el.height || 4),
      lineWidth: clamp(Number(meta.lineWidth || 14), 6, 120)
    });
  }, [selectedElement, mapElements]);

  const applyElementControls = useCallback(() => {
    if (!elementControls) return;
    const target = mapElements?.find((x) => x.id === elementControls.id);
    if (!target) return;
    const nextDraft = { ...layoutDraft };
    const meta = parseElementMeta(target);
    const nextMeta = {
      ...meta,
      label: elementControls.label,
      shape: elementControls.elementType === 'aisle' ? 'line' : elementControls.shape,
      lineWidth: clamp(Number(elementControls.lineWidth || 14), 6, 120)
    };
    nextDraft[elementControls.id] = {
      ...(nextDraft[elementControls.id] || {}),
      type: target.type,
      position_x: Number(nextDraft[elementControls.id]?.position_x ?? target.position_x ?? 0),
      position_y: Number(nextDraft[elementControls.id]?.position_y ?? target.position_y ?? 0),
      width: clamp(Number(elementControls.width || target.width || 8), 1, 400),
      height: clamp(Number(elementControls.height || target.height || 4), 1, 400),
      name: JSON.stringify(nextMeta)
    };
    const candidateElements = mergeElementsFromDraft(nextDraft);
    const validationError = validateLayoutElements(candidateElements);
    if (validationError) {
      setError(validationError);
      return;
    }
    setLayoutDraft(nextDraft);
    commitDraftHistory(nextDraft);
  }, [elementControls, mapElements, layoutDraft, mergeElementsFromDraft, validateLayoutElements, commitDraftHistory]);

  const findLinkedNeighbor = useCallback((attendeeId: string) => {
    const current = attendees.find((a) => a.id === attendeeId);
    if (!current) return null;
    const directIds = Array.isArray(current.preferred_neighbor_ids) ? current.preferred_neighbor_ids : [];
    const candidates = attendees.filter((a) => {
      if (a.id === attendeeId) return false;
      if (a.seat_class !== current.seat_class) return false;
      const reverseIds = Array.isArray(a.preferred_neighbor_ids) ? a.preferred_neighbor_ids : [];
      return directIds.includes(a.id) || reverseIds.includes(attendeeId);
    });
    if (!candidates.length) return null;
    // Prefer direct explicit request first.
    const directFirst = candidates.sort((a, b) => {
      const ad = directIds.includes(a.id) ? 0 : 1;
      const bd = directIds.includes(b.id) ? 0 : 1;
      return ad - bd;
    });
    return directFirst[0];
  }, [attendees]);

  const findAdjacentAvailableSeat = useCallback((baseSeatId: string) => {
    const baseSeat = payload.seats.find((s) => s.id === baseSeatId);
    if (!baseSeat) return null;
    const isFree = (s: Seat) => !s.attendee_id && (s.status === 'available' || s.status === 'vip');

    if (baseSeat.table_id) {
      const sameTable = payload.seats
        .filter((s) => s.table_id === baseSeat.table_id)
        .sort((a, b) => Number(a.seat_number || 0) - Number(b.seat_number || 0));
      const idx = sameTable.findIndex((s) => s.id === baseSeat.id);
      for (let distance = 1; distance < sameTable.length; distance += 1) {
        const left = idx - distance;
        const right = idx + distance;
        if (left >= 0 && isFree(sameTable[left])) return sameTable[left];
        if (right < sameTable.length && isFree(sameTable[right])) return sameTable[right];
      }
    }

    const px = Number(baseSeat.position_x || 0);
    const py = Number(baseSeat.position_y || 0);
    const sameClassFree = payload.seats
      .filter((s) => s.seat_class === baseSeat.seat_class && s.id !== baseSeat.id && isFree(s))
      .sort((a, b) => {
        const ad = Math.hypot(Number(a.position_x || 0) - px, Number(a.position_y || 0) - py);
        const bd = Math.hypot(Number(b.position_x || 0) - px, Number(b.position_y || 0) - py);
        return ad - bd;
      });
    return sameClassFree[0] || null;
  }, [payload.seats]);

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

  const isUnpaidOrZeroDeposit = useCallback((attendee: AttendeeLite) => {
    const amount = Number(attendee.payment_amount || 0);
    return amount <= 0 || (attendee.payment_type === 'deposit' && amount === 0);
  }, []);

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

  const recoverHallFromBarcodes = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.post('/seating/recover-from-barcodes', { event_id: eventId });
      await Promise.all([loadMap(), loadAttendees()]);
      alert(`تمت محاولة الاسترجاع بنجاح.\nتم استرجاع: ${result?.restored ?? 0}\nمن خلال seat_number: ${result?.restored_from_seat_number ?? 0}\nلم يتم العثور على مقعد مطابق: ${result?.skipped_no_seat ?? 0}\nتعارضات: ${result?.skipped_conflict ?? 0}`);
    } catch (e: any) {
      setError(e.message || 'فشل استرجاع التسكين من الباركود');
    } finally {
      setLoading(false);
    }
  };

  const autoSeatFromSeatingManagement = async () => {
    if (!window.confirm('سيتم تشغيل التسكين التلقائي لكل المشتركين غير المسكنين داخل هذه القاعة. هل تريد المتابعة؟')) return;
    try {
      setLoading(true);
      setError(null);
      const payload: any = { event_id: eventId, paid_mode: autoSeatPaidMode };
      if (autoSeatClassFilter !== 'all') payload.seat_class = autoSeatClassFilter;
      const result = await api.post('/seating/auto-seat', payload);
      await Promise.all([loadMap(), loadAttendees()]);

      const summaryByClass = result?.by_class || {};
      const lines = [
        'تم تنفيذ التسكين التلقائي بنجاح.',
        `نمط الدفع: ${autoSeatPaidMode === 'fully_paid' ? 'مدفوع بالكامل فقط' : 'أي دافع (أكثر من صفر)'}`,
        `الفئة المستهدفة: ${autoSeatClassFilter === 'all' ? 'كل الفئات' : `Class ${autoSeatClassFilter}`}`,
        `إجمالي المرشحين: ${result?.total_candidates ?? 0}`,
        `المقاعد المتاحة وقت التنفيذ: ${result?.total_available_seats ?? 0}`,
        `تم تسكينهم: ${result?.total_assigned ?? 0}`,
        `لم يتم تسكينهم: ${result?.total_unassigned ?? 0}`,
        '',
        `الفئة A: تسكين ${summaryByClass?.A?.assigned ?? 0} من ${summaryByClass?.A?.candidates ?? 0}`,
        `الفئة B: تسكين ${summaryByClass?.B?.assigned ?? 0} من ${summaryByClass?.B?.candidates ?? 0}`,
        `الفئة C: تسكين ${summaryByClass?.C?.assigned ?? 0} من ${summaryByClass?.C?.candidates ?? 0}`
      ];
      alert(lines.join('\n'));
    } catch (e: any) {
      setError(e.message || 'فشل التسكين التلقائي');
    } finally {
      setLoading(false);
    }
  };

  const solveFocusedPair = async () => {
    if (!focusAttendeeId || !targetNeighborId) return;
    try {
      setLoading(true);
      setError(null);
      await api.post('/seating/logic/solve', {
        event_id: eventId,
        attendee_ids: [focusAttendeeId, targetNeighborId]
      });
      await Promise.all([loadMap(), loadAttendees()]);
      alert('تم تنفيذ الحل المنطقي بنجاح');
    } catch (e: any) {
      setError(e.message || 'تعذر تنفيذ الحل المنطقي');
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

      // Optional auto-seat linked preferred neighbor.
      if (targetSeat) {
        const linkedNeighbor = findLinkedNeighbor(aid);
        if (linkedNeighbor && !isAttendeeSeated(linkedNeighbor.id)) {
          const adjacentSeat = findAdjacentAvailableSeat(sId);
          if (adjacentSeat) {
            const currentName = attendees.find((a) => a.id === aid)?.full_name || 'هذا المشترك';
            const ok = window.confirm(
              `${currentName} لديه طلب جلوس بجوار ${linkedNeighbor.full_name}. هل تريد تسكينه تلقائياً في المقعد المجاور (${adjacentSeat.seat_code})؟`
            );
            if (ok) {
              await api.post('/seating/assign-attendee', { event_id: eventId, seat_id: adjacentSeat.id, attendee_id: linkedNeighbor.id });
              setPayload(prev => ({
                ...prev,
                seats: prev.seats.map(s => {
                  if (s.id === adjacentSeat.id) return { ...s, status: 'booked', attendee_id: linkedNeighbor.id };
                  if (s.attendee_id === linkedNeighbor.id) return { ...s, status: 'available', attendee_id: null };
                  return s;
                })
              }));
              setAttendees(prev => prev.map(a => {
                if (a.id === linkedNeighbor.id) return { ...a, seat_number: adjacentSeat.seat_number, barcode: adjacentSeat.seat_code };
                return a;
              }));
            }
          } else {
            const currentName = attendees.find((a) => a.id === aid)?.full_name || 'هذا المشترك';
            alert(`تنبيه: ${currentName} لديه طلب جلوس بجوار ${linkedNeighbor.full_name} ولكن لا يوجد مقعد مجاور متاح الآن.`);
          }
        }
      }
      
      // Background reload (deferred) to avoid UI stutter on every click.
      window.setTimeout(() => {
        refreshLiveData();
      }, 250);
    } catch (e: any) {
      setError(e.message || 'فشل تسكين المشارك');
    }
  };

  const unassignSelected = async (passedSeatId?: string) => {
    const sId = typeof passedSeatId === 'string' ? passedSeatId : selectedSeatId;
    if (!sId) return;
    try {
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
      
      window.setTimeout(() => {
        refreshLiveData();
      }, 250);
    } catch (e: any) {
      setError(e.message || 'فشل إلغاء التسكين');
    } finally {
      setAssignmentModal({isOpen: false, seat: null, isTableModal: false, tableId: null});
    }
  };

  const autoAssign = async (cls?: 'A' | 'B' | 'C') => {
    try {
      setLoading(true);
      setError(null);
      await api.post('/seating/auto-seat', { event_id: eventId, seat_class: cls, paid_mode: 'any_paid' });
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
      const candidateElements = mergeElementsFromDraft(layoutDraft);
      const validationError = validateLayoutElements(candidateElements);
      if (validationError) {
        throw new Error(validationError);
      }
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
            position_y: anyVal.position_y,
            width: anyVal.width,
            height: anyVal.height,
            name: anyVal.name
          });
        }
      }
      
      await api.post('/seating/bulk-save', { event_id: eventId, updates, deletions, inserts });
      
      setLayoutDraft({});
      try {
        localStorage.removeItem(getLocalDraftKey(eventId));
      } catch {}
      setLocalDraftExists(false);
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

  const startDrag = useCallback((element: any, type: 'table' | 'element' | 'wave' | 'seat', clientX: number, clientY: number, currentTarget: any, sourceEvent?: MouseEvent | React.MouseEvent) => {
    if (mainMode !== 'edit') return;
    if (editModeState.action !== 'move') return;
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
    
    lastAppliedDragKeyRef.current = '';
    pendingDragPointRef.current = null;
    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    const nextDragState = {
      id: element.id,
      type,
      startX: scaledX,
      startY: scaledY,
      originX: groupOrigins[element.id]?.x || 0,
      originY: groupOrigins[element.id]?.y || 0,
      groupOrigins
    };
    dragStateRef.current = nextDragState;
    setDragState(nextDragState);
    setSelectedElement({ id: element.id, type });
  }, [mainMode, editModeState.action, layoutDraft, mapSeats, tableBoxes, mapElements, zoomLevel, selectedGroup]);


  const handleCanvasMouseDown = (e: React.MouseEvent) => {
     if (mainMode !== 'edit') return;
     e.preventDefault();
     const isBgClick = e.target === e.currentTarget || (e.target as HTMLElement).id === 'seating-canvas-inner' || (e.target as HTMLElement).classList.contains('bg-grid');
     
     if (isBgClick) {
        const rect = e.currentTarget.getBoundingClientRect();
        const startX = e.clientX - rect.left;
        const startY = e.clientY - rect.top;
        const additive = e.ctrlKey || e.metaKey || e.shiftKey;
        
        if (editModeState.action === 'add' && ['wave', 'stage', 'blocked', 'aisle'].includes(editModeState.addType || '')) {
            setDrawState({ active: true, startX, startY, endX: startX, endY: startY });
        } else {
            marqueeBaseSelectionRef.current = additive ? [...selectedGroup] : [];
            setSelectionBox({ startX, startY, endX: startX, endY: startY });
            if (!additive) setSelectedGroup([]);
        }
     }
  };

  const touchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const t1 = touches[0];
    const t2 = touches[1];
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.hypot(dx, dy);
  };

  const zoomAtClientPoint = useCallback((targetZoomRaw: number, clientX?: number, clientY?: number) => {
    const container = document.getElementById('seating-canvas-container');
    if (!container) {
      setZoomLevel(Math.max(0.2, Math.min(3, targetZoomRaw)));
      return;
    }
    const nextZoom = Math.max(0.2, Math.min(3, targetZoomRaw));
    const rect = container.getBoundingClientRect();
    const localX = clientX !== undefined ? (clientX - rect.left) : (container.clientWidth / 2);
    const localY = clientY !== undefined ? (clientY - rect.top) : (container.clientHeight / 2);
    const worldX = (container.scrollLeft + localX) / zoomLevel;
    const worldY = (container.scrollTop + localY) / zoomLevel;

    setZoomLevel(nextZoom);
    requestAnimationFrame(() => {
      container.scrollLeft = Math.max(0, worldX * nextZoom - localX);
      container.scrollTop = Math.max(0, worldY * nextZoom - localY);
    });
  }, [zoomLevel]);

  const handleCanvasTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length >= 2) {
      pinchStartDistanceRef.current = touchDistance(e.touches);
      pinchStartZoomRef.current = zoomLevel;
      return;
    }
    if (e.touches.length === 1) {
      const t = e.touches[0];
      const target = e.target as HTMLElement;
      const isBgClick = target === e.currentTarget || target.id === 'seating-canvas-inner' || target.classList.contains('bg-grid');
      if (mainMode === 'edit' && isBgClick) {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const startX = t.clientX - rect.left;
        const startY = t.clientY - rect.top;
        if (editModeState.action === 'add' && ['wave', 'stage', 'blocked', 'aisle'].includes(editModeState.addType || '')) {
          setDrawState({ active: true, startX, startY, endX: startX, endY: startY });
        } else {
          marqueeBaseSelectionRef.current = [];
          setSelectionBox({ startX, startY, endX: startX, endY: startY });
          setSelectedGroup([]);
        }
      } else {
        onCanvasMove(t.clientX, t.clientY);
      }
    }
  };

  const handleCanvasTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length >= 2 && pinchStartDistanceRef.current) {
      e.preventDefault();
      const nextDist = touchDistance(e.touches);
      const ratio = nextDist / pinchStartDistanceRef.current;
      const targetZoom = Number((pinchStartZoomRef.current * ratio).toFixed(2));
      const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      zoomAtClientPoint(targetZoom, centerX, centerY);
      return;
    }
    if (e.touches.length === 1) {
      const t = e.touches[0];
      onCanvasMove(t.clientX, t.clientY);
    }
  };

  const handleCanvasTouchEnd = () => {
    pinchStartDistanceRef.current = null;
    endDrag();
  };

  const buildDraftFromDrag = useCallback((baseDraft: Record<string, any>, ds: any, clientX: number, clientY: number) => {
    const container = document.getElementById('seating-canvas-inner');
    const rect = container?.getBoundingClientRect();
    const currentScaledX = rect ? (clientX - rect.left) / zoomLevel : clientX;
    const currentScaledY = rect ? (clientY - rect.top) / zoomLevel : clientY;
    const dx = (currentScaledX - ds.startX) / 8;
    const dy = (currentScaledY - ds.startY) / 4;
    const roundedDx = Math.round(dx * 10) / 10;
    const roundedDy = Math.round(dy * 10) / 10;
    const dragKey = `${roundedDx}|${roundedDy}`;

    const nextDraft = { ...baseDraft };
    if (ds.groupOrigins) {
      Object.keys(ds.groupOrigins).forEach(id => {
        const startPos = ds.groupOrigins[id];
        nextDraft[id] = {
          ...nextDraft[id],
          type: startPos.type as any,
          position_x: Math.max(0, Math.round((startPos.x + roundedDx) * 10) / 10),
          position_y: Math.max(0, Math.round((startPos.y + roundedDy) * 10) / 10)
        };
      });
    } else {
      const nextX = Math.max(0, Math.round((ds.originX + roundedDx) * 10) / 10);
      const nextY = Math.max(0, Math.round((ds.originY + roundedDy) * 10) / 10);
      nextDraft[ds.id] = { type: ds.type, position_x: nextX, position_y: nextY };
    }
    return { nextDraft, dragKey };
  }, [zoomLevel]);

  const onCanvasMove = (clientX: number, clientY: number) => {
    const trackingContainer = document.getElementById('seating-canvas-inner');
    const trackingRect = trackingContainer?.getBoundingClientRect();
    if (trackingRect) {
      const px = clientX - trackingRect.left;
      const py = clientY - trackingRect.top;
      lastMouseCanvasRef.current = { x: px / zoomLevel / 8, y: py / zoomLevel / 4 };
    }

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
          
          // Live preview of selection (pixel-accurate)
          const minX = Math.min(selectionBox.startX, endX) / zoomLevel;
          const maxX = Math.max(selectionBox.startX, endX) / zoomLevel;
          const minY = Math.min(selectionBox.startY, endY) / zoomLevel;
          const maxY = Math.max(selectionBox.startY, endY) / zoomLevel;
          
          const newSelection: string[] = [];
          
          tableBoxes.forEach(box => {
             const draft = layoutDraft[box.id] as any;
             if (draft?.is_deleted) return;
             const bx = draft && draft.position_x !== undefined ? Number(draft.position_x) * 8 : box.x;
             const by = draft && draft.position_y !== undefined ? Number(draft.position_y) * 4 : box.y;
             const bw = box.w;
             const bh = box.h;
             if (bx < maxX && bx + bw > minX && by < maxY && by + bh > minY) {
                newSelection.push(box.id);
             }
          });
          
          mapSeats.forEach(seat => {
             if (seat.table_id) return; 
             const draft = layoutDraft[seat.id] as any;
             if (draft?.is_deleted) return;
             const sx = (draft && draft.position_x !== undefined ? Number(draft.position_x) : Number(seat.position_x || 0)) * 8;
             const sy = (draft && draft.position_y !== undefined ? Number(draft.position_y) : Number(seat.position_y || 0)) * 4;
             const sw = 24;
             const sh = 24;
             if (sx < maxX && sx + sw > minX && sy < maxY && sy + sh > minY) {
                newSelection.push(seat.id);
             }
          });
          
          mapElements?.forEach(el => {
             const draft = layoutDraft[el.id] as any;
             if (draft?.is_deleted) return;
             const ex = (draft && draft.position_x !== undefined ? Number(draft.position_x) : Number(el.position_x || 0)) * 8;
             const ey = (draft && draft.position_y !== undefined ? Number(draft.position_y) : Number(el.position_y || 0)) * 4;
             const ew = Number(el.width || 8) * 8;
             const eh = Number(el.height || 4) * 4;
             if (ex < maxX && ex + ew > minX && ey < maxY && ey + eh > minY) {
                newSelection.push(el.id);
             }
          });
          
          const base = marqueeBaseSelectionRef.current || [];
          if (base.length) {
            const merged = Array.from(new Set([...base, ...newSelection]));
            setSelectedGroup(merged);
          } else {
            setSelectedGroup(newSelection);
          }
       });
       return;
    }
    
    if (!dragState || mainMode !== 'edit') return;

    pendingDragPointRef.current = { x: clientX, y: clientY };
    if (dragFrameRef.current !== null) return;

    dragFrameRef.current = window.requestAnimationFrame(() => {
      dragFrameRef.current = null;
      const ds = dragStateRef.current;
      const point = pendingDragPointRef.current;
      if (!ds || !point) return;
      const { nextDraft, dragKey } = buildDraftFromDrag(layoutDraftRef.current, ds, point.x, point.y);
      if (dragKey === lastAppliedDragKeyRef.current) return;
      lastAppliedDragKeyRef.current = dragKey;
      setLayoutDraft(nextDraft);
    });
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
       marqueeBaseSelectionRef.current = [];
       setSelectionBox(null);
       return;
    }
    
    if (!dragState) return;
    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    let finalDraft = layoutDraftRef.current;
    if (pendingDragPointRef.current) {
      const { nextDraft } = buildDraftFromDrag(layoutDraftRef.current, dragState, pendingDragPointRef.current.x, pendingDragPointRef.current.y);
      finalDraft = nextDraft;
      setLayoutDraft(nextDraft);
    }
    pendingDragPointRef.current = null;
    lastAppliedDragKeyRef.current = '';
    commitDraftHistory(finalDraft);
    if (dragState.type === 'seat') {
      const patch = finalDraft[dragState.id];
      if (patch) {
        setEditSeatState((prev) => ({
          ...prev,
          position_x: patch.position_x,
          position_y: patch.position_y
        }));
      }
    }
    setDragState(null);
    dragStateRef.current = null;
  };

  
  const handleSeatClick = useCallback((seat: Seat, event?: React.MouseEvent) => {
    if (mainMode === 'edit' && event && (event.ctrlKey || event.metaKey || event.shiftKey)) {
      setSelectedGroup(prev => prev.includes(seat.id) ? prev.filter(x => x !== seat.id) : [...prev, seat.id]);
      setSelectedElement({ id: seat.id, type: 'seat' });
      return;
    }
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

        <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2">
          <button onClick={() => setMainMode('assign')} className={`px-4 py-2 rounded-md text-sm border ${mainMode === 'assign' ? 'bg-indigo-600 border-indigo-500' : 'border-slate-700 bg-slate-800'}`}>مود التسكين</button>
          <button onClick={() => {
             setMainMode('edit');
             setEditModeState(p => ({...p, action: 'move'}));
          }} className={`px-4 py-2 rounded-md text-sm border ${mainMode === 'edit' ? 'bg-indigo-600 border-indigo-500' : 'border-slate-700 bg-slate-800'}`}>مود التعديل</button>
          <button onClick={initHall} className="px-4 py-2 rounded-md text-sm border border-slate-700 bg-slate-800 text-rose-400">تهيئة القاعة (مسح وإعادة بناء)</button>
          <button
            onClick={async () => {
              if (!window.confirm('سيتم استرجاع التسكين الحالي بالاعتماد على الباركودات المحفوظة لدى المشتركين. هل تريد المتابعة؟')) return;
              await recoverHallFromBarcodes();
            }}
            className="px-4 py-2 rounded-md text-sm border border-emerald-700 bg-emerald-900/40 text-emerald-300"
          >
            استرجاع التسكين من الباركود
          </button>
          <button
            onClick={autoSeatFromSeatingManagement}
            className="px-4 py-2 rounded-md text-sm bg-emerald-600"
          >
            تسكين تلقائي من إدارة القاعة
          </button>
        </div>
        <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
          <select
            value={autoSeatPaidMode}
            onChange={(e) => setAutoSeatPaidMode(e.target.value as 'any_paid' | 'fully_paid')}
            className="px-3 py-2 rounded-md text-sm bg-slate-800 border border-slate-700"
          >
            <option value="any_paid">أي دافع (عربون أكبر من صفر)</option>
            <option value="fully_paid">مدفوع بالكامل فقط</option>
          </select>
          <select
            value={autoSeatClassFilter}
            onChange={(e) => setAutoSeatClassFilter(e.target.value as 'all' | 'A' | 'B' | 'C')}
            className="px-3 py-2 rounded-md text-sm bg-slate-800 border border-slate-700"
          >
            <option value="all">كل الفئات</option>
            <option value="A">Class A</option>
            <option value="B">Class B</option>
            <option value="C">Class C</option>
          </select>
          <div className="px-3 py-2 rounded-md text-xs bg-slate-800 border border-slate-700 text-slate-300">
            التسكين التلقائي يراعي: الأقدم أولاً + الدفع + الجار المفضل + الشركة.
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 md:grid-cols-6 gap-2">
          <button onClick={undoLayout} disabled={historyIndex <= 0} className="px-3 py-2 rounded-md text-sm border border-slate-700 bg-slate-800 disabled:opacity-50">Undo</button>
          <button onClick={redoLayout} disabled={historyIndex >= history.length - 1} className="px-3 py-2 rounded-md text-sm border border-slate-700 bg-slate-800 disabled:opacity-50">Redo</button>
          <button onClick={publishLayoutDraft} disabled={!Object.keys(layoutDraft).length || loading} className="px-3 py-2 rounded-md text-sm bg-indigo-600 disabled:opacity-50">نشر تعديلات التخطيط</button>
          <button onClick={() => restoreLocalDraft(false)} disabled={!localDraftExists} className="px-3 py-2 rounded-md text-sm border border-amber-700 bg-amber-900/40 disabled:opacity-50">استرجاع مسودة محلية</button>
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
      {mainMode === 'edit' && (
        <div className={`rounded-md border p-2 text-xs ${Object.keys(layoutDraft).length ? 'border-amber-700 bg-amber-950/30 text-amber-200' : 'border-emerald-700 bg-emerald-950/20 text-emerald-200'}`}>
          {Object.keys(layoutDraft).length
            ? 'لديك تعديلات غير منشورة. يتم حفظها محليًا تلقائيًا، واضغط "نشر تعديلات التخطيط" للحفظ النهائي على السيرفر.'
            : (localDraftExists ? 'لا توجد تعديلات نشطة، وتوجد مسودة محلية يمكن استرجاعها.' : 'لا توجد تعديلات غير منشورة حالياً.')}
        </div>
      )}

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

      {mainMode === 'edit' && editModeState.action === 'delete' && (
        <div className="rounded-lg border border-red-800/60 bg-red-950/20 p-3 flex flex-wrap items-center gap-2">
          <button
            disabled={selectedGroup.length === 0}
            onClick={() => {
              if (selectedGroup.length === 0) return;
              const firstType = getItemType(selectedGroup[0]);
              handleDeleteElement(selectedGroup[0], firstType);
            }}
            className="px-4 py-2 rounded-md text-sm font-bold bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            حذف المحدد ({selectedGroup.length})
          </button>
          <span className="text-xs text-red-200/90">
            للتحديد المتعدد: استخدم السحب على اللوحة أو `Ctrl + Click` ثم اضغط حذف المحدد.
          </span>
        </div>
      )}
      {mainMode === 'edit' && (
        <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-2">
          <span className="text-[11px] text-slate-300">
            مربع التحديد بالماوس: اضغط واسحب على المساحة الفارغة داخل الخريطة لتحديد مجموعة عناصر دفعة واحدة.
          </span>
        </div>
      )}
      {mainMode === 'edit' && editModeState.action === 'move' && (
        <div className="rounded-lg border border-amber-800/60 bg-amber-950/20 p-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-amber-200/90">
            محدد للتحريك: {selectedGroup.length} عنصر
          </span>
          <span className="text-xs text-amber-200/80">
            اسحب أي عنصر من المحدد لتحريك المجموعة كلها. استخدم `Ctrl + Click` أو اسحب مربع التحديد، ومع `Shift/Ctrl` السحب يضيف للتحديد الحالي.
          </span>
          <button
            onClick={() => setSelectedGroup([])}
            disabled={selectedGroup.length === 0}
            className="px-3 py-1.5 rounded-md text-xs border border-amber-700 bg-amber-900/40 hover:bg-amber-800/60 disabled:opacity-50"
          >
            مسح التحديد
          </button>
        </div>
      )}

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
        <div className={`${isMapFullscreen ? 'fixed inset-2 z-[500] rounded-xl border border-slate-700 bg-slate-950 p-3 shadow-2xl' : 'xl:col-span-9 rounded-xl border border-slate-800 bg-slate-900 p-4'}`}>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm text-slate-300">لوحة القاعة التفاعلية</div>
            <div className="flex gap-2 items-center" dir="ltr">
              <button
                onClick={() => setIsMapFullscreen(prev => !prev)}
                className={`px-3 py-1 border rounded-md text-xs font-bold ${isMapFullscreen ? 'bg-amber-600 border-amber-500 text-white' : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200'}`}
                title={isMapFullscreen ? 'تصغير الخريطة' : 'تكبير الخريطة'}
              >
                {isMapFullscreen ? 'تصغير' : 'تكبير'}
              </button>
              <button onClick={() => zoomAtClientPoint(zoomLevel - 0.1)} className="px-3 py-1 bg-slate-800 border border-slate-700 hover:bg-slate-700 rounded-md text-xl leading-none">-</button>
              <span className="text-sm w-12 text-center font-bold text-indigo-300">{Math.round(zoomLevel * 100)}%</span>
              <button onClick={() => zoomAtClientPoint(zoomLevel + 0.1)} className="px-3 py-1 bg-slate-800 border border-slate-700 hover:bg-slate-700 rounded-md text-xl leading-none">+</button>
            </div>
            <div className="text-xs text-slate-400">سحب وإفلات في مود التعديل لتغيير المكان</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-2">
            <div id="seating-canvas-container" className="relative rounded-md border border-slate-800 overflow-auto" style={{ height: isMapFullscreen ? 'calc(100vh - 170px)' : 600 }}>
              <div
                id="seating-canvas-inner"
                className="relative min-w-[1600px] min-h-[1200px] select-none"
                onMouseMove={(e) => onCanvasMove(e.clientX, e.clientY)}
                onMouseDown={handleCanvasMouseDown}
                onMouseUp={endDrag}
                onMouseLeave={endDrag}
                onTouchStart={handleCanvasTouchStart}
                onTouchMove={handleCanvasTouchMove}
                onTouchEnd={handleCanvasTouchEnd}
                style={{
                  transform: `scale(${zoomLevel})`,
                  transformOrigin: 'top left',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  touchAction: 'none',
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
                           stroke="#f8fafc" strokeWidth={drawModal.aisleWidth} 
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
                         inGroup={selectedGroup.includes(box.id)}
                          mode={mainMode === 'edit' && editModeState.action === 'move' ? 'edit' : 'view'}
                         onTouchDragEnd={endDrag}
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
                                  currentCount: currentTable?.seats_count || 12,
                                  currentOrientation: getTableOrientation(id)
                                });
                             }
                          }}
                         onDragStart={(b: any, type: string, clientX: number, clientY: number, target: any, sourceEvent: any) => {
                            if (mainMode === 'edit' && (sourceEvent?.ctrlKey || sourceEvent?.metaKey || sourceEvent?.shiftKey)) {
                               setSelectedGroup(prev => prev.includes(b.id) ? prev.filter(x => x !== b.id) : [...prev, b.id]);
                               setSelectedElement({ id: b.id, type: 'table' });
                               return;
                            }
                             if (mainMode === 'edit' && editModeState.action === 'move') {
                                startDrag({ id: b.id, position_x: box.x/8, position_y: box.y/4 }, 'table', clientX, clientY, target, sourceEvent);
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
                  const meta = parseElementMeta(el);
                  
                  const isSelected = selectedGroup.includes(el.id) || selectedElement?.id === el.id;
                  const baseClasses = `absolute flex items-center justify-center transition-all ${mainMode === 'edit' ? (editModeState.action === 'move' ? 'cursor-move' : 'cursor-pointer') : ''} ${isSelected ? 'outline outline-2 outline-orange-500 outline-dashed outline-offset-2 z-[80]' : 'z-[40]'}`;
                  
                  if (el.type === 'aisle' || meta.shape === 'line') {
                       const geo = getElementLineGeometryPx(el);
                       const hitHeight = Math.max(geo.lineWidthPx, 16);
                       return (
                          <div 
                              key={el.id} 
                              className={`${baseClasses} bg-white/40 rounded-full hover:bg-white/60`} 
                              style={{
                                  left: geo.startXPx, top: geo.startYPx - hitHeight / 2,
                                  width: geo.lengthPx, height: hitHeight, transform: `rotate(${geo.angleDeg}deg)`, transformOrigin: '0 50%'
                              }} 
                              onMouseDown={(e) => {
                                 e.preventDefault();
                                 if (mainMode === 'edit' && (e.ctrlKey || e.metaKey || e.shiftKey)) {
                                   e.stopPropagation();
                                   setSelectedGroup(prev => prev.includes(el.id) ? prev.filter(x => x !== el.id) : [...prev, el.id]);
                                   setSelectedElement({ id: el.id, type: 'element' });
                                 }
                                 else if (mainMode === 'edit' && editModeState.action === 'edit_details') {
                                   e.stopPropagation();
                                   setSelectedElement({ id: el.id, type: 'element' });
                                 }
                                 else if (mainMode === 'edit' && editModeState.action === 'move') { e.stopPropagation(); startDrag(el, 'element', e.clientX, e.clientY, e.currentTarget, e); }
                                 else if (mainMode === 'edit' && editModeState.action === 'delete') {
                                   e.stopPropagation();
                                   setSelectedGroup([el.id]);
                                   setSelectedElement({ id: el.id, type: 'element' });
                                 }
                              }}
                              title={meta.label || 'ممر'}
                          >
                              {meta.label && <span className="absolute -top-6 text-white/50 text-xs whitespace-nowrap pointer-events-none drop-shadow-md" style={{transform: `rotate(${-geo.angleDeg}deg)`}}>{meta.label}</span>}
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
                           e.preventDefault();
                           if (mainMode === 'edit' && (e.ctrlKey || e.metaKey || e.shiftKey)) {
                              e.stopPropagation();
                              setSelectedGroup(prev => prev.includes(el.id) ? prev.filter(x => x !== el.id) : [...prev, el.id]);
                              setSelectedElement({ id: el.id, type: 'element' });
                           } else if (mainMode === 'edit' && editModeState.action === 'edit_details') {
                              e.stopPropagation();
                              setSelectedElement({ id: el.id, type: 'element' });
                           } else if (mainMode === 'edit' && editModeState.action === 'move') {
                              e.stopPropagation();
                              startDrag(el, 'element', e.clientX, e.clientY, e.currentTarget, e);
                           } else if (mainMode === 'edit' && editModeState.action === 'delete') {
                              e.stopPropagation();
                              setSelectedGroup([el.id]);
                              setSelectedElement({ id: el.id, type: 'element' });
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

                       {drawModal.type === 'aisle' && (
                         <>
                           <label className="text-sm text-slate-300">عرض الممر</label>
                           <input
                             type="range"
                             min={6}
                             max={120}
                             step={1}
                             value={drawModal.aisleWidth}
                             onChange={(e) => setDrawModal((p) => ({ ...p, aisleWidth: Number(e.target.value) }))}
                             className="w-full"
                           />
                           <div className="text-xs text-slate-400">العرض الحالي: {drawModal.aisleWidth}px</div>
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
                                      const meta = JSON.stringify({
                                        label: drawModal.name,
                                        shape: drawModal.type === 'aisle' ? 'line' : drawModal.shape,
                                        startX: drawModal.startX,
                                        startY: drawModal.startY,
                                        endX: drawModal.endX,
                                        endY: drawModal.endY,
                                        lineWidth: drawModal.type === 'aisle' ? clamp(Number(drawModal.aisleWidth || 18), 6, 120) : undefined
                                      });
                                      
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
                                  
                                  const candidateElements = mergeElementsFromDraft(nextDraft);
                                  const validationError = validateLayoutElements(candidateElements);
                                  if (validationError) {
                                    throw new Error(validationError);
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
                 <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setEditTableModal({isOpen: false, tableId: '', currentName: '', currentClass: 'A', currentCount: 12, currentOrientation: 'horizontal'})}>
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
                                   chairs_count: editTableModal.currentCount,
                                   orientation: editTableModal.currentOrientation
                                 });
                                 await loadMap();
                                setEditTableModal({isOpen: false, tableId: '', currentName: '', currentClass: 'A', currentCount: 12, currentOrientation: 'horizontal'});
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
                          onClick={() => setEditTableModal({isOpen: false, tableId: '', currentName: '', currentClass: 'A', currentCount: 12, currentOrientation: 'horizontal'})}
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
                        onTouchDragEnd={endDrag}
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

          {mainMode === 'edit' && editModeState.action === 'edit_details' && (
            <div className="rounded-xl border border-indigo-800 bg-indigo-950/20 p-4 space-y-3">
              <h2 className="text-sm font-bold text-indigo-200">تحكم المسرح/الممر</h2>
              {!elementControls ? (
                <div className="text-xs text-slate-400">اختر مسرحًا أو ممرًا من الخريطة لعرض أدوات التحكم.</div>
              ) : (
                <>
                  <div className="text-xs text-slate-300">النوع: {elementControls.elementType === 'stage' ? 'مسرح' : elementControls.elementType === 'aisle' ? 'ممر' : elementControls.elementType}</div>
                  <input
                    value={elementControls.label}
                    onChange={(e) => setElementControls((p) => (p ? { ...p, label: e.target.value } : p))}
                    placeholder="اسم العنصر"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-xs text-white"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-400">العرض</label>
                      <input
                        type="number"
                        min={1}
                        max={400}
                        value={elementControls.width}
                        onChange={(e) => setElementControls((p) => (p ? { ...p, width: Number(e.target.value) } : p))}
                        className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white"
                      />
                      <label className="text-sm text-slate-300">اتجاه الترابيزة</label>
                      <select
                        value={editTableModal.currentOrientation}
                        onChange={e => setEditTableModal(p => ({...p, currentOrientation: e.target.value as 'horizontal' | 'vertical'}))}
                        className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                      >
                        <option value="horizontal">أفقي</option>
                        <option value="vertical">رأسي</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400">الارتفاع</label>
                      <input
                        type="number"
                        min={1}
                        max={400}
                        value={elementControls.height}
                        onChange={(e) => setElementControls((p) => (p ? { ...p, height: Number(e.target.value) } : p))}
                        className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white"
                      />
                    </div>
                  </div>
                  {(elementControls.elementType === 'aisle' || elementControls.shape === 'line') && (
                    <div>
                      <label className="text-[11px] text-slate-400">عرض الممر: {Math.round(elementControls.lineWidth)}px</label>
                      <input
                        type="range"
                        min={6}
                        max={120}
                        step={1}
                        value={elementControls.lineWidth}
                        onChange={(e) => setElementControls((p) => (p ? { ...p, lineWidth: Number(e.target.value) } : p))}
                        className="w-full"
                      />
                    </div>
                  )}
                  <button
                    onClick={applyElementControls}
                    className="w-full rounded-md bg-indigo-600 hover:bg-indigo-500 text-xs font-bold py-2"
                  >
                    حفظ تعديل العنصر
                  </button>
                </>
              )}
            </div>
          )}

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
            <h2 className="text-sm font-bold">بحث منطقي في التسكين</h2>
            <input
              type="text"
              value={seatSearchQuery}
              onChange={(e) => setSeatSearchQuery(e.target.value)}
              placeholder="ابحث بالاسم أو ID أو الهاتف"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-xs text-white"
            />
            {seatSearchQuery.trim() && (
              <div className="max-h-36 overflow-auto space-y-1 custom-scrollbar">
                {searchableAttendees.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      setFocusAttendeeId(a.id);
                      setTargetNeighborId('');
                    }}
                    className={`w-full text-right px-2 py-1.5 rounded border text-xs ${focusAttendeeId === a.id ? 'border-indigo-500 bg-indigo-600/20 text-indigo-200' : 'border-slate-700 bg-slate-800 hover:bg-slate-700'}`}
                  >
                    {a.full_name} <span className="text-slate-400">({a.id.slice(0, 8)})</span>
                  </button>
                ))}
                {searchableAttendees.length === 0 && (
                  <div className="text-[11px] text-slate-500 text-center py-2">لا توجد نتائج</div>
                )}
              </div>
            )}
            {focusAttendee && (
              <div className="rounded-md border border-slate-700 bg-slate-800/50 p-2 space-y-2">
                <div className="text-xs text-slate-200 font-bold">{focusAttendee.full_name}</div>
                <div className="text-[11px] text-slate-400">المقعد الحالي: {focusSeat?.seat_code || 'غير مسكن'}</div>
                <div className="text-[11px] text-slate-300">
                  الجيران الحاليون: {focusNeighbors.length ? focusNeighbors.map((n) => `${n.full_name} (${n.seat_code})`).join(' | ') : 'لا يوجد'}
                </div>
                <select
                  value={targetNeighborId}
                  onChange={(e) => setTargetNeighborId(e.target.value)}
                  className="w-full rounded px-2 py-1.5 text-xs bg-slate-900 border border-slate-700"
                >
                  <option value="">اجعله يجلس بجانب...</option>
                  {attendees
                    .filter((a) => a.id !== focusAttendee.id && a.seat_class === focusAttendee.seat_class)
                    .map((a) => (
                      <option key={a.id} value={a.id}>{a.full_name}</option>
                    ))}
                </select>
                <button
                  onClick={solveFocusedPair}
                  disabled={!targetNeighborId || loading}
                  className="w-full rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-bold py-2"
                >
                  تنفيذ إعادة تسكين منطقية
                </button>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 flex flex-col max-h-[500px]">
             <h2 className="text-sm font-bold mb-3 flex justify-between items-center">
                <span>قائمة الانتظار</span>
                <span className="bg-indigo-600 text-white px-2 py-0.5 rounded text-xs">
                   {attendees.filter((a: any) => {
                     if (mapSeats.some(s => s.attendee_id === a.id)) return false;
                     if (waitingPaymentFilter === 'paid') return !isUnpaidOrZeroDeposit(a);
                     if (waitingPaymentFilter === 'unpaid_or_zero') return isUnpaidOrZeroDeposit(a);
                     return filteredByPhotoStatus(a);
                   }).length}
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
             <div className="mb-3 flex flex-wrap gap-1.5">
                <button
                  onClick={() => setWaitingPaymentFilter('all')}
                  className={`px-2 py-1 text-[10px] rounded border transition ${waitingPaymentFilter === 'all' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}
                >
                  الكل
                </button>
                <button
                  onClick={() => setWaitingPaymentFilter('paid')}
                  className={`px-2 py-1 text-[10px] rounded border transition ${waitingPaymentFilter === 'paid' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}
                >
                  دافعين فقط
                </button>
                <button
                  onClick={() => setWaitingPaymentFilter('unpaid_or_zero')}
                  className={`px-2 py-1 text-[10px] rounded border transition ${waitingPaymentFilter === 'unpaid_or_zero' ? 'bg-amber-600 border-amber-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}
                >
                  غير دافعين / عربون صفري
                </button>
             </div>
             <div className="mb-3 flex flex-wrap gap-1.5">
               <button
                 onClick={() => setPhotoStatusFilter('all')}
                 className={`px-2 py-1 text-[10px] rounded border transition ${photoStatusFilter === 'all' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}
               >
                 كل الصور
               </button>
               <button
                 onClick={() => setPhotoStatusFilter('ready')}
                 className={`px-2 py-1 text-[10px] rounded border transition ${photoStatusFilter === 'ready' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}
               >
                 جاهز للطباعة
               </button>
               <button
                 onClick={() => setPhotoStatusFilter('not_ready')}
                 className={`px-2 py-1 text-[10px] rounded border transition ${photoStatusFilter === 'not_ready' ? 'bg-amber-600 border-amber-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}
               >
                 غير جاهز للطباعة
               </button>
             </div>

             <div className="overflow-y-auto pr-1 flex flex-col gap-4 flex-1 custom-scrollbar">
                {['A', 'B', 'C'].map(cls => {
                   const classAttendees = attendees.filter((a: any) => 
                      a.seat_class === cls && 
                      !mapSeats.some(s => s.attendee_id === a.id) && 
                      (
                        waitingPaymentFilter === 'all' ||
                        (waitingPaymentFilter === 'paid' && !isUnpaidOrZeroDeposit(a)) ||
                        (waitingPaymentFilter === 'unpaid_or_zero' && isUnpaidOrZeroDeposit(a))
                      ) && filteredByPhotoStatus(a) &&
                      (waitingListSearch === '' || 
                       (a.full_name || '').toLowerCase().includes(waitingListSearch.toLowerCase()) || 
                       (a.phone || a.phone_primary || '').includes(waitingListSearch) ||
                       String(a.id || '').toLowerCase().includes(waitingListSearch.toLowerCase()))
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
                                    <div className="text-[10px] text-slate-500">{a.phone || a.phone_primary || '-'}</div>
                                    <div className={`text-[10px] ${isUnpaidOrZeroDeposit(a) ? 'text-amber-300' : 'text-emerald-300'}`}>
                                      {isUnpaidOrZeroDeposit(a) ? 'غير دافع / عربون صفري' : 'دافع'}
                                    </div>
                                    <div className={`text-[10px] ${a.profile_photo_url ? 'text-emerald-300' : 'text-amber-300'}`}>
                                      {a.profile_photo_url ? 'جاهز للطباعة' : 'غير جاهز للطباعة'}
                                    </div>
                                    {a.seat_change_pending && (
                                      <div className="text-[10px] text-yellow-300">تم تغيير المقعد مؤخراً</div>
                                    )}
                                    {!!a.preferred_neighbor_name && (
                                      <div className="text-[10px] text-indigo-300 truncate">
                                        بجوار: {a.preferred_neighbor_name}
                                      </div>
                                    )}
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
                {attendees.filter((a: any) => {
                  if (mapSeats.some(s => s.attendee_id === a.id)) return false;
                  if (waitingPaymentFilter === 'paid') return !isUnpaidOrZeroDeposit(a);
                  if (waitingPaymentFilter === 'unpaid_or_zero') return isUnpaidOrZeroDeposit(a);
                  return filteredByPhotoStatus(a);
                }).length === 0 && (
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
                         <div className="text-[10px] text-slate-500">{a.phone || a.phone_primary || '-'}</div>
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
