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

const statusColor: Record<string, string> = {
  available: 'bg-green-500',
  booked: 'bg-red-500',
  reserved: 'bg-orange-500',
  vip: 'bg-yellow-400 text-black'
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

  useEffect(() => {
    setEventId(`${governorate.toUpperCase()}-2026-MAIN`);
  }, [governorate]);

  useEffect(() => {
    loadMap();
    loadAttendees();
  }, [eventId]);

  const seatsByClass = useMemo(() => {
    const filtered = (payload.seats || []).filter((s) => s.seat_class === classFilter);
    return filtered.sort((a, b) => Number(a.row_number) - Number(b.row_number));
  }, [payload.seats, classFilter]);

  const selectedSeat = useMemo(() => payload.seats.find((s) => s.id === selectedSeatId) || null, [payload.seats, selectedSeatId]);

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
    setEditSeatState((prev) => ({
      ...prev,
      position_x: prev.position_x + xDelta,
      position_y: prev.position_y + yDelta
    }));
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">مخطط المقاعد التفاعلي</h1>
          <span className="text-sm bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full">{eventId}</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">المحافظة:</label>
          <select value={governorate} onChange={(e) => setGovernorate(e.target.value)} className="border rounded-md p-2 bg-white dark:bg-gray-700">
            <option value="Minya">المنيا</option>
            <option value="Asyut">أسيوط</option>
            <option value="Sohag">سوهاج</option>
            <option value="Qena">قنا</option>
          </select>
        </div>
      </div>

      {error && <div className="p-3 rounded-md border bg-red-50 border-red-200 text-red-700">{error}</div>}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setMode('assign')} className={`px-4 py-2 rounded-md ${mode === 'assign' ? 'bg-indigo-600 text-white' : 'border'}`}>مود التسكين</button>
          <button onClick={() => setMode('edit')} className={`px-4 py-2 rounded-md ${mode === 'edit' ? 'bg-indigo-600 text-white' : 'border'}`}>مود التعديل</button>
          <button onClick={initHall} className="px-4 py-2 rounded-md border">تهيئة القاعة</button>
          <button onClick={() => autoAssign()} className="px-4 py-2 rounded-md bg-green-600 text-white">تسكين تلقائي لكل الكلاسات</button>
          <button onClick={() => autoAssign(classFilter)} className="px-4 py-2 rounded-md border">تسكين تلقائي للكلاس {classFilter}</button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <input type="number" value={adminConfig.classA_rows} onChange={(e) => setAdminConfig(prev => ({ ...prev, classA_rows: Number(e.target.value) }))} className="border rounded-md p-2" placeholder="Rows A" />
          <input type="number" value={adminConfig.classA_tables_per_side} onChange={(e) => setAdminConfig(prev => ({ ...prev, classA_tables_per_side: Number(e.target.value) }))} className="border rounded-md p-2" placeholder="Tables/Side A" />
          <input type="number" value={adminConfig.classB_rows} onChange={(e) => setAdminConfig(prev => ({ ...prev, classB_rows: Number(e.target.value) }))} className="border rounded-md p-2" placeholder="Rows B" />
          <input type="number" value={adminConfig.classC_rows} onChange={(e) => setAdminConfig(prev => ({ ...prev, classC_rows: Number(e.target.value) }))} className="border rounded-md p-2" placeholder="Rows C" />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-bold">🎤 Stage</div>
          <select value={classFilter} onChange={(e) => setClassFilter(e.target.value as 'A' | 'B' | 'C')} className="border rounded-md p-2">
            <option value="A">Class A</option>
            <option value="B">Class B</option>
            <option value="C">Class C</option>
          </select>
        </div>

        <div className="relative border rounded-md bg-gray-50 overflow-auto" style={{ height: 520 }}>
          <div className="absolute inset-x-4 top-2 text-center font-bold">المسرح</div>
          <div className="absolute inset-0 mt-8">
            {seatsByClass.map((seat) => {
              const selected = selectedSeatId === seat.id;
              return (
                <button
                  key={seat.id}
                  onClick={() => setSelectedSeatId(seat.id)}
                  className={`absolute text-[10px] px-2 py-1 rounded-md border text-white ${selected ? 'ring-2 ring-indigo-500' : ''} ${statusColor[seat.status] || 'bg-gray-500'}`}
                  style={{
                    left: `${Number(seat.position_x || 0) * 8}px`,
                    top: `${Number(seat.position_y || 0) * 4}px`
                  }}
                  title={`${seat.seat_code} - ${seat.status}`}
                >
                  {seat.seat_code}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {mode === 'edit' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-3">
          <h2 className="font-semibold">تحرير المقعد المحدد</h2>
          <div className="text-sm text-gray-600">المقعد: {selectedSeat?.seat_code || 'لا يوجد'}</div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input type="number" value={editSeatState.position_x} onChange={(e) => setEditSeatState((p) => ({ ...p, position_x: Number(e.target.value) }))} className="border rounded-md p-2" placeholder="position_x" />
            <input type="number" value={editSeatState.position_y} onChange={(e) => setEditSeatState((p) => ({ ...p, position_y: Number(e.target.value) }))} className="border rounded-md p-2" placeholder="position_y" />
            <input type="number" value={editSeatState.row_number} onChange={(e) => setEditSeatState((p) => ({ ...p, row_number: Number(e.target.value) }))} className="border rounded-md p-2" placeholder="row_number" />
            <button disabled={!selectedSeatId || loading} onClick={saveSeatLayout} className="px-4 py-2 rounded-md bg-indigo-600 text-white disabled:opacity-50">حفظ موضع المقعد</button>
          </div>
          <div className="flex gap-2">
            <button onClick={() => quickMove(-1, 0)} className="px-3 py-1 border rounded">⬅</button>
            <button onClick={() => quickMove(1, 0)} className="px-3 py-1 border rounded">➡</button>
            <button onClick={() => quickMove(0, -1)} className="px-3 py-1 border rounded">⬆</button>
            <button onClick={() => quickMove(0, 1)} className="px-3 py-1 border rounded">⬇</button>
          </div>
        </div>
      )}

      {mode === 'assign' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-3">
          <h2 className="font-semibold">مود التسكين</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <select value={selectedAttendeeId} onChange={(e) => setSelectedAttendeeId(e.target.value)} className="border rounded-md p-2">
              <option value="">اختر مشارك ({classFilter} - {governorate})</option>
              {attendees
                .filter((a) => a.seat_class === classFilter)
                .map((a) => (
                  <option key={a.id} value={a.id}>{a.full_name}</option>
                ))}
            </select>
            <input value={selectedSeat?.seat_code || ''} readOnly className="border rounded-md p-2 bg-gray-50" placeholder="المقعد المختار" />
            <button disabled={!selectedSeatId || !selectedAttendeeId || loading} onClick={assignSelected} className="px-4 py-2 rounded-md bg-green-600 text-white disabled:opacity-50">تسكين على المقعد المختار</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <select value={swapA} onChange={(e) => setSwapA(e.target.value)} className="border rounded-md p-2">
              <option value="">المشارك الأول للتبديل</option>
              {attendees.filter((a) => a.seat_class === classFilter).map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
            </select>
            <select value={swapB} onChange={(e) => setSwapB(e.target.value)} className="border rounded-md p-2">
              <option value="">المشارك الثاني للتبديل</option>
              {attendees.filter((a) => a.seat_class === classFilter).map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
            </select>
            <button disabled={!swapA || !swapB || loading} onClick={swapSeats} className="px-4 py-2 rounded-md border disabled:opacity-50">تبديل المقاعد بين شخصين</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SeatingManagement;
