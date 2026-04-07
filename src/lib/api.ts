import { supabase } from './supabase';

export { supabase }; // Export supabase client for realtime usage

export const API_PORT = 3000;
const SEAT_PRICES: Record<string, number> = { A: 2000, B: 1700, C: 1500 };
export const GOVERNORATE_CAPACITIES: Record<string, Record<string, number>> = {
  'Minya': { A: 288, B: 430, C: 80 },
  'Asyut': { A: 200, B: 300, C: 100 },
  'Sohag': { A: 150, B: 250, C: 150 },
  'Qena': { A: 100, B: 200, C: 200 },
};
const SCHEMA_COLUMN_ERROR = /(Could not find the '([^']+)' column of 'attendees')|(column attendees\.([^ ]+) does not exist)|(column "([^"]+)" of relation "attendees" does not exist)|(column "([^"]+)" does not exist)/;
const DEFAULT_EVENT_ID = 'MINYA-MAIN-HALL';
const SEAT_RESERVED_MINUTES = 5;

const getMissingAttendeeColumn = (error: any) => {
  const errorMsg = String(error?.message || '');
  const match = errorMsg.match(SCHEMA_COLUMN_ERROR);
  if (!match) return null;
  return match[2] || match[4] || match[6] || match[8] || null;
};

const insertAttendeeSafely = async (payload: any) => {
  let currentPayload = { ...payload };
  for (let i = 0; i < 50; i += 1) {
    const { data, error } = await supabase.from('attendees').insert([currentPayload]).select().single();
    if (!error) return { data, error: null };
    const missingColumn = getMissingAttendeeColumn(error);
    if (!missingColumn || !(missingColumn in currentPayload)) return { data: null, error };
    const { [missingColumn]: _omit, ...rest } = currentPayload;
    currentPayload = rest;
  }
  return { data: null, error: { message: 'فشل حفظ العميل بعد عدة محاولات' } as any };
};

const updateAttendeeSafely = async (id: string, payload: any) => {
  let currentPayload = { ...payload };
  for (let i = 0; i < 50; i += 1) {
    const { data, error } = await supabase.from('attendees').update(currentPayload).eq('id', id).select().single();
    if (!error) return { data, error: null };
    const missingColumn = getMissingAttendeeColumn(error);
    if (!missingColumn || !(missingColumn in currentPayload)) return { data: null, error };
    const { [missingColumn]: _omit, ...rest } = currentPayload;
    currentPayload = rest;
  }
  return { data: null, error: { message: 'فشل تحديث العميل بعد عدة محاولات' } as any };
};

const getSeatCapacity = (governorate?: string, seatClass?: string) => {
  if (!governorate || !seatClass) return null;
  return GOVERNORATE_CAPACITIES[governorate]?.[seatClass] || null;
};

const getEffectiveTicketPrice = (seatClass: string, override?: number | null) => {
  if (override && !Number.isNaN(Number(override)) && Number(override) > 0) {
    return Number(override);
  }
  return SEAT_PRICES[seatClass] || 0;
};

const getBaseTicketPrice = (payload: any) => {
  if (payload?.base_ticket_price !== undefined && payload?.base_ticket_price !== null && Number(payload.base_ticket_price) > 0) {
    return Number(payload.base_ticket_price);
  }
  if (payload?.ticket_price_override !== undefined && payload?.ticket_price_override !== null && Number(payload.ticket_price_override) > 0) {
    return Number(payload.ticket_price_override);
  }
  return SEAT_PRICES[payload?.seat_class] || 0;
};

const getCertificateIncluded = (payload: any) => {
  const hasCustomPrice = payload?.ticket_price_override !== undefined && payload?.ticket_price_override !== null && Number(payload.ticket_price_override) > 0;
  if (!hasCustomPrice) return true;
  if (payload?.certificate_included === undefined || payload?.certificate_included === null) return false;
  return Boolean(payload.certificate_included);
};

const transliterateArabicToEnglish = (input?: string | null) => {
  const value = String(input || '').trim();
  if (!value) return '';
  const dictionary: Record<string, string> = {
    'محمد': 'Mohamed',
    'أحمد': 'Ahmed',
    'محمود': 'Mahmoud',
    'مصطفى': 'Mostafa',
    'حاتم': 'Hatem',
    'علي': 'Ali',
    'عبدالله': 'Abdullah',
    'عبد الله': 'Abdullah',
    'عبدالرحمن': 'Abdelrahman',
    'عبد الرحمن': 'Abdelrahman',
    'حسن': 'Hassan',
    'حسين': 'Hussein',
    'إبراهيم': 'Ibrahim',
    'اسماعيل': 'Ismail',
    'إسماعيل': 'Ismail',
    'ياسر': 'Yasser',
    'يوسف': 'Youssef',
    'خالد': 'Khaled',
    'هاني': 'Hany',
    'سعيد': 'Saeed',
    'طارق': 'Tarek',
    'عمرو': 'Amr',
    'عمر': 'Omar',
    'فاطمة': 'Fatma',
    'فاطمه': 'Fatma',
    'سارة': 'Sara',
    'ساره': 'Sara',
    'مريم': 'Mariam',
    'نور': 'Nour',
    'ايمان': 'Eman',
    'إيمان': 'Eman',
    'زينب': 'Zainab',
    'مي': 'Mai',
    'منى': 'Mona',
    'نهى': 'Noha',
    'رضا': 'Reda',
    'ربيع': 'Rabie',
    'صلاح': 'Salah'
  };
  const map: Record<string, string> = {
    'ا': 'a', 'أ': 'a', 'إ': 'e', 'آ': 'aa', 'ء': 'a', 'ؤ': 'o', 'ئ': 'e',
    'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'g', 'ح': 'h', 'خ': 'kh',
    'د': 'd', 'ذ': 'z', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh',
    'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh',
    'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
    'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a', 'ة': 'a',
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
  };
  const parts = value.replace(/\s+/g, ' ').trim().split(' ');
  const normalized = parts.map((part) => {
    if (dictionary[part]) return dictionary[part];
    const raw = part
      .split('')
      .map((ch) => map[ch] ?? ch)
      .join('')
      .trim();
    return raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : '';
  }).filter(Boolean);
  return normalized.join(' ');
};

const normalizeAttendeePricing = (attendee: any) => {
  if (!attendee) return attendee;
  const classDefault = SEAT_PRICES[attendee.seat_class] || 0;
  const override = Number(attendee.ticket_price_override || 0);
  const existingBase = Number(attendee.base_ticket_price || 0);
  const payment = Number(attendee.payment_amount || 0);

  let base = existingBase > 0 ? existingBase : (override > 0 ? override : classDefault);
  if (base === classDefault && (!existingBase && !override) && attendee.payment_type === 'full' && payment > 0 && payment < classDefault) {
    base = payment;
  }

  const remaining = Math.max(0, base - payment);
  const hasCustom = override > 0 || (base > 0 && base !== classDefault);
  const certificate = hasCustom
    ? (attendee.certificate_included === undefined || attendee.certificate_included === null ? false : Boolean(attendee.certificate_included))
    : true;

  return {
    ...attendee,
    base_ticket_price: base,
    remaining_amount: remaining,
    certificate_included: certificate
  };
};

const buildSeatBarcode = (seatClass?: string, seatNumber?: number | null) => {
  if (!seatClass || !seatNumber || Number(seatNumber) <= 0) return null;
  return `${seatClass}-${String(Number(seatNumber)).padStart(3, '0')}`;
};

const isMissingTable = (error: any) => String(error?.message || '').includes('Could not find the table');

const getSessionUser = () => {
  try {
    const raw = localStorage.getItem('local_session');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.user || null;
  } catch {
    return null;
  }
};

const isCompanyScopedRole = (role?: string | null) => role === 'company_admin' || role === 'company_employee';
const isCoreRole = (role?: string | null) => !role || ['owner', 'data_entry', 'organizer', 'social_media', 'sales'].includes(role);
const isMissingColumnError = (error: any, column: string) => {
  const msg = String(error?.message || '').toLowerCase();
  const col = String(column || '').toLowerCase();
  return msg.includes(`column ${col} does not exist`)
    || msg.includes(`'${col}' column`)
    || msg.includes(`"${col}"`);
};

const applyCompanyScopeToAttendeesQuery = (query: any, currentUser: any) => {
  if (!currentUser) return query;
  if (isCompanyScopedRole(currentUser.role)) {
    return query.eq('company_id', currentUser.company_id || '__none__');
  }
  return query;
};

const getCompanyIdForCreatedRecords = (currentUser: any) => {
  if (!currentUser) return null;
  if (isCompanyScopedRole(currentUser.role)) return currentUser.company_id || null;
  return null;
};

const buildSeatCode = (seatClass: 'A' | 'B' | 'C', rowNumber: number, side: 'left' | 'right', tableOrder: number | null, seatNumber: number) => {
  if (seatClass === 'C') return `C-R${rowNumber}-S${seatNumber}`;
  return `${seatClass}-R${rowNumber}-T${tableOrder}-S${seatNumber}`;
};

const generateHallPlan = (eventId: string, governorate: string = 'Minya') => {
  const tables: any[] = [];
  const seats: any[] = [];
  const leftTableCenters = [14, 26, 38];
  const rightTableCenters = [62, 74, 86];
  const tableSeatDx = 2.2;
  const tableSeatDy = 2.2;
  const aRowY = [28, 50, 72];
  const bRowY = [104, 126, 148];

  (['A', 'B'] as const).forEach((seatClass) => {
    const rowBases = seatClass === 'A' ? aRowY : bRowY;
    for (let row = 1; row <= 3; row += 1) {
      const yCenter = rowBases[row - 1];
      for (let tableNo = 1; tableNo <= 6; tableNo += 1) {
        const isLeft = tableNo <= 3;
        const side: 'left' | 'right' = isLeft ? 'left' : 'right';
        const xCenter = isLeft ? leftTableCenters[tableNo - 1] : rightTableCenters[tableNo - 4];
        const tableId = `${governorate}-${seatClass}-R${row}-T${tableNo}`;
        tables.push({
          id: tableId,
          event_id: eventId,
          governorate,
          seat_class: seatClass,
          row_number: row,
          side,
          table_order: tableNo,
          seats_count: 12,
          position_x: xCenter,
          position_y: yCenter,
          width: 10,
          height: 8
        });

        for (let seat = 1; seat <= 12; seat += 1) {
          const seatId = `${tableId}-S${seat}`;
          const localRow = Math.floor((seat - 1) / 4);
          const localCol = (seat - 1) % 4;
          const seatX = xCenter + (localCol - 1.5) * tableSeatDx;
          const seatY = yCenter + (localRow - 1) * tableSeatDy;
          seats.push({
            id: seatId,
            event_id: eventId,
            governorate,
            seat_class: seatClass,
            row_number: row,
            side,
            table_id: tableId,
            seat_number: seat,
            seat_code: buildSeatCode(seatClass, row, side, tableNo, seat),
            status: 'available',
            position_x: seatX,
            position_y: seatY
          });
        }
      }
    }
  });

  const cRows = 23;
  const cLeftXs = [10, 14, 18, 22, 26, 30, 34, 38];
  const cRightXs = [62, 66, 70, 74, 78, 82, 86, 90];
  const cStartY = 188;
  const cRowGap = 7;
  for (let row = 1; row <= cRows; row += 1) {
    const y = cStartY + (row - 1) * cRowGap;
    for (let s = 1; s <= 16; s += 1) {
      const side: 'left' | 'right' = s <= 8 ? 'left' : 'right';
      const seatInSide = s <= 8 ? s : s - 8;
      const x = side === 'left' ? cLeftXs[seatInSide - 1] : cRightXs[seatInSide - 1];
      const seatId = `${governorate}-C-R${row}-S${s}`;
      seats.push({
        id: seatId,
        event_id: eventId,
        governorate,
        seat_class: 'C',
        row_number: row,
        side,
        table_id: null,
        seat_number: s,
        seat_code: buildSeatCode('C', row, side, null, s),
        status: 'available',
        position_x: x,
        position_y: y
      });
    }
  }

  return { tables, seats };
};

const resolveSeat = async (
  payload: { governorate?: string; seat_class?: string; status?: string; seat_number?: number | null },
  excludeId?: string
) => {
  if (payload.status !== 'registered') return null;
  const gov = payload.governorate || 'Minya';
  const capacity = getSeatCapacity(gov, payload.seat_class);
  if (!capacity) return payload.seat_number ?? null;

  const requestedSeat = payload.seat_number ? Number(payload.seat_number) : null;
  if (requestedSeat && (requestedSeat < 1 || requestedSeat > capacity)) {
    throw new Error(`رقم المقعد يجب أن يكون بين 1 و ${capacity} لفئة ${payload.seat_class} في ${gov}`);
  }

  let query = supabase
    .from('attendees')
    .select('id, seat_number')
    .eq('governorate', gov)
    .eq('seat_class', payload.seat_class)
    .eq('status', 'registered')
    .eq('is_deleted', false);

  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query;
  if (error) {
    const missingColumn = getMissingAttendeeColumn(error);
    if (missingColumn === 'seat_number') {
      return requestedSeat ?? null;
    }
    throw new Error(error.message);
  }

  const occupied = new Set((data || []).map((row: any) => Number(row.seat_number)).filter((x: number) => Number.isInteger(x) && x > 0));

  if (requestedSeat) {
    if (occupied.has(requestedSeat)) throw new Error(`المقعد رقم ${requestedSeat} محجوز بالفعل`);
    return requestedSeat;
  }

  // If no seat requested, find all available seats and pick a random one
  const available = [];
  for (let seat = 1; seat <= capacity; seat += 1) {
    if (!occupied.has(seat)) available.push(seat);
  }

  if (available.length === 0) {
    throw new Error(`اكتمل عدد المقاعد لفئة ${payload.seat_class} في يوم ${gov}`);
  }

  // Pick a random seat from available ones
  return available[Math.floor(Math.random() * available.length)];
};

const normalizeGovernorate = (value?: string | null) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'Minya';
  if (raw.includes('asyut')) return 'Asyut';
  if (raw.includes('sohag')) return 'Sohag';
  if (raw.includes('qena')) return 'Qena';
  return 'Minya';
};

const getGovernorateFromEventId = (eventId?: string | null) => {
  const prefix = String(eventId || DEFAULT_EVENT_ID).split('-')[0];
  return normalizeGovernorate(prefix);
};

const getTableOrderFromTableId = (tableId?: string | null) => {
  const match = String(tableId || '').match(/-T(\d+)$/);
  return match ? Number(match[1]) : null;
};

const LAYOUT_VERSIONS_KEY = 'seating_layout_versions_v1';

const readLayoutVersionsStore = () => {
  try {
    return JSON.parse(localStorage.getItem(LAYOUT_VERSIONS_KEY) || '{}');
  } catch {
    return {};
  }
};

const writeLayoutVersionsStore = (value: any) => {
  localStorage.setItem(LAYOUT_VERSIONS_KEY, JSON.stringify(value || {}));
};

// Offline Queue Management
const QUEUE_KEY = 'offline_checkin_queue';

const addToQueue = (endpoint: string, body: any) => {
  const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  queue.push({ endpoint, body, timestamp: Date.now() });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
};

export const processOfflineQueue = async () => {
  if (!navigator.onLine) return;
  const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  if (queue.length === 0) return;

  console.log(`Processing ${queue.length} offline requests...`);
  const failedRequests = [];

  for (const req of queue) {
    try {
      await api.post(req.endpoint, req.body);
    } catch (e) {
      console.error('Failed to sync request:', req, e);
      // Only retry if it's a network error, not a logic error (like 404)
      failedRequests.push(req);
    }
  }

  if (failedRequests.length < queue.length) {
      // Some succeeded
      localStorage.setItem(QUEUE_KEY, JSON.stringify(failedRequests));
      alert('تمت مزامنة البيانات المسجلة أثناء انقطاع الإنترنت بنجاح.');
  }
};

// Listen for online status
window.addEventListener('online', processOfflineQueue);

// This client-side API now talks directly to Supabase when online
export const api = {
  async get(endpoint: string) {
    const currentUser = getSessionUser();
    if (endpoint.startsWith('/seating/config')) {
      return {
        event_id: DEFAULT_EVENT_ID,
        classes: {
          A: { capacity: 216, rows: 3, tables_per_side: 3, seats_per_table: 12 },
          B: { capacity: 216, rows: 3, tables_per_side: 3, seats_per_table: 12 },
          C: { capacity: 368, rows: 23, seats_per_side_per_row: 8 }
        },
        lock_minutes: SEAT_RESERVED_MINUTES
      };
    }

    if (endpoint.startsWith('/seating/map')) {
      const query = endpoint.split('?')[1] || '';
      const params = new URLSearchParams(query);
      const eventId = params.get('eventId') || DEFAULT_EVENT_ID;
      const nowIso = new Date().toISOString();
      await supabase
        .from('seats')
        .update({ status: 'available', reserved_by: null, reserved_until: null })
        .eq('event_id', eventId)
        .eq('status', 'reserved')
        .lt('reserved_until', nowIso);

      const [{ data: tables, error: tablesError }, { data: seats, error: seatsError }] = await Promise.all([
        supabase.from('seat_tables').select('*').eq('event_id', eventId).order('row_number', { ascending: true }),
        supabase.from('seats').select('*').eq('event_id', eventId).order('row_number', { ascending: true })
      ]);
      if (tablesError && !isMissingTable(tablesError)) throw new Error(tablesError.message);
      if (seatsError && !isMissingTable(seatsError)) throw new Error(seatsError.message);
      return { event_id: eventId, tables: tables || [], seats: seats || [] };
    }

    if (endpoint.startsWith('/seating/recommend')) {
      const query = endpoint.split('?')[1] || '';
      const params = new URLSearchParams(query);
      const eventId = params.get('eventId') || DEFAULT_EVENT_ID;
      const seatClass = (params.get('seatClass') || 'C') as 'A' | 'B' | 'C';
      const { data, error } = await supabase
        .from('seats')
        .select('*')
        .eq('event_id', eventId)
        .eq('seat_class', seatClass)
        .in('status', ['available', 'vip'])
        .order('row_number', { ascending: true });
      if (error) throw new Error(error.message);
      const seats = (data || []) as any[];
      if (!seats.length) return null;
      const scored = seats.map((seat) => {
        const rowScore = Number(seat.row_number || 999);
        const centerScore = Math.abs(Number(seat.position_x || 50) - 50);
        return { seat, score: rowScore * 10 + centerScore };
      }).sort((a, b) => a.score - b.score);
      return scored[0].seat;
    }

    if (endpoint.startsWith('/seating/attendees')) {
      const query = endpoint.split('?')[1] || '';
      const params = new URLSearchParams(query);
      const eventId = params.get('eventId') || DEFAULT_EVENT_ID;
      const hallGovernorate = getGovernorateFromEventId(eventId);
      const seatClass = params.get('seatClass');
      let attendeesQuery = supabase
        .from('attendees')
        .select('*')
        .eq('governorate', hallGovernorate)
        .eq('status', 'registered')
        .eq('is_deleted', false)
        .order('created_at', { ascending: true });
      if (seatClass) attendeesQuery = attendeesQuery.eq('seat_class', seatClass);
      const { data, error } = await attendeesQuery;
      if (error) throw new Error(error.message);
      return data || [];
    }

    if (endpoint.startsWith('/seating/layout-versions')) {
      const query = endpoint.split('?')[1] || '';
      const params = new URLSearchParams(query);
      const eventId = params.get('eventId') || DEFAULT_EVENT_ID;
      const store = readLayoutVersionsStore();
      const versions = Array.isArray(store[eventId]) ? store[eventId] : [];
      return versions.map((v: any) => ({ id: v.id, name: v.name, created_at: v.created_at }));
    }

    if (endpoint.startsWith('/leads/social')) {
      const query = endpoint.split('?')[1] || '';
      const params = new URLSearchParams(query);
      const userId = params.get('userId');
      if (!userId) return [];

      const scoped = applyCompanyScopeToAttendeesQuery(
        supabase.from('attendees').select('*').eq('social_media_user_id', userId),
        currentUser
      );
      let { data, error } = await scoped.order('created_at', { ascending: false });
      if (error && isMissingColumnError(error, 'company_id')) {
        const fallback = await supabase
          .from('attendees')
          .select('*')
          .eq('social_media_user_id', userId)
          .order('created_at', { ascending: false });
        data = fallback.data;
        error = fallback.error;
      }
      if (error) throw new Error(error.message);
      return data || [];
    }

    if (endpoint.startsWith('/leads/sales')) {
      const query = endpoint.split('?')[1] || '';
      const params = new URLSearchParams(query);
      const userId = params.get('userId');
      if (!userId) return { underReview: [], completedMine: [] };

      const underReviewQuery = applyCompanyScopeToAttendeesQuery(
        supabase.from('attendees').select('*').eq('lead_status', 'under_review').eq('is_deleted', false),
        currentUser
      ).order('created_at', { ascending: false });
      const completedMineQuery = applyCompanyScopeToAttendeesQuery(
        supabase.from('attendees').select('*').eq('lead_status', 'sales_completed').eq('sales_user_id', userId).eq('is_deleted', false),
        currentUser
      ).order('sales_verified_at', { ascending: false });
      let [{ data: underReview, error: underReviewError }, { data: completedMine, error: completedMineError }] = await Promise.all([underReviewQuery, completedMineQuery]);
      if ((underReviewError && isMissingColumnError(underReviewError, 'company_id')) || (completedMineError && isMissingColumnError(completedMineError, 'company_id'))) {
        const [legacyUnder, legacyCompleted] = await Promise.all([
          supabase
            .from('attendees')
            .select('*')
            .eq('lead_status', 'under_review')
            .eq('is_deleted', false)
            .order('created_at', { ascending: false }),
          supabase
            .from('attendees')
            .select('*')
            .eq('lead_status', 'sales_completed')
            .eq('sales_user_id', userId)
            .eq('is_deleted', false)
            .order('sales_verified_at', { ascending: false })
        ]);
        underReview = legacyUnder.data;
        completedMine = legacyCompleted.data;
        underReviewError = legacyUnder.error;
        completedMineError = legacyCompleted.error;
      }
      if (underReviewError) throw new Error(underReviewError.message);
      if (completedMineError) throw new Error(completedMineError.message);

      return { underReview: underReview || [], completedMine: completedMine || [] };
    }

    if (endpoint.startsWith('/attendees')) {
      const showTrash = endpoint.includes('trash=true');
      const idMatch = endpoint.match(/\/attendees\/([^\/?]+)/);
      
      if (idMatch) {
        const scoped = applyCompanyScopeToAttendeesQuery(
          supabase.from('attendees').select('*').eq('id', idMatch[1]),
          currentUser
        );
        let { data, error } = await scoped.single();
        if (error && isMissingColumnError(error, 'company_id')) {
          const fallback = await supabase.from('attendees').select('*').eq('id', idMatch[1]).single();
          data = (fallback.data as any) || [];
          error = fallback.error;
        }
        if (error) throw new Error(error.message);
        return normalizeAttendeePricing(data);
      }

      const scoped = applyCompanyScopeToAttendeesQuery(
        supabase.from('attendees').select('*').eq('is_deleted', showTrash),
        currentUser
      );
      let { data, error } = await scoped.order('created_at', { ascending: false });
      if (error && isMissingColumnError(error, 'company_id')) {
        const fallback = await supabase
          .from('attendees')
          .select('*')
          .eq('is_deleted', showTrash)
          .order('created_at', { ascending: false });
        data = fallback.data;
        error = fallback.error;
      }
      if (error) throw new Error(error.message);
      return (data || []).map(normalizeAttendeePricing);
    }

    if (endpoint.startsWith('/companies')) {
      if (!currentUser) return [];
      if (currentUser.role === 'owner') {
        const { data } = await supabase.from('companies').select('*').order('created_at', { ascending: false });
        return data || [];
      }
      if (isCompanyScopedRole(currentUser.role)) {
        const { data } = await supabase.from('companies').select('*').eq('id', currentUser.company_id).limit(1);
        return data || [];
      }
      return [];
    }

    if (endpoint.startsWith('/company-daily-report')) {
      if (currentUser?.role !== 'owner') return [];
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const sinceIso = since.toISOString();
      const [{ data: companies }, { data: attendees }] = await Promise.all([
        supabase.from('companies').select('id, name').order('name', { ascending: true }),
        supabase
          .from('attendees')
          .select('id, full_name, created_at, payment_amount, company_id, created_by')
          .gte('created_at', sinceIso)
          .eq('is_deleted', false)
      ]);
      return (companies || []).map((company: any) => {
        const items = (attendees || []).filter((a: any) => a.company_id === company.id);
        return {
          company_id: company.id,
          company_name: company.name,
          today_count: items.length,
          today_revenue: items.reduce((sum: number, row: any) => sum + (Number(row.payment_amount) || 0), 0),
          today_people: items
        };
      });
    }

    if (endpoint === '/users') {
      if (!currentUser) return [];
      let query = supabase.from('users').select('id, email, full_name, role, company_id, created_at');
      if (currentUser.role === 'owner') {
        let { data, error } = await query.order('created_at', { ascending: false });
        if (error && isMissingColumnError(error, 'company_id')) {
          const fallback = await supabase.from('users').select('id, email, full_name, role, created_at').order('created_at', { ascending: false });
          data = (fallback.data as any) || [];
          error = fallback.error;
        }
        if (error) throw new Error(error.message);
        return data || [];
      }
      if (currentUser.role === 'company_admin') {
        let { data, error } = await query.eq('company_id', currentUser.company_id).order('created_at', { ascending: false });
        if (error && isMissingColumnError(error, 'company_id')) {
          const fallback = await supabase.from('users').select('id, email, full_name, role, created_at').eq('id', currentUser.id).limit(1);
          data = (fallback.data as any) || [];
          error = fallback.error;
        }
        if (error) throw new Error(error.message);
        return data || [];
      }
      if (isCompanyScopedRole(currentUser.role)) {
        const { data } = await query.eq('id', currentUser.id).limit(1);
        return data || [];
      }
      let { data, error } = await query.order('created_at', { ascending: false });
      if (error && isMissingColumnError(error, 'company_id')) {
        const fallback = await supabase.from('users').select('id, email, full_name, role, created_at').order('created_at', { ascending: false });
        data = (fallback.data as any) || [];
        error = fallback.error;
      }
      if (error) throw new Error(error.message);
      return data || [];
    }
    return [];
  },
  
  async post(endpoint: string, body: any) {
    const currentUser = getSessionUser();
    // Offline Handling for Check-in
    if (endpoint === '/checkin' && !navigator.onLine) {
        addToQueue(endpoint, body);
        return { success: true, offline: true, message: 'تم التسجيل وضع الأوفلاين (سيتم الرفع عند عودة النت)' };
    }

    if (endpoint === '/companies') {
      if (currentUser?.role !== 'owner') throw new Error('غير مسموح بإنشاء شركة');
      const payload = {
        id: body.id || crypto.randomUUID(),
        name: String(body.name || '').trim(),
        code: body.code || null,
        owner_user_id: body.owner_user_id || null,
        created_at: new Date().toISOString()
      };
      if (!payload.name) throw new Error('اسم الشركة مطلوب');
      const { data, error } = await supabase.from('companies').insert([payload]).select().single();
      if (error) throw new Error(error.message);
      return data;
    }

    if (endpoint === '/seating/init') {
      const eventId = body?.event_id || DEFAULT_EVENT_ID;
      const rowsA = Number(body?.classA?.rows || 3);
      const rowsB = Number(body?.classB?.rows || 3);
      const tablesPerSideA = Number(body?.classA?.tables_per_side || 3);
      const tablesPerSideB = Number(body?.classB?.tables_per_side || 3);
      const seatsPerTableA = Number(body?.classA?.seats_per_table || 12);
      const seatsPerTableB = Number(body?.classB?.seats_per_table || 12);
      const classCRows = Number(body?.classC?.rows || 23);
      const classCSeatsPerSidePerRow = Number(body?.classC?.seats_per_side_per_row || 8);

      const { tables, seats } = generateHallPlan(eventId, body?.governorate || 'Minya');
      const adjustedTables = tables.map((t: any) => {
        if (t.seat_class === 'A') return { ...t, seats_count: seatsPerTableA };
        if (t.seat_class === 'B') return { ...t, seats_count: seatsPerTableB };
        return t;
      }).filter((t: any) => {
        if (t.seat_class === 'A') return t.row_number <= rowsA && t.table_order <= tablesPerSideA;
        if (t.seat_class === 'B') return t.row_number <= rowsB && t.table_order <= tablesPerSideB;
        return true;
      });

      const validTableIds = new Set(adjustedTables.map((t: any) => t.id));
      const adjustedSeats = seats.filter((s: any) => {
        if (s.seat_class === 'A') return s.row_number <= rowsA && s.table_id && validTableIds.has(s.table_id) && s.seat_number <= seatsPerTableA;
        if (s.seat_class === 'B') return s.row_number <= rowsB && s.table_id && validTableIds.has(s.table_id) && s.seat_number <= seatsPerTableB;
        if (s.seat_class === 'C') return s.row_number <= classCRows && s.seat_number <= classCSeatsPerSidePerRow;
        return true;
      });

      await supabase.from('seat_bookings').delete().eq('event_id', eventId);
      await supabase.from('seats').delete().eq('event_id', eventId);
      await supabase.from('seat_tables').delete().eq('event_id', eventId);

      const { error: insertTablesError } = await supabase.from('seat_tables').insert(adjustedTables);
      if (insertTablesError && !isMissingTable(insertTablesError)) throw new Error(insertTablesError.message);
      const { error: insertSeatsError } = await supabase.from('seats').insert(adjustedSeats);
      if (insertSeatsError && !isMissingTable(insertSeatsError)) throw new Error(insertSeatsError.message);
      return { event_id: eventId, tables: adjustedTables.length, seats: adjustedSeats.length };
    }

    if (endpoint === '/seating/reserve') {
      const eventId = body?.event_id || DEFAULT_EVENT_ID;
      const userId = body?.user_id;
      const seatIds: string[] = body?.seat_ids || [];
      if (!userId || !seatIds.length) throw new Error('بيانات الحجز المؤقت غير مكتملة');
      const reservedUntil = new Date(Date.now() + SEAT_RESERVED_MINUTES * 60 * 1000).toISOString();

      const { data: seats, error: readErr } = await supabase
        .from('seats')
        .select('*')
        .eq('event_id', eventId)
        .in('id', seatIds);
      if (readErr) throw new Error(readErr.message);
      const busy = (seats || []).find((s: any) => s.status === 'booked' || (s.status === 'reserved' && s.reserved_by !== userId && s.reserved_until && new Date(s.reserved_until) > new Date()));
      if (busy) throw new Error(`المقعد ${busy.seat_code} غير متاح حاليًا`);

      const { error } = await supabase
        .from('seats')
        .update({ status: 'reserved', reserved_by: userId, reserved_until: reservedUntil })
        .eq('event_id', eventId)
        .in('id', seatIds);
      if (error) throw new Error(error.message);
      return { success: true, reserved_until: reservedUntil };
    }

    if (endpoint === '/seating/confirm') {
      const eventId = body?.event_id || DEFAULT_EVENT_ID;
      const userId = body?.user_id;
      const attendeeId = body?.attendee_id;
      const seatIds: string[] = body?.seat_ids || [];
      const paymentStatus = body?.payment_status || 'paid';
      if (!userId || !attendeeId || !seatIds.length) throw new Error('بيانات تأكيد الحجز غير مكتملة');
      const hallGovernorate = getGovernorateFromEventId(eventId);

      const { data: attendee, error: attendeeError } = await supabase
        .from('attendees')
        .select('id, governorate')
        .eq('id', attendeeId)
        .single();
      if (attendeeError || !attendee) throw new Error('المشارك غير موجود');
      if (normalizeGovernorate(attendee.governorate) !== hallGovernorate) {
        throw new Error('لا يمكن تسكين مشارك في قاعة محافظة مختلفة عن محافظته');
      }

      const { data: seats, error: seatsError } = await supabase
        .from('seats')
        .select('*')
        .eq('event_id', eventId)
        .in('id', seatIds);
      if (seatsError) throw new Error(seatsError.message);
      const invalid = (seats || []).find((s: any) => s.status !== 'reserved' || s.reserved_by !== userId);
      if (invalid) throw new Error(`المقعد ${invalid.seat_code} غير محجوز بواسطة هذا المستخدم`);

      const { error: updateErr } = await supabase
        .from('seats')
        .update({ status: 'booked', attendee_id: attendeeId, reserved_until: null, reserved_by: null })
        .eq('event_id', eventId)
        .in('id', seatIds);
      if (updateErr) throw new Error(updateErr.message);

      await supabase.from('seat_bookings').insert(
        seatIds.map((seatId) => ({
          event_id: eventId,
          user_id: userId,
          attendee_id: attendeeId,
          seat_id: seatId,
          payment_status: paymentStatus
        }))
      );

      const primarySeat = (seats || [])[0];
      if (primarySeat) {
        const barcode = primarySeat.seat_code;
        await updateAttendeeSafely(attendeeId, {
          seat_number: Number(primarySeat.seat_number),
          seat_class: primarySeat.seat_class,
          barcode
        });
      }
      return { success: true };
    }

    if (endpoint === '/seating/release-expired') {
      const eventId = body?.event_id || DEFAULT_EVENT_ID;
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from('seats')
        .update({ status: 'available', reserved_by: null, reserved_until: null })
        .eq('event_id', eventId)
        .eq('status', 'reserved')
        .lt('reserved_until', nowIso);
      if (error) throw new Error(error.message);
      return { success: true };
    }

    if (endpoint === '/seating/toggle-vip') {
      const seatId = body?.seat_id;
      const eventId = body?.event_id || DEFAULT_EVENT_ID;
      if (!seatId) throw new Error('seat_id مطلوب');
      const { data: seat, error: seatError } = await supabase.from('seats').select('*').eq('event_id', eventId).eq('id', seatId).single();
      if (seatError) throw new Error(seatError.message);
      const nextStatus = seat.status === 'vip' ? 'available' : 'vip';
      const { error } = await supabase.from('seats').update({ status: nextStatus }).eq('event_id', eventId).eq('id', seatId);
      if (error) throw new Error(error.message);
      return { success: true, status: nextStatus };
    }

    if (endpoint === '/seating/update-layout') {
      const eventId = body?.event_id || DEFAULT_EVENT_ID;
      const updates = Array.isArray(body?.updates) ? body.updates : [];
      if (!updates.length) return { success: true, updated: 0 };

      for (const item of updates) {
        const { data: currentSeat, error: seatErr } = await supabase
          .from('seats')
          .select('id, seat_class, row_number, side, table_id, seat_number')
          .eq('event_id', eventId)
          .eq('id', item.id)
          .single();
        if (seatErr || !currentSeat) continue;
        const nextRow = Number(item.row_number ?? currentSeat.row_number);
        const nextSide = item.side ?? currentSeat.side;
        const nextTableId = item.table_id ?? currentSeat.table_id;
        const tableOrder = getTableOrderFromTableId(nextTableId);
        const nextCode = buildSeatCode(
          currentSeat.seat_class as 'A' | 'B' | 'C',
          nextRow,
          nextSide as 'left' | 'right',
          tableOrder,
          Number(currentSeat.seat_number || 1)
        );

        await supabase
          .from('seats')
          .update({
            position_x: Number(item.position_x ?? 0),
            position_y: Number(item.position_y ?? 0),
            row_number: nextRow,
            side: nextSide,
            table_id: nextTableId,
            seat_code: nextCode
          })
          .eq('event_id', eventId)
          .eq('id', item.id);
      }
      return { success: true, updated: updates.length };
    }

    if (endpoint === '/seating/layout-version/save') {
      const eventId = body?.event_id || DEFAULT_EVENT_ID;
      const name = String(body?.name || `Version ${new Date().toLocaleString()}`).trim();
      const { data: seats, error } = await supabase
        .from('seats')
        .select('id, position_x, position_y')
        .eq('event_id', eventId);
      if (error) throw new Error(error.message);
      const version = {
        id: crypto.randomUUID(),
        name,
        created_at: new Date().toISOString(),
        seats: (seats || []).map((s: any) => ({
          id: s.id,
          position_x: Number(s.position_x || 0),
          position_y: Number(s.position_y || 0)
        }))
      };
      const store = readLayoutVersionsStore();
      const current = Array.isArray(store[eventId]) ? store[eventId] : [];
      store[eventId] = [version, ...current].slice(0, 30);
      writeLayoutVersionsStore(store);
      return { success: true, version: { id: version.id, name: version.name, created_at: version.created_at } };
    }

    if (endpoint === '/seating/layout-version/apply') {
      const eventId = body?.event_id || DEFAULT_EVENT_ID;
      const versionId = body?.version_id;
      if (!versionId) throw new Error('version_id مطلوب');
      const store = readLayoutVersionsStore();
      const versions = Array.isArray(store[eventId]) ? store[eventId] : [];
      const version = versions.find((v: any) => v.id === versionId);
      if (!version) throw new Error('نسخة التخطيط غير موجودة');
      for (const seat of version.seats || []) {
        await supabase
          .from('seats')
          .update({
            position_x: Number(seat.position_x || 0),
            position_y: Number(seat.position_y || 0)
          })
          .eq('event_id', eventId)
          .eq('id', seat.id);
      }
      return { success: true, applied: Number((version.seats || []).length) };
    }

    if (endpoint === '/seating/assign-attendee') {
      const eventId = body?.event_id || DEFAULT_EVENT_ID;
      const seatId = body?.seat_id;
      const attendeeId = body?.attendee_id;
      if (!seatId || !attendeeId) throw new Error('seat_id و attendee_id مطلوبان');
      const hallGovernorate = getGovernorateFromEventId(eventId);

      const [{ data: seat, error: seatErr }, { data: attendee, error: attendeeErr }] = await Promise.all([
        supabase.from('seats').select('*').eq('event_id', eventId).eq('id', seatId).single(),
        supabase.from('attendees').select('*').eq('id', attendeeId).single()
      ]);
      if (seatErr || !seat) throw new Error('المقعد غير موجود');
      if (attendeeErr || !attendee) throw new Error('المشارك غير موجود');
      if (normalizeGovernorate(attendee.governorate) !== hallGovernorate) {
        throw new Error('لا يمكن تسكين مشارك في قاعة محافظة مختلفة عن محافظته');
      }
      if (attendee.seat_class !== seat.seat_class) {
        throw new Error('لا يمكن تسكين المشارك في فئة مختلفة عن فئته');
      }
      if (seat.status === 'booked' && seat.attendee_id && seat.attendee_id !== attendeeId) {
        throw new Error('المقعد محجوز بالفعل لمشارك آخر');
      }

      const { data: oldSeat } = await supabase
        .from('seats')
        .select('id')
        .eq('event_id', eventId)
        .eq('attendee_id', attendeeId)
        .eq('status', 'booked')
        .maybeSingle();
      if (oldSeat?.id && oldSeat.id !== seatId) {
        await supabase.from('seats').update({ status: 'available', attendee_id: null }).eq('event_id', eventId).eq('id', oldSeat.id);
      }

      await supabase
        .from('seats')
        .update({ status: 'booked', attendee_id: attendeeId, reserved_by: null, reserved_until: null })
        .eq('event_id', eventId)
        .eq('id', seatId);

      await updateAttendeeSafely(String(attendeeId), {
        status: 'registered',
        seat_number: Number(seat.seat_number),
        seat_class: seat.seat_class,
        barcode: seat.seat_code
      });

      return { success: true };
    }

    if (endpoint === '/seating/book-table') {
      const eventId = body?.event_id || DEFAULT_EVENT_ID;
      const tableId = body?.table_id;
      if (!tableId) throw new Error('table_id مطلوب');
      const hallGovernorate = getGovernorateFromEventId(eventId);

      const { data: tableSeats, error: tableSeatsError } = await supabase
        .from('seats')
        .select('*')
        .eq('event_id', eventId)
        .eq('table_id', tableId)
        .order('seat_number', { ascending: true });
      if (tableSeatsError || !tableSeats?.length) throw new Error('الطاولة غير موجودة أو بدون مقاعد');

      const seatClass = tableSeats[0].seat_class;
      const availableSeats = tableSeats.filter((s: any) => !s.attendee_id && (s.status === 'available' || s.status === 'vip'));
      if (!availableSeats.length) throw new Error('لا توجد مقاعد متاحة في هذه الطاولة');

      const { data: attendees, error: attendeesError } = await supabase
        .from('attendees')
        .select('*')
        .eq('governorate', hallGovernorate)
        .eq('seat_class', seatClass)
        .eq('status', 'registered')
        .eq('is_deleted', false)
        .order('created_at', { ascending: true });
      if (attendeesError) throw new Error(attendeesError.message);

      const attendeeList = (attendees || []) as any[];
      const freeAttendees: any[] = [];
      for (const attendee of attendeeList) {
        const { data: existing } = await supabase
          .from('seats')
          .select('id')
          .eq('event_id', eventId)
          .eq('attendee_id', attendee.id)
          .eq('status', 'booked')
          .maybeSingle();
        if (!existing) freeAttendees.push(attendee);
      }

      const targetCount = Math.min(availableSeats.length, freeAttendees.length);
      let assigned = 0;
      for (let i = 0; i < targetCount; i += 1) {
        const seat = availableSeats[i];
        const attendee = freeAttendees[i];
        await supabase
          .from('seats')
          .update({ status: 'booked', attendee_id: attendee.id, reserved_by: null, reserved_until: null })
          .eq('event_id', eventId)
          .eq('id', seat.id);

        await updateAttendeeSafely(String(attendee.id), {
          status: 'registered',
          seat_number: Number(seat.seat_number),
          seat_class: seat.seat_class,
          barcode: seat.seat_code
        });
        assigned += 1;
      }

      return { success: true, assigned };
    }

    if (endpoint === '/seating/swap-attendees') {
      const eventId = body?.event_id || DEFAULT_EVENT_ID;
      const attendeeAId = body?.attendee_a_id;
      const attendeeBId = body?.attendee_b_id;
      if (!attendeeAId || !attendeeBId) throw new Error('بيانات التبديل غير مكتملة');
      const hallGovernorate = getGovernorateFromEventId(eventId);

      const [{ data: attendeeA }, { data: attendeeB }] = await Promise.all([
        supabase.from('attendees').select('*').eq('id', attendeeAId).single(),
        supabase.from('attendees').select('*').eq('id', attendeeBId).single()
      ]);
      if (!attendeeA || !attendeeB) throw new Error('أحد المشاركين غير موجود');
      if (normalizeGovernorate(attendeeA.governorate) !== hallGovernorate || normalizeGovernorate(attendeeB.governorate) !== hallGovernorate) {
        throw new Error('لا يمكن تبديل مقاعد مشاركين من محافظة أخرى داخل هذه القاعة');
      }

      const [{ data: seatA }, { data: seatB }] = await Promise.all([
        supabase.from('seats').select('*').eq('event_id', eventId).eq('attendee_id', attendeeAId).eq('status', 'booked').maybeSingle(),
        supabase.from('seats').select('*').eq('event_id', eventId).eq('attendee_id', attendeeBId).eq('status', 'booked').maybeSingle()
      ]);
      if (!seatA || !seatB) throw new Error('لا يمكن التبديل قبل تسكين الطرفين');
      if (seatA.seat_class !== attendeeB.seat_class || seatB.seat_class !== attendeeA.seat_class) {
        throw new Error('لا يمكن التبديل بسبب تعارض فئات الكراسي');
      }

      await supabase.from('seats').update({ attendee_id: attendeeBId }).eq('event_id', eventId).eq('id', seatA.id);
      await supabase.from('seats').update({ attendee_id: attendeeAId }).eq('event_id', eventId).eq('id', seatB.id);

      await updateAttendeeSafely(String(attendeeAId), {
        seat_number: Number(seatB.seat_number),
        seat_class: seatB.seat_class,
        barcode: seatB.seat_code
      });
      await updateAttendeeSafely(String(attendeeBId), {
        seat_number: Number(seatA.seat_number),
        seat_class: seatA.seat_class,
        barcode: seatA.seat_code
      });

      return { success: true };
    }

    if (endpoint === '/seating/auto-assign') {
      const eventId = body?.event_id || DEFAULT_EVENT_ID;
      const hallGovernorate = getGovernorateFromEventId(eventId);
      const targetClass = body?.seat_class as 'A' | 'B' | 'C' | undefined;
      const classList: Array<'A' | 'B' | 'C'> = targetClass ? [targetClass] : ['A', 'B', 'C'];

      let assigned = 0;
      for (const cls of classList) {
        const [{ data: attendees }, { data: seats }] = await Promise.all([
          supabase
            .from('attendees')
            .select('*')
            .eq('governorate', hallGovernorate)
            .eq('seat_class', cls)
            .eq('status', 'registered')
            .eq('is_deleted', false)
            .order('created_at', { ascending: true }),
          supabase
            .from('seats')
            .select('*')
            .eq('event_id', eventId)
            .eq('seat_class', cls)
            .order('row_number', { ascending: true })
        ]);

        const attendeeList = (attendees || []) as any[];
        const seatList = (seats || []) as any[];
        const availableSeats = seatList
          .filter((s) => !s.attendee_id && (s.status === 'available' || s.status === 'vip'))
          .sort((a, b) => {
            const ay = Number(a.position_y || 9999);
            const by = Number(b.position_y || 9999);
            if (ay !== by) return ay - by;
            const ax = Math.abs(Number(a.position_x || 50) - 50);
            const bx = Math.abs(Number(b.position_x || 50) - 50);
            return ax - bx;
          });

        for (const attendee of attendeeList) {
          const existing = seatList.find((s) => s.attendee_id === attendee.id && s.status === 'booked');
          if (existing) continue;
          const nextSeat = availableSeats.shift();
          if (!nextSeat) break;

          await supabase
            .from('seats')
            .update({ status: 'booked', attendee_id: attendee.id, reserved_by: null, reserved_until: null })
            .eq('event_id', eventId)
            .eq('id', nextSeat.id);

          await updateAttendeeSafely(String(attendee.id), {
            seat_number: Number(nextSeat.seat_number),
            seat_class: nextSeat.seat_class,
            barcode: nextSeat.seat_code
          });
          assigned += 1;
        }
      }
      return { success: true, assigned };
    }

    if (endpoint === '/login') {
      const { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('email', body.email.trim().toLowerCase())
        .eq('password', body.password.trim())
        .single();
      
      if (!user) throw new Error('بيانات الدخول غير صحيحة');
      const { password, ...userWithoutPass } = user;
      return { user: userWithoutPass, session: { access_token: 'sb-' + user.id, user: userWithoutPass } };
    }

    if (endpoint === '/attendees') {
      // Restrict custom price to owners only
      if (body.created_by) {
        const { data: creator } = await supabase.from('users').select('id, role').eq('id', body.created_by).single();
        if (creator && creator.role === 'social_media' && body.ticket_price_override) {
          throw new Error('السعر المخصص للتذكرة مسموح للمالك فقط');
        }
      }
      const companyId = getCompanyIdForCreatedRecords(currentUser);
      const resolvedSeat = await resolveSeat({ ...body, company_id: companyId });
      const generatedBarcode = buildSeatBarcode(body.seat_class, resolvedSeat);
      const baseTicketPrice = getBaseTicketPrice(body);
      const paidAmount = Number(body.payment_amount || 0);
      const remainingAmount = Math.max(0, baseTicketPrice - paidAmount);
      const certificateIncluded = getCertificateIncluded(body);
      const fullNameEn = String(body.full_name_en || '').trim() || transliterateArabicToEnglish(body.full_name);
      const { data, error } = await insertAttendeeSafely({
        ...body,
        company_id: body.company_id ?? companyId,
        full_name_en: fullNameEn,
        base_ticket_price: baseTicketPrice,
        certificate_included: certificateIncluded,
        remaining_amount: remainingAmount,
        seat_number: resolvedSeat,
        barcode: generatedBarcode || body.barcode || null,
        ticket_printed: false,
        ticket_printed_at: null,
        certificate_printed: false,
        certificate_printed_at: null,
        is_deleted: false
      });
      if (error) throw new Error(error.message);
      
      // Log New Registration
      if (data) {
          const commission = Number(data.commission_amount || 0);
          const paid = Number(data.payment_amount || 0);
          const net = Math.max(0, paid - commission);
          await supabase.from('activity_logs').insert([{
              attendee_id: data.id,
              attendee_name: data.full_name,
              action_type: 'register',
              details: `تسجيل جديد (${data.seat_class}) - مدفوع ${paid} ج.م - عمولة ${commission} ج.م - صافي ${net} ج.م`,
              amount_change: net,
              performed_by: data.created_by,
              company_id: data.company_id ?? null
          }]);
      }
      return data;
    }

    if (endpoint === '/social-leads') {
      const leadId = body.id || crypto.randomUUID();
      const isStudent = body.occupation_type === 'student';
      const baseTicketPrice = getBaseTicketPrice(body);
      const certificateIncluded = getCertificateIncluded(body);
      const fullNameEn = String(body.full_name_en || '').trim() || transliterateArabicToEnglish(body.full_name);
      const payload = {
        id: leadId,
        full_name: body.full_name,
        full_name_en: fullNameEn,
        phone_primary: body.phone_primary,
        governorate: body.governorate,
        seat_class: body.seat_class,
        occupation_type: body.occupation_type || 'employee',
        organization_name: isStudent ? null : (body.organization_name || null),
        job_title: isStudent ? null : (body.job_title || null),
        university: isStudent ? (body.university || null) : null,
        faculty: isStudent ? (body.faculty || null) : null,
        year: isStudent ? (body.year || null) : null,
        status: 'interested',
        payment_type: 'deposit',
        payment_amount: 0,
        remaining_amount: baseTicketPrice,
        base_ticket_price: baseTicketPrice,
        certificate_included: certificateIncluded,
        preferred_neighbor_name: body.preferred_neighbor_name || null,
        attendance_status: false,
        qr_code: leadId,
        barcode: leadId.substring(0, 8),
        is_deleted: false,
        created_by: body.created_by,
        social_media_user_id: body.created_by,
        sales_channel: 'sales_team',
        sales_source_name: body.social_agent_name || null,
        lead_status: 'under_review',
        commission_amount: 100,
        social_commission_amount: 50,
        sales_commission_amount: 50,
        commission_distributed: false,
        ticket_printed: false,
        ticket_printed_at: null,
        certificate_printed: false,
        certificate_printed_at: null,
        notes: body.notes || null,
        company_id: getCompanyIdForCreatedRecords(currentUser),
      };

      const { data, error } = await insertAttendeeSafely(payload);
      if (error) throw new Error(error.message);

      await supabase.from('activity_logs').insert([{
        attendee_id: data.id,
        attendee_name: data.full_name,
        action_type: 'register',
        details: `Lead جديد من السوشيال - تحت المراجعة`,
        amount_change: 0,
        performed_by: data.created_by,
        company_id: data.company_id ?? null
      }]);

      return data;
    }

    if (endpoint === '/social-deposit') {
      const attendeeId = body.attendee_id;
      const socialUserId = body.social_user_id;
      if (!attendeeId || !socialUserId) throw new Error('بيانات العملية غير مكتملة');

      const { data: oldRecord, error: oldError } = await supabase
        .from('attendees')
        .select('*')
        .eq('id', attendeeId)
        .single();
      if (oldError || !oldRecord) throw new Error('العميل غير موجود');
      if (oldRecord.lead_status !== 'under_review') throw new Error('هذا العميل تم التعامل معه مسبقًا');

      // Social cannot set custom ticket price
      if (body.ticket_price_override) {
        throw new Error('السعر المخصص للتذكرة مسموح للمالك فقط');
      }

      const paidAmount = Number(body.payment_amount || 0);
      if (paidAmount <= 0) throw new Error('يجب تسجيل قيمة العربون');

      const totalPrice = Number(oldRecord.base_ticket_price || getEffectiveTicketPrice(oldRecord.seat_class, oldRecord.ticket_price_override));
      const remainingAmount = Math.max(0, totalPrice - paidAmount);
      const commissionSocial = 70;
      const resolvedSeat = await resolveSeat({
        governorate: oldRecord.governorate,
        seat_class: oldRecord.seat_class,
        status: 'registered',
        seat_number: body.seat_number ?? oldRecord.seat_number ?? null,
      }, attendeeId);

      const updatePayload = {
        status: 'registered',
        lead_status: 'sales_completed', // يعتبر مكتمل من السوشيال لهذه المرحلة
        sales_user_id: null,
        payment_type: 'deposit',
        payment_amount: paidAmount,
        base_ticket_price: totalPrice,
        remaining_amount: remainingAmount,
        seat_number: resolvedSeat,
        sales_verified_full_name: !!body.sales_verified_full_name,
        sales_verified_phone: !!body.sales_verified_phone,
        sales_verified_photo: !!body.sales_verified_photo,
        sales_verified_job: !!body.sales_verified_job,
        sales_verified_at: new Date().toISOString(),
        commission_amount: commissionSocial,
        social_commission_amount: commissionSocial,
        sales_commission_amount: 0,
        commission_distributed: true,
        barcode: buildSeatBarcode(oldRecord.seat_class, resolvedSeat),
      };

      const { data: updated, error: updateError } = await updateAttendeeSafely(attendeeId, updatePayload);
      if (updateError || !updated) throw new Error(updateError?.message || 'فشل تحديث العميل');

      const { data: socialUser } = await supabase
        .from('users')
        .select('id, commission_balance')
        .eq('id', socialUserId)
        .single();
      if (socialUser) {
        await supabase
          .from('users')
          .update({ commission_balance: Number(socialUser.commission_balance || 0) + commissionSocial })
          .eq('id', socialUser.id);
      }

      await supabase.from('commission_transactions').insert([{
        attendee_id: attendeeId,
        social_media_user_id: socialUserId,
        sales_user_id: null,
        total_commission: commissionSocial,
        social_amount: commissionSocial,
        sales_amount: 0,
        note: 'دفعة عربون مسجلة بواسطة السوشيال - عمولة 70 فقط',
      }]);

      await supabase.from('activity_logs').insert([{
        attendee_id: attendeeId,
        attendee_name: oldRecord.full_name,
        action_type: 'payment',
        details: `دفعة عربون بواسطة السوشيال: ${paidAmount} ج.م - عمولة السوشيال 70 ج.م`,
        amount_change: Math.max(0, paidAmount - commissionSocial),
        performed_by: socialUserId,
      }]);

      return updated;
    }

    if (endpoint === '/sales-convert') {
      const attendeeId = body.attendee_id;
      const salesUserId = body.sales_user_id;
      if (!attendeeId || !salesUserId) throw new Error('بيانات التحويل غير مكتملة');

      const { data: oldRecord, error: oldError } = await supabase
        .from('attendees')
        .select('*')
        .eq('id', attendeeId)
        .single();

      if (oldError || !oldRecord) throw new Error('العميل غير موجود');
      if (oldRecord.lead_status !== 'under_review') throw new Error('هذا العميل تم التعامل معه مسبقًا');

      const paidAmount = Number(body.payment_amount || 0);
      if (paidAmount <= 0) throw new Error('يجب تسجيل دفع عربون أو دفع كامل');

      const totalPrice = Number(oldRecord.base_ticket_price || getEffectiveTicketPrice(oldRecord.seat_class, oldRecord.ticket_price_override));
      const remainingAmount = Math.max(0, totalPrice - paidAmount);
      const totalCommission = 100;
      const socialShare = 50;
      const salesShare = 50;
      const resolvedSeat = await resolveSeat({
        governorate: oldRecord.governorate,
        seat_class: oldRecord.seat_class,
        status: 'registered',
        seat_number: body.seat_number ?? oldRecord.seat_number ?? null,
      }, attendeeId);

      const updatePayload = {
        status: 'registered',
        lead_status: 'sales_completed',
        sales_user_id: salesUserId,
        payment_type: body.payment_type || 'deposit',
        payment_amount: paidAmount,
        base_ticket_price: totalPrice,
        remaining_amount: remainingAmount,
        phone_secondary: body.phone_secondary || oldRecord.phone_secondary || null,
        email_secondary: body.email_secondary || oldRecord.email_secondary || null,
        job_title: body.job_title || oldRecord.job_title || null,
        profile_photo_url: body.profile_photo_url || oldRecord.profile_photo_url || null,
        sales_verified_full_name: !!body.sales_verified_full_name,
        sales_verified_phone: !!body.sales_verified_phone,
        sales_verified_photo: !!body.sales_verified_photo,
        sales_verified_job: !!body.sales_verified_job,
        sales_verified_at: new Date().toISOString(),
        commission_amount: totalCommission,
        social_commission_amount: socialShare,
        sales_commission_amount: salesShare,
        commission_distributed: true,
        seat_number: resolvedSeat,
        barcode: buildSeatBarcode(oldRecord.seat_class, resolvedSeat),
      };

      const { data: updated, error: updateError } = await updateAttendeeSafely(attendeeId, updatePayload);
      if (updateError || !updated) throw new Error(updateError?.message || 'فشل تحديث العميل');

      if (!oldRecord.social_media_user_id) throw new Error('لا يوجد مسؤول سوشيال لهذا العميل');

      const { data: socialUser } = await supabase
        .from('users')
        .select('id, commission_balance')
        .eq('id', oldRecord.social_media_user_id)
        .single();
      const { data: salesUser } = await supabase
        .from('users')
        .select('id, commission_balance')
        .eq('id', salesUserId)
        .single();

      if (socialUser) {
        await supabase
          .from('users')
          .update({ commission_balance: Number(socialUser.commission_balance || 0) + socialShare })
          .eq('id', socialUser.id);
      }

      if (salesUser) {
        await supabase
          .from('users')
          .update({ commission_balance: Number(salesUser.commission_balance || 0) + salesShare })
          .eq('id', salesUser.id);
      }

      await supabase.from('commission_transactions').insert([{
        attendee_id: attendeeId,
        social_media_user_id: oldRecord.social_media_user_id,
        sales_user_id: salesUserId,
        total_commission: totalCommission,
        social_amount: socialShare,
        sales_amount: salesShare,
        note: 'توزيع عمولة تلقائي عند تحويل Lead إلى عميل فعلي',
      }]);

      await supabase.from('activity_logs').insert([{
        attendee_id: attendeeId,
        attendee_name: oldRecord.full_name,
        action_type: 'payment',
        details: `تحويل من Lead إلى عميل فعلي - مدفوع ${paidAmount} ج.م - عمولة إجمالية 100 (50 سوشيال + 50 سالز)`,
        amount_change: Math.max(0, paidAmount - totalCommission),
        performed_by: salesUserId,
      }]);

      return updated;
    }

    if (endpoint === '/checkin') {
      const { code, userId } = body;
      const clean = String(code || '').trim();
      
      // Smart Search Strategy:
      // 1. Try Exact Match (Fastest)
      let { data: attendee } = await supabase
        .from('attendees')
        .select('*')
        .or(`qr_code.eq.${clean},barcode.eq.${clean},id.eq.${clean}`)
        .single();

      // 2. If not found, try "Contains" (Slower but smarter)
      // This handles cases where scanner reads "QR_123" but DB has "QR_123_456" or vice versa
      if (!attendee) {
        // Escape special chars for LIKE query
        const safeClean = clean.replace(/([%_])/g, '\\$1');
        const { data: candidates } = await supabase
          .from('attendees')
          .select('*')
          .or(`qr_code.ilike.%${safeClean}%,barcode.ilike.%${safeClean}%`)
          .limit(1); // Take the first best match
        
        if (candidates && candidates.length > 0) {
            attendee = candidates[0];
        }
      }

      if (!attendee) throw new Error('المشارك غير موجود');
      if (isCompanyScopedRole(currentUser?.role) && attendee.company_id !== currentUser?.company_id) {
        throw new Error('لا يمكنك تسجيل حضور مشارك من شركة أخرى');
      }
      if (isCoreRole(currentUser?.role) && attendee.company_id) {
        throw new Error('لا يمكنك تسجيل حضور مشارك يتبع شركة فرعية');
      }
      
      if (attendee.attendance_status) {
          // Return the attendee data even if already checked in, so UI can show "Already Checked In"
          return { success: false, error: 'تم تسجيل الحضور مسبقاً', attendee };
      }
      
      const { data: updated } = await supabase.from('attendees').update({ attendance_status: true, checked_in_at: new Date().toISOString(), checked_in_by: userId }).eq('id', attendee.id).select().single();
      
      // Log Check-in in Activity Logs too (for unified history)
      await supabase.from('activity_logs').insert([{ 
          attendee_id: attendee.id, 
          attendee_name: attendee.full_name,
          action_type: 'check_in',
          details: 'تم تسجيل الحضور',
          performed_by: userId,
          company_id: attendee.company_id ?? null
      }]);
      
      await supabase.from('logs').insert([{ attendee_id: attendee.id, recorded_by: userId, action: 'check_in' }]);
      return { success: true, attendee: updated };
    }

    if (endpoint === '/users') {
      if (!currentUser) throw new Error('غير مصرح');
      let payload = { ...body };
      if (currentUser.role === 'company_admin') {
        if (payload.role !== 'company_employee') {
          throw new Error('أدمن الشركة يمكنه إضافة موظفي شركته فقط');
        }
        payload = { ...payload, company_id: currentUser.company_id };
      } else if (currentUser.role === 'owner') {
        if ((payload.role === 'company_admin' || payload.role === 'company_employee') && !payload.company_id) {
          throw new Error('اختيار الشركة مطلوب لهذا الدور');
        }
      } else {
        throw new Error('غير مسموح بإضافة مستخدمين');
      }
      const { data, error } = await supabase.from('users').insert([payload]).select().single();
      if (error) throw new Error(error.message);
      return data;
    }
  },

  async put(endpoint: string, body: any) {
    const currentUser = getSessionUser();
    const id = endpoint.split('/').pop();
    const table = endpoint.includes('/users/') ? 'users' : 'attendees';
    
    // Smart Logging Logic for Attendees
    if (table === 'attendees') {
        const scopedRecord = applyCompanyScopeToAttendeesQuery(
          supabase.from('attendees').select('*').eq('id', id),
          currentUser
        );
        const { data: oldRecord } = await scopedRecord.single();
        
        if (oldRecord) {
            const logs = [];
            const userId = body.updated_by || null; // Assume userId is passed in body for logging

            // 1. Payment Change
            if (body.payment_amount !== undefined && Number(body.payment_amount) !== Number(oldRecord.payment_amount)) {
                const diff = Number(body.payment_amount) - Number(oldRecord.payment_amount);
                if (diff > 0) {
                    const updatedCommission = body.commission_amount !== undefined ? Number(body.commission_amount) : Number(oldRecord.commission_amount || 0);
                    logs.push({
                        attendee_id: id,
                        attendee_name: oldRecord.full_name,
                        action_type: 'payment',
                        details: `دفع إضافي: ${diff} ج.م (الإجمالي: ${body.payment_amount}) - صافي بعد العمولة: ${Math.max(0, Number(body.payment_amount) - updatedCommission)} ج.م`,
                        amount_change: diff,
                        performed_by: userId
                    });
                }
            }

            if (body.commission_amount !== undefined && Number(body.commission_amount) !== Number(oldRecord.commission_amount || 0)) {
                logs.push({
                    attendee_id: id,
                    attendee_name: oldRecord.full_name,
                    action_type: 'payment',
                    details: `تحديث العمولة من ${Number(oldRecord.commission_amount || 0)} إلى ${Number(body.commission_amount)} ج.م`,
                    amount_change: -Math.abs(Number(body.commission_amount) - Number(oldRecord.commission_amount || 0)),
                    performed_by: userId
                });
            }

            if (body.sales_channel && body.sales_channel !== oldRecord.sales_channel) {
                logs.push({
                    attendee_id: id,
                    attendee_name: oldRecord.full_name,
                    action_type: 'status',
                    details: `تحديث مصدر التسجيل من "${oldRecord.sales_channel || 'direct'}" إلى "${body.sales_channel}"`,
                    amount_change: 0,
                    performed_by: userId
                });
            }

            // 2. Status Change
            if (body.status && body.status !== oldRecord.status) {
                const statusMap: Record<string, string> = { 'interested': 'مهتم', 'registered': 'تم التسجيل' };
                logs.push({
                    attendee_id: id,
                    attendee_name: oldRecord.full_name,
                    action_type: 'status',
                    details: `تغيير الحالة من "${statusMap[oldRecord.status] || oldRecord.status}" إلى "${statusMap[body.status] || body.status}"`,
                    amount_change: 0,
                    performed_by: userId
                });
            }

            // Insert logs if any
            if (logs.length > 0) {
                await supabase.from('activity_logs').insert(logs);
            }
        }
    }

    let bodyToSave: any = body;
    if (table === 'attendees') {
      const scopedRecord = applyCompanyScopeToAttendeesQuery(
        supabase.from('attendees').select('full_name, full_name_en, governorate, seat_class, status, seat_number, barcode, ticket_price_override, base_ticket_price, certificate_included, remaining_amount').eq('id', id),
        currentUser
      );
      const { data: oldRecord } = await scopedRecord.single();
      if (oldRecord) {
        const merged = {
          governorate: body.governorate ?? oldRecord.governorate,
          seat_class: body.seat_class ?? oldRecord.seat_class,
          status: body.status ?? oldRecord.status,
          seat_number: body.seat_number ?? oldRecord.seat_number ?? null,
        };
        const resolvedSeat = await resolveSeat(merged, String(id));
        const baseTicketPrice = getBaseTicketPrice({
          seat_class: merged.seat_class,
          ticket_price_override: body.ticket_price_override ?? oldRecord.ticket_price_override ?? null,
          base_ticket_price: body.base_ticket_price ?? oldRecord.base_ticket_price ?? null
        });
        const paymentAmount = body.payment_amount !== undefined ? Number(body.payment_amount || 0) : null;
        const remainingAmount = paymentAmount === null
          ? (body.remaining_amount ?? oldRecord.remaining_amount ?? null)
          : Math.max(0, baseTicketPrice - paymentAmount);
        const certificateIncluded = getCertificateIncluded({
          ticket_price_override: body.ticket_price_override ?? oldRecord.ticket_price_override ?? null,
          certificate_included: body.certificate_included ?? oldRecord.certificate_included ?? null
        });
        const nextFullName = body.full_name ?? oldRecord.full_name ?? '';
        const nextFullNameEn = String(body.full_name_en || '').trim()
          || (body.full_name !== undefined ? transliterateArabicToEnglish(nextFullName) : (oldRecord.full_name_en || transliterateArabicToEnglish(nextFullName)));
        bodyToSave = {
          ...body,
          full_name_en: nextFullNameEn,
          base_ticket_price: baseTicketPrice,
          certificate_included: certificateIncluded,
          remaining_amount: remainingAmount,
          seat_number: resolvedSeat,
          barcode: buildSeatBarcode(merged.seat_class, resolvedSeat) || body.barcode || oldRecord.barcode || null
        };
      }
    }

    const result = table === 'attendees'
      ? await updateAttendeeSafely(String(id), { ...bodyToSave, company_id: getCompanyIdForCreatedRecords(currentUser) })
      : await supabase.from(table).update(bodyToSave).eq('id', id).select().single();
    const { data, error } = result as any;
    if (error) throw new Error(error.message);
    return data;
  },

  async patch(endpoint: string, body: any = {}) {
    const currentUser = getSessionUser();
    const parts = endpoint.split('/');
    const id = parts[2];
    if (endpoint.includes('restore')) {
      const scoped = applyCompanyScopeToAttendeesQuery(
        supabase.from('attendees').update({ is_deleted: false }).eq('id', id),
        currentUser
      );
      await scoped;
      return { success: true };
    }
    if (endpoint.includes('toggle-attendance')) {
      const scopedRead = applyCompanyScopeToAttendeesQuery(
        supabase.from('attendees').select('attendance_status').eq('id', id),
        currentUser
      );
      const { data: att } = await scopedRead.single();
      const newStatus = !att.attendance_status;
      const scopedUpdate = applyCompanyScopeToAttendeesQuery(
        supabase.from('attendees').update({ 
        attendance_status: newStatus, 
        checked_in_at: newStatus ? new Date().toISOString() : null,
        checked_in_by: newStatus ? 'manual' : null
      }).eq('id', id),
        currentUser
      );
      const { data } = await scopedUpdate.select().single();
      return data;
    }
    if (endpoint.includes('mark-printed')) {
      const documentType = String(body?.document_type || '').toLowerCase();
      if (documentType !== 'ticket' && documentType !== 'certificate') {
        throw new Error('نوع المستند غير صحيح');
      }
      const now = new Date().toISOString();
      const payload = documentType === 'ticket'
        ? { ticket_printed: true, ticket_printed_at: now }
        : { certificate_printed: true, certificate_printed_at: now };
      const result = await updateAttendeeSafely(String(id), payload);
      const { data, error } = result as any;
      if (error) throw new Error(error.message);
      return normalizeAttendeePricing(data);
    }
  },

  async delete(endpoint: string) {
    const currentUser = getSessionUser();
    const parts = endpoint.split('/');
    const id = parts[2];
    if (endpoint.includes('permanent')) {
      throw new Error('الحذف النهائي معطّل للحفاظ على البيانات');
    } else if (endpoint.includes('/users/')) {
      throw new Error('حذف المستخدمين معطّل للحفاظ على البيانات');
    } else {
      const scoped = applyCompanyScopeToAttendeesQuery(
        supabase.from('attendees').update({ is_deleted: true }).eq('id', id),
        currentUser
      );
      await scoped;
    }
    return { success: true };
  }
};
