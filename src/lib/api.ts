import { supabase } from './supabase';

export { supabase }; // Export supabase client for realtime usage

export const API_PORT = 3000;
const SEAT_PRICES: Record<string, number> = { A: 2000, B: 1700, C: 1500 };
export const GOVERNORATE_CAPACITIES: Record<string, Record<string, number>> = {
  'Minya': { A: 120, B: 144, C: 440 },
  'Asyut': { A: 200, B: 300, C: 100 },
  'Sohag': { A: 150, B: 250, C: 150 },
  'Qena': { A: 100, B: 200, C: 200 },
};
const SCHEMA_COLUMN_ERROR = /(Could not find the '([^']+)' column of 'attendees')|(column attendees\.([^ ]+) does not exist)|(column "([^"]+)" of relation "attendees" does not exist)|(column "([^"]+)" does not exist)/;
const DEFAULT_EVENT_ID = 'MINYA-MAIN-HALL';
const SEAT_RESERVED_MINUTES = 5;
const ATTENDEE_META_PREFIX = '__attendee_meta__:';
const ATTENDEE_METADATA_FIELDS = [
  'seat_number',
  'seat_class',
  'barcode',
  'governorate',
  'status',
  'full_name_en',
  'occupation_type',
  'organization_name',
  'job_title',
  'ticket_price_override',
  'base_ticket_price',
  'certificate_included',
  'preferred_neighbor_name',
  'preferred_neighbor_ids',
  'profile_photo_url',
  'sales_channel',
  'sales_source_name',
  'commission_amount',
  'commission_notes',
  'company_id',
  'notes'
] as const;

const getMissingAttendeeColumn = (error: any) => {
  const errorMsg = String(error?.message || '');
  const match = errorMsg.match(SCHEMA_COLUMN_ERROR);
  if (!match) return null;
  return match[2] || match[4] || match[6] || match[8] || null;
};

const normalizeWarningsArray = (warnings: any) => Array.isArray(warnings)
  ? warnings.filter((item) => typeof item === 'string')
  : [];

const stripAttendeeMetaWarning = (warnings: any) => normalizeWarningsArray(warnings)
  .filter((item) => !item.startsWith(ATTENDEE_META_PREFIX));

const parseAttendeeMeta = (warnings: any) => {
  const raw = normalizeWarningsArray(warnings).find((item) => item.startsWith(ATTENDEE_META_PREFIX));
  if (!raw) return {} as Record<string, any>;
  try {
    return JSON.parse(raw.slice(ATTENDEE_META_PREFIX.length));
  } catch {
    return {} as Record<string, any>;
  }
};

const buildAttendeeMeta = (payload: any, existingWarnings: any = []) => {
  const meta = { ...parseAttendeeMeta(existingWarnings) } as Record<string, any>;

  for (const field of ATTENDEE_METADATA_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) continue;
    const value = payload[field];
    if (value === undefined) continue;
    if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
      delete meta[field];
      continue;
    }
    meta[field] = value;
  }

  return meta;
};

const attachAttendeeMetaToPayload = (payload: any, existingWarnings: any = []) => {
  const baseWarnings = stripAttendeeMetaWarning(payload.warnings ?? existingWarnings);
  const meta = buildAttendeeMeta(payload, existingWarnings);
  const warnings = Object.keys(meta).length > 0
    ? [...baseWarnings, `${ATTENDEE_META_PREFIX}${JSON.stringify(meta)}`]
    : baseWarnings;
  return { ...payload, warnings };
};

const applyAttendeeMeta = (attendee: any) => {
  if (!attendee) return attendee;
  const meta = parseAttendeeMeta(attendee.warnings);
  const plainWarnings = stripAttendeeMetaWarning(attendee.warnings);
  const merged = { ...attendee, warnings: plainWarnings } as Record<string, any>;

  for (const field of ATTENDEE_METADATA_FIELDS) {
    const metaValue = meta[field];
    if (metaValue === undefined) continue;
    const currentValue = merged[field];
    const shouldUseMeta = currentValue === undefined
      || currentValue === null
      || currentValue === ''
      || (typeof currentValue === 'number' && Number(currentValue) === 0 && typeof metaValue === 'number');
    if (shouldUseMeta) {
      merged[field] = metaValue;
    }
  }

  if (!Array.isArray(merged.preferred_neighbor_ids)) {
    merged.preferred_neighbor_ids = Array.isArray(meta.preferred_neighbor_ids) ? meta.preferred_neighbor_ids : [];
  }

  return merged;
};

const insertAttendeeSafely = async (payload: any) => {
  let currentPayload = attachAttendeeMetaToPayload(payload, payload.warnings);
  for (let i = 0; i < 50; i += 1) {
    const { data, error } = await supabase.from('attendees').insert([currentPayload]).select().single();
    if (!error) return { data, error: null };
    
    // Auto-heal out-of-sync unique barcode constraint
    if (error.message?.includes('unique constraint') && error.message?.includes('barcode')) {
        const conflictBarcode = currentPayload.barcode;
        if (conflictBarcode) {
            const { data: conflictUser } = await supabase.from('attendees').select('id').eq('barcode', conflictBarcode).single();
            if (conflictUser) {
                await supabase.from('attendees').update({ barcode: null, seat_number: null }).eq('id', conflictUser.id);
                continue; // Try again
            }
        }
    }

    const missingColumn = getMissingAttendeeColumn(error);
    if (!missingColumn || !(missingColumn in currentPayload)) return { data: null, error };
    const { [missingColumn]: _omit, ...rest } = currentPayload;
    currentPayload = rest;
  }
  return { data: null, error: { message: 'فشل حفظ العميل بعد عدة محاولات' } as any };
};

const updateAttendeeSafely = async (id: string, payload: any) => {
  let currentPayload = attachAttendeeMetaToPayload(payload, payload.warnings);
  for (let i = 0; i < 50; i += 1) {
    const { data, error } = await supabase.from('attendees').update(currentPayload).eq('id', id).select().single();
    if (!error) return { data, error: null };
    
    // Auto-heal out-of-sync unique barcode constraint
    if (error.message?.includes('unique constraint') && error.message?.includes('barcode')) {
        const conflictBarcode = currentPayload.barcode;
        if (conflictBarcode) {
            const { data: conflictUser } = await supabase.from('attendees').select('id').eq('barcode', conflictBarcode).single();
            if (conflictUser && conflictUser.id !== id) {
                await supabase.from('attendees').update({ barcode: null, seat_number: null }).eq('id', conflictUser.id);
                continue; // Try again
            }
        }
    }

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
    'محمد': 'Mohamed', 'أحمد': 'Ahmed', 'محمود': 'Mahmoud', 'مصطفى': 'Mostafa',
    'حاتم': 'Hatem', 'علي': 'Ali', 'عبدالله': 'Abdullah', 'عبد الله': 'Abdullah',
    'عبدالرحمن': 'Abdelrahman', 'عبد الرحمن': 'Abdelrahman', 'عبد': 'Abdel',
    'حسن': 'Hassan', 'حسين': 'Hussein', 'إبراهيم': 'Ibrahim', 'اسماعيل': 'Ismail', 'إسماعيل': 'Ismail',
    'ياسر': 'Yasser', 'يوسف': 'Youssef', 'خالد': 'Khaled', 'هاني': 'Hany',
    'سعيد': 'Saeed',  'عمرو': 'Amr', 'عمر': 'Omar',
    'فاطمة': 'Fatma', 'فاطمه': 'Fatma', 'سارة': 'Sara', 'ساره': 'Sara',
    'مريم': 'Mariam',  'ايمان': 'Eman', 'إيمان': 'Eman',
    'زينب': 'Zainab', 'مي': 'Mai', 'منى': 'Mona', 'نهى': 'Noha',
    'رضا': 'Reda', 'ربيع': 'Rabie', 'صلاح': 'Salah', 'كيرلس': 'Kirollos',
    'مرزوق': 'Marzouk', 'نجيب': 'Naguib', 'مينا': 'Mina', 'ماريو': 'Mario',
    'بيتر': 'Peter', 'جرجس': 'Gerges', 'ابانوب': 'Abanoub', 'أبانوب': 'Abanoub',
    'مكاريوس': 'Makarios', 'ياسين': 'Yassin', 'سيف': 'Seif', 'مروان': 'Marwan',
    'مازن': 'Mazen', 'كريم': 'Karim', 'زياد': 'Ziad', 
    'شريف': 'Sherif', 'اشرف': 'Ashraf', 'أشرف': 'Ashraf',
    'علاء': 'Alaa', 'حسام': 'Hossam', 'وليد': 'Walid', 'بهاء': 'Bahaa',
    'باسم': 'Basem', 'تامر': 'Tamer', 'امير': 'Amir', 'أمير': 'Amir',
    'نبيل': 'Nabil', 'مجدي': 'Magdy', 'عصام': 'Essam', 'سمير': 'Samir',
    'عادل': 'Adel', 'كمال': 'Kamal', 'ممدوح': 'Mamdouh', 'مختار': 'Mokhtar',
    'سامي': 'Samy', 'رمضان': 'Ramadan', 'شعبان': 'Shaaban', 'سيد': 'Sayed',
    'عطية': 'Attia', 'شوقي': 'Shawky', 'محسن': 'Mohsen', 'صبري': 'Sabry',
    'جمال': 'Gamal', 'جلال': 'Galal', 'منصور': 'Mansour', 'محفوظ': 'Mahfouz',
    'عزت': 'Ezzat', 'فاروق': 'Farouk', 'فؤاد': 'Fouad', 'حمدي': 'Hamdy',
    'يحيى': 'Yehia', 'يحيي': 'Yehia', 'أيمن': 'Ayman', 'ايهاب': 'Ehab',
    'إيهاب': 'Ehab', 'عاطف': 'Atef', 'مجاهد': 'Mogahed', 'شادي': 'Shady',
    'فادي': 'Fady', 'هيثم': 'Haitham', 'رامي': 'Ramy', 'وائل': 'Wael',
    'نادر': 'Nader', 'عماد': 'Emad', 'عمار': 'Ammar', 'صالح': 'Saleh',
    'مايكل': 'Michael', 'ابرام': 'Abram', 'أبرام': 'Abram', 'فيلوباتر': 'Philopater',
    'بشوي': 'Bishoy', 'بيشوي': 'Bishoy', 'ديفيد': 'David', 'جورج': 'George',
    'امجد': 'Amgad', 'أمجد': 'Amgad', 
    'ماجد': 'Maged',   'ندى': 'Noha',
    'نورهان': 'Nourhan', 'ياسمين': 'Yasmine', 'يارا': 'Yara', 'رنا': 'Rana',
    'ريم': 'Reem', 'سلمى': 'Salma', 'دينا': 'Dina',
    'هدى': 'Hoda', 'سمر': 'Samar', 'سهام': 'Sahar', 'عبير': 'Abeer'
  };
  const map: Record<string, string> = {
    'ا': 'a', 'أ': 'a', 'إ': 'e', 'آ': 'a', 'ء': 'a', 'ؤ': 'o', 'ئ': 'e',
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
    
    // Smart Fallback Handling
    let raw = '';
    for (let i = 0; i < part.length; i++) {
      let char = part[i];
      
      // Handle Al (ال) at the beginning of words
      if (i === 0 && part.startsWith('ال')) {
         raw += 'El';
         i++; // skip 'ل'
         continue;
      }
      
      // Handle double 'ي' at the end
      if (i === part.length - 1 && char === 'ي' && part[i-1] === 'ي') {
         raw += 'y';
         continue;
      }
      
      // Handle 'ة' at the end
      if (i === part.length - 1 && char === 'ة') {
         raw += 'a';
         continue;
      }

      raw += map[char] ?? char;
    }
    
    // Clean up common bad mappings (like 'w' -> 'o' in the middle of words)
    raw = raw.replace(/aw/g, 'o').replace(/iy/g, 'y').replace(/ey/g, 'y');
    
    return raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : '';
  }).filter(Boolean);
  return normalized.join(' ');
};

const normalizeAttendeePricing = (attendee: any) => {
  if (!attendee) return attendee;
  const hydrated = applyAttendeeMeta(attendee);
  const classDefault = SEAT_PRICES[hydrated.seat_class] || 0;
  const override = Number(hydrated.ticket_price_override || 0);
  const existingBase = Number(hydrated.base_ticket_price || 0);
  const payment = Number(hydrated.payment_amount || 0);

  let base = existingBase > 0 ? existingBase : (override > 0 ? override : classDefault);
  if (base === classDefault && (!existingBase && !override) && hydrated.payment_type === 'full' && payment > 0 && payment < classDefault) {
    base = payment;
  }

  const remaining = Math.max(0, base - payment);
  const hasCustom = override > 0 || (base > 0 && base !== classDefault);
  const certificate = hasCustom
    ? (hydrated.certificate_included === undefined || hydrated.certificate_included === null ? false : Boolean(hydrated.certificate_included))
    : true;

  return {
    ...hydrated,
    base_ticket_price: base,
    remaining_amount: remaining,
    certificate_included: certificate
  };
};

const enrichAttendeesNeighborLabels = (items: any[]) => {
  const attendees = (items || []).map(normalizeAttendeePricing);
  const byId = new Map(attendees.map((attendee: any) => [attendee.id, attendee]));

  return attendees.map((attendee: any) => {
    const forwardIds = Array.isArray(attendee.preferred_neighbor_ids) ? attendee.preferred_neighbor_ids : [];
    const reverseIds = attendees
      .filter((other: any) => other.id !== attendee.id && Array.isArray(other.preferred_neighbor_ids) && other.preferred_neighbor_ids.includes(attendee.id))
      .map((other: any) => other.id);
    const allIds = [...new Set([...forwardIds, ...reverseIds])];
    const names = allIds
      .map((id: string) => byId.get(id))
      .filter(Boolean)
      .map((neighbor: any) => neighbor.full_name)
      .filter(Boolean);

    return {
      ...attendee,
      preferred_neighbor_ids: allIds,
      preferred_neighbor_name: names.join('، ')
    };
  });
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

const syncSeatStatus = async (attendeeId: string, governorate: string, seatClass: string, seatNumber: number | null, seatCode: string | null = null) => {
  const eventId = `${normalizeGovernorate(governorate).toUpperCase()}-2026-MAIN`;
  const mainEvents = ['MINYA-2026-MAIN', 'ASYUT-2026-MAIN', 'SOHAG-2026-MAIN', 'QENA-2026-MAIN'];

  const { data: currentAssignments } = await supabase
    .from('seats')
    .select('id, seat_code, event_id')
    .eq('attendee_id', attendeeId)
    .eq('status', 'booked')
    .limit(5);
  const currentAssignment = Array.isArray(currentAssignments) && currentAssignments.length > 0 ? currentAssignments[0] : null;

  let targetSeat: any = null;

  if (seatCode) {
    const primary = await supabase
      .from('seats')
      .select('id, seat_code, seat_number, seat_class, attendee_id, event_id')
      .eq('event_id', eventId)
      .eq('seat_code', seatCode)
      .limit(1)
      .maybeSingle();

    targetSeat = primary.data;

    if (!targetSeat) {
      for (const candidateEvent of mainEvents) {
        const found = await supabase
          .from('seats')
          .select('id, seat_code, seat_number, seat_class, attendee_id, event_id')
          .eq('event_id', candidateEvent)
          .eq('seat_code', seatCode)
          .limit(1)
          .maybeSingle();
        if (found.data) {
          targetSeat = found.data;
          break;
        }
      }
    }
  } else if (seatNumber) {
    const candidates = await supabase
      .from('seats')
      .select('id, seat_code, seat_number, seat_class, attendee_id, event_id')
      .eq('event_id', eventId)
      .eq('seat_class', seatClass)
      .eq('seat_number', seatNumber)
      .limit(2);

    if (candidates.error) throw new Error(candidates.error.message);
    if ((candidates.data || []).length > 1) {
      throw new Error('رقم المقعد غير فريد داخل القاعة. اختر المقعد من القائمة بالكود الكامل.');
    }
    if ((candidates.data || []).length === 1) targetSeat = candidates.data![0];
  }

  if (!targetSeat) {
    return currentAssignment?.seat_code || null;
  }

  if (currentAssignment?.id === targetSeat.id) {
    return targetSeat.seat_code;
  }

  if (targetSeat.attendee_id && String(targetSeat.attendee_id) !== String(attendeeId)) {
    await updateAttendeeSafely(String(targetSeat.attendee_id), { seat_number: null, barcode: null });
  }

  await supabase
    .from('seats')
    .update({ status: 'available', attendee_id: null, reserved_by: null, reserved_until: null })
    .eq('attendee_id', attendeeId)
    .neq('id', targetSeat.id);

  await supabase
    .from('seats')
    .update({ status: 'booked', attendee_id: attendeeId, reserved_by: null, reserved_until: null })
    .eq('id', targetSeat.id);

  return targetSeat.seat_code;
};

export const generateMinyaCustomPlan = (eventId: string) => {
  let tableCharIndexA = 0;
  let tableCharIndexB = 0;
  const getTableCharA = () => String.fromCharCode(65 + (tableCharIndexA % 26)) + (tableCharIndexA >= 26 ? Math.floor(tableCharIndexA/26) : '');
  const getTableCharB = () => String.fromCharCode(65 + (tableCharIndexB % 26)) + (tableCharIndexB >= 26 ? Math.floor(tableCharIndexB/26) : '');
  const tables: any[] = [];
  const seats: any[] = [];
  const gov = 'Minya';
  
  // Class A: 2 rows. Right: 3 tables, Left: 3 tables. Each table = 10 chairs.
  const aRows = 2;
  const tablesPerSide = 3;
  const aSeatsPerTable = 10;
  
  // Class B: 2 rows. Right: 3 tables, Left: 3 tables. Each table = 12 chairs.
  const bRows = 2;
  const bSeatsPerTable = 12;
  
  // Class C: 11 waves (rows). 20 left, 20 right.
  const cRows = 11;
  const cSeatsPerSide = 20;
  
  const leftTableCenters = [18, 48, 78];
  const rightTableCenters = [108, 138, 168];
  const tableSeatDx = 4;
  const tableSeatDy = 7;
  
  let currentY = 40;
  
  // Generate A
  for (let row = 1; row <= aRows; row++) {
    for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
      const side = sideIdx === 0 ? 'left' : 'right';
      for (let t = 1; t <= tablesPerSide; t++) {
        const tableOrder = sideIdx * tablesPerSide + t;
        const charName = getTableCharA(); tableCharIndexA++;
        const tableId = `${gov}-A-R${row}-T${charName}`;
        const xCenter = side === 'left' ? leftTableCenters[t-1] : rightTableCenters[t-1];
        
        tables.push({
          id: tableId, event_id: eventId, governorate: gov, seat_class: 'A',
          row_number: row, side, table_order: tableOrder, seats_count: aSeatsPerTable
        });
        
        for (let s = 1; s <= aSeatsPerTable; s++) {
          const localRow = Math.floor((s - 1) / (aSeatsPerTable / 2));
          const localCol = (s - 1) % (aSeatsPerTable / 2);
          seats.push({
            id: `${tableId}-S${s}`, event_id: eventId, governorate: gov, seat_class: 'A',
            row_number: row, side, table_id: tableId, seat_number: s,
            seat_code: `A-R${row}-T${tableOrder}-S${s}`, status: 'available',
            position_x: xCenter + (localCol - (aSeatsPerTable/4 - 0.5)) * tableSeatDx,
            position_y: currentY + (localRow - 0.5) * tableSeatDy
          });
        }
      }
    }
    currentY += 15;
  }
  
  currentY += 10;
  // Generate B
  for (let row = 1; row <= bRows; row++) {
    for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
      const side = sideIdx === 0 ? 'left' : 'right';
      for (let t = 1; t <= tablesPerSide; t++) {
        const tableOrder = sideIdx * tablesPerSide + t;
        const charName = getTableCharB(); tableCharIndexB++;
        const tableId = `${gov}-B-R${row}-T${charName}`;
        const xCenter = side === 'left' ? leftTableCenters[t-1] : rightTableCenters[t-1];
        
        tables.push({
          id: tableId, event_id: eventId, governorate: gov, seat_class: 'B',
          row_number: row, side, table_order: tableOrder, seats_count: bSeatsPerTable
        });
        
        for (let s = 1; s <= bSeatsPerTable; s++) {
          const localRow = Math.floor((s - 1) / (bSeatsPerTable / 2));
          const localCol = (s - 1) % (bSeatsPerTable / 2);
          seats.push({
            id: `${tableId}-S${s}`, event_id: eventId, governorate: gov, seat_class: 'B',
            row_number: row, side, table_id: tableId, seat_number: s,
            seat_code: `B-R${row}-T${tableOrder}-S${s}`, status: 'available',
            position_x: xCenter + (localCol - (bSeatsPerTable/4 - 0.5)) * tableSeatDx,
            position_y: currentY + (localRow - 0.5) * tableSeatDy
          });
        }
      }
    }
    currentY += 15;
  }
  
  currentY += 20;
  // Generate C
  for (let row = 1; row <= cRows; row++) {
    for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
      const side = sideIdx === 0 ? 'left' : 'right';
      const startX = side === 'left' ? 8 : 100;
      for (let s = 1; s <= cSeatsPerSide; s++) {
        const seatNum = sideIdx * cSeatsPerSide + s;
        seats.push({
            id: `${gov}-C-R${row}-S${seatNum}`, event_id: eventId, governorate: gov, seat_class: 'C',
            row_number: row, side, table_id: null, seat_number: seatNum,
            seat_code: `C-R${row}-S${seatNum}`, status: 'available',
            position_x: startX + ((s - 1) * 3.5),
            position_y: currentY
        });
      }
    }
    currentY += 8;
  }
  
  return { tables, seats };
};

export const generateExactHallPlan = (eventId: string, governorate: string, counts: {A: number, B: number, C: number}) => {
  const plan = generateHallPlan(eventId, governorate);
  
  // Now trim the generated plan to exactly match the requested counts
  const trimSeats = (cls: string, count: number) => {
    let clsSeats = plan.seats.filter(s => s.seat_class === cls);
    // Sort by row, then table, then seat to trim from the back
    clsSeats.sort((a, b) => {
      if (a.row_number !== b.row_number) return a.row_number - b.row_number;
      if (a.seat_class !== 'C') {
         const tA = Number((a.table_id || '').split('-T')[1] || 0);
         const tB = Number((b.table_id || '').split('-T')[1] || 0);
         if (tA !== tB) return tA - tB;
      }
      return a.seat_number - b.seat_number;
    });
    
    const keep = new Set(clsSeats.slice(0, count).map(s => s.id));
    plan.seats = plan.seats.filter(s => s.seat_class !== cls || keep.has(s.id));
    
    // For A and B, also remove empty tables
    if (cls !== 'C') {
      const activeTableIds = new Set(plan.seats.filter(s => s.seat_class === cls).map(s => s.table_id));
      plan.tables = plan.tables.filter(t => t.seat_class !== cls || activeTableIds.has(t.id));
    }
  };

  trimSeats('A', counts.A);
  trimSeats('B', counts.B);
  trimSeats('C', counts.C);
  
  return plan;
};

const generateHallPlan = (eventId: string, governorate: string = 'Minya') => {
  const tables: any[] = [];
  const seats: any[] = [];
  const leftTableCenters = [39, 51, 63];
  const rightTableCenters = [87, 99, 111];
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
  const cLeftXs = [35, 39, 43, 47, 51, 55, 59, 63];
  const cRightXs = [87, 91, 95, 99, 103, 107, 111, 115];
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

export const normalizeGovernorate = (value?: string | null) => {
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

        const [
          { data: tables, error: tablesError },
          { data: seats, error: seatsError },
          { data: layoutElements, error: layoutError }
        ] = await Promise.all([
          supabase.from('seat_tables').select('*').eq('event_id', eventId).order('row_number', { ascending: true }),
          supabase.from('seats').select('*').eq('event_id', eventId).order('row_number', { ascending: true }),
          supabase.from('layout_elements').select('*').eq('event_id', eventId)
        ]);

        if (tablesError && !isMissingTable(tablesError)) throw new Error(tablesError.message);
        if (seatsError && !isMissingTable(seatsError)) throw new Error(seatsError.message);
        
        return { 
          event_id: eventId, 
          tables: tables || [], 
          seats: seats || [],
          layout_elements: layoutElements || [] 
        };
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
      return enrichAttendeesNeighborLabels(data || []);
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
        const normalized = normalizeAttendeePricing(data);
        const related = await applyCompanyScopeToAttendeesQuery(
          supabase.from('attendees').select('id, full_name, warnings, is_deleted').eq('is_deleted', false),
          currentUser
        );
        const { data: relatedAttendees } = await related;
        return enrichAttendeesNeighborLabels([normalized, ...(relatedAttendees || []).filter((item: any) => item.id !== normalized.id)])[0];
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
      return enrichAttendeesNeighborLabels(data || []);
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

    if (endpoint === '/seating/update-table-id') {
      const { old_id, new_id } = body || {};
      if (!old_id || !new_id) throw new Error('بيانات غير مكتملة');
      
      // Update table ID
      const { error: tErr } = await supabase.from('seat_tables').update({ id: new_id, table_order: parseInt(new_id.split('-T')[1]) || 0 }).eq('id', old_id);
      if (tErr) throw new Error(tErr.message);
      
      // Update associated seats
      const { data: seats } = await supabase.from('seats').select('id, seat_code').eq('table_id', old_id);
      const oldNum = old_id.split('-T')[1];
      const newNum = new_id.split('-T')[1];
      for (const s of seats || []) {
        const newCode = s.seat_code.replace(`-T${oldNum}-`, `-T${newNum}-`);
        const newSeatId = s.id.replace(`-T${oldNum}-`, `-T${newNum}-`);
        await supabase.from('seats').update({ id: newSeatId, table_id: new_id, seat_code: newCode }).eq('id', s.id);
      }
      return { success: true };
    }
    
    if (endpoint === '/seating/edit-table') {
      const eventId = body?.event_id || DEFAULT_EVENT_ID;
      const tableId = body?.table_id;
      const newName = body?.name;
      const newClass = body?.seat_class;
      const newCount = Number(body?.chairs_count);
      
      const { data: table } = await supabase.from('seat_tables').select('*').eq('id', tableId).single();
      if (!table) throw new Error('Table not found');
      
      const gov = table.governorate;
      
      // Update seats if count changes
      const { data: existingSeats } = await supabase.from('seats').select('*').eq('table_id', tableId).order('seat_number', { ascending: true });
      const currentCount = existingSeats.length;
      
      // rename & class change
      const nextTableId = `${gov}-${newClass}-T${newName}`;
      const tableOrder = parseInt(newName) || table.table_order;
      
      await supabase.from('seat_tables').update({ 
         id: nextTableId, 
         seat_class: newClass, 
         seats_count: newCount,
         table_order: tableOrder
      }).eq('id', tableId);
      
      for (const s of existingSeats) {
         const newSeatCode = buildSeatCode(newClass as any, table.row_number, 'left', tableOrder, s.seat_number).replace(`T${tableOrder}`, `T${newName}`);
         const newSeatId = `${nextTableId}-S${s.seat_number}`;
         await supabase.from('seats').update({
            id: newSeatId,
            table_id: nextTableId,
            seat_class: newClass,
            seat_code: newSeatCode
         }).eq('id', s.id);
      }
      
      if (newCount > currentCount) {
         // Add new seats
         const newSeats = [];
         const existingNumbers = existingSeats.map(s => s.seat_number);
         let nextNum = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
         for (let i = 0; i < (newCount - currentCount); i++) {
             const num = nextNum++;
             newSeats.push({
               id: `${nextTableId}-S${num}`,
               event_id: eventId,
               governorate: gov,
               seat_class: newClass,
               row_number: table.row_number,
               side: 'left',
               table_id: nextTableId,
               seat_number: num,
               seat_code: buildSeatCode(newClass as any, table.row_number, 'left', tableOrder, num).replace(`T${tableOrder}`, `T${newName}`),
               status: 'available',
               position_x: Number(existingSeats[0]?.position_x || 50) + (i * 2), // rough offset
               position_y: Number(existingSeats[0]?.position_y || 50)
             });
         }
         await supabase.from('seats').insert(newSeats);
      } else if (newCount < currentCount) {
         // Remove excess seats prioritizing empty ones
         const seatsToRemoveCount = currentCount - newCount;
         const sortedForRemoval = [...existingSeats].sort((a, b) => {
             const aEmpty = a.status === 'available' ? 0 : 1;
             const bEmpty = b.status === 'available' ? 0 : 1;
             if (aEmpty !== bEmpty) return aEmpty - bEmpty;
             return b.seat_number - a.seat_number; 
         });
         const seatsToRemove = sortedForRemoval.slice(0, seatsToRemoveCount);
         for (const s of seatsToRemove) {
             if (s.attendee_id) {
                 await updateAttendeeSafely(String(s.attendee_id), { seat_number: null, barcode: null });
             }
             await supabase.from('seats').delete().eq('id', s.id);
         }
      }
      
      return { success: true };
    }
    
    if (endpoint === '/seating/delete-element') {
      const eventId = body?.event_id || DEFAULT_EVENT_ID;
      const id = body?.id;
      const type = body?.type;
      
      if (!id || !type) throw new Error('ID and Type required');
      
      if (type === 'table') {
        const { data: seats } = await supabase.from('seats').select('attendee_id').eq('table_id', id).not('attendee_id', 'is', null);
        if (seats && seats.length > 0) {
           for (const s of seats) {
              await updateAttendeeSafely(String(s.attendee_id), { seat_number: null, barcode: null });
           }
        }
        await supabase.from('seats').delete().eq('table_id', id);
        await supabase.from('seat_tables').delete().eq('id', id);
      } else if (['element', 'stage', 'aisle', 'blocked'].includes(type)) {
       await supabase.from('layout_elements').delete().eq('id', id);
      } else if (type === 'wave') {
         // wave uses row_number for C
         const { data: seats } = await supabase.from('seats').select('attendee_id').eq('row_number', id).eq('seat_class', 'C').eq('event_id', eventId).not('attendee_id', 'is', null);
         if (seats && seats.length > 0) {
            for (const s of seats) {
               await updateAttendeeSafely(String(s.attendee_id), { seat_number: null, barcode: null });
            }
         }
         await supabase.from('seats').delete().eq('row_number', id).eq('seat_class', 'C').eq('event_id', eventId);
      } else if (type === 'seat') {
         const { data: seat } = await supabase.from('seats').select('attendee_id').eq('id', id).single();
         if (seat && seat.attendee_id) {
            await updateAttendeeSafely(String(seat.attendee_id), { seat_number: null, barcode: null });
         }
         await supabase.from('seats').delete().eq('id', id);
      }
      
      return { success: true };
    }
    
    if (endpoint === '/seating/add-element') {
      const eventId = body?.event_id || DEFAULT_EVENT_ID;
      const type = body?.type;
      const cls = body?.seat_class;
      const gov = body?.governorate || 'Minya';
      
      // Generate slightly random offset so they don't overlap perfectly
      const offsetX = 40 + Math.floor(Math.random() * 20);
      const offsetY = 40 + Math.floor(Math.random() * 20);
      const uniqueSuffix = Math.floor(Math.random() * 1000000);
      
      if (['stage', 'blocked', 'element', 'aisle'].includes(type)) {
        const id = `${gov}-${type}-${uniqueSuffix}`;
        await supabase.from('layout_elements').insert([{
          id,
          event_id: eventId,
          governorate: gov,
          type,
          position_x: body.position_x ?? offsetX,
          position_y: body.position_y ?? offsetY,
          width: body?.width || 8,
          height: body?.height || 4,
          name: body?.name || null
        }]);
      } else if (type === 'table') {
        const tableName = body?.name || String(uniqueSuffix % 1000);
        const chairsCount = Number(body?.chairs_count || 12);
        const tableId = `${gov}-${cls}-T${tableName}`;
        
        const { data: maxSeats } = await supabase.from('seats').select('row_number, seat_code').eq('event_id', eventId).eq('seat_class', cls).order('row_number', { ascending: false }).limit(1);
        const nextRow = (maxSeats?.[0]?.row_number || 0) + 1;
        const tableOrder = uniqueSuffix % 1000;
        
        await supabase.from('seat_tables').insert([{
          id: tableId,
          event_id: eventId,
          governorate: gov,
          seat_class: cls,
          row_number: nextRow,
          side: 'left',
          table_order: tableOrder,
          seats_count: chairsCount
        }]);
        
        const seats = [];
        for(let i = 1; i <= chairsCount; i++) {
          const cols = Math.ceil(chairsCount / 2);
          const localRow = Math.floor((i - 1) / cols);
          const localCol = (i - 1) % cols;
          const seatX = offsetX + (localCol - (cols/2 - 0.5)) * 2.2;
          const seatY = offsetY + (localRow - 0.5) * 2.2;
          seats.push({
            id: `${tableId}-S${i}`,
            event_id: eventId,
            governorate: gov,
            seat_class: cls,
            row_number: nextRow,
            side: 'left',
            table_id: tableId,
            seat_number: i,
            seat_code: buildSeatCode(cls, nextRow, 'left', tableOrder, i).replace(`T${tableOrder}`, `T${tableName}`),
            status: 'available',
            position_x: seatX,
            position_y: seatY
          });
        }
        await supabase.from('seats').insert(seats);
      } else if (type === 'wave') {
         const count = Number(body?.chairs_count || 10);
         const startX = Number(body?.startX || 0);
         const startY = Number(body?.startY || 0);
         const endX = Number(body?.endX || 0);
         const endY = Number(body?.endY || 0);
         const waveName = body?.name || 'W';
         const seatClass = body?.seat_class || 'C';
         
         const seats = [];
         for (let i = 0; i < count; i++) {
             const t = count > 1 ? i / (count - 1) : 0.5;
             const sx = startX + t * (endX - startX);
             const sy = startY + t * (endY - startY);
             seats.push({
                 id: `${gov}-${seatClass}-${waveName}-S${i+1}-${crypto.randomUUID().slice(0,4)}`,
                 event_id: eventId,
                 governorate: gov,
                 seat_class: seatClass,
                 wave_number: waveName,
                 seat_number: i + 1,
                 seat_code: `${seatClass}-${waveName}-S${i+1}`,
                 status: 'available',
                 position_x: Math.round(sx * 10) / 10,
                 position_y: Math.round(sy * 10) / 10
             });
         }
         await supabase.from('seats').insert(seats);
      } else if (type === 'seat') {
        const { data: maxSeats } = await supabase.from('seats').select('row_number, seat_code').eq('event_id', eventId).eq('seat_class', cls).order('row_number', { ascending: false }).limit(1);
        const nextRow = (maxSeats?.[0]?.row_number || 0) + 1;
        const num = uniqueSuffix % 1000;
        await supabase.from('seats').insert([{
            id: `${gov}-${cls}-S${uniqueSuffix}`,
            event_id: eventId,
            governorate: gov,
            seat_class: cls,
            row_number: nextRow,
            side: 'left',
            seat_number: num,
            seat_code: `${cls}-Extra-S${num}`,
            status: 'available',
            position_x: offsetX,
            position_y: offsetY
        }]);
      }
      return { success: true };
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

      const { tables, seats } = body?.governorate === 'Minya' ? generateMinyaCustomPlan(eventId) : generateHallPlan(eventId, body?.governorate || 'Minya');
      const isMinyaCustom = body?.governorate === 'Minya';
        const adjustedTables = isMinyaCustom ? tables : tables.map((t: any) => {
        if (t.seat_class === 'A') return { ...t, seats_count: seatsPerTableA };
        if (t.seat_class === 'B') return { ...t, seats_count: seatsPerTableB };
        return t;
      }).filter((t: any) => {
        if (t.seat_class === 'A') return t.row_number <= rowsA && t.table_order <= tablesPerSideA;
        if (t.seat_class === 'B') return t.row_number <= rowsB && t.table_order <= tablesPerSideB;
        return true;
      });

      const validTableIds = new Set(adjustedTables.map((t: any) => t.id));
      // Even if it is Minya, we need to map over it to ensure no strange float values are sent to integers.
        const cleanedSeats = seats.map((s: any) => ({
           ...s,
           position_x: Number(Number(s.position_x).toFixed(2)),
           position_y: Number(Number(s.position_y).toFixed(2)),
           relative_x: s.relative_x ? Number(Number(s.relative_x).toFixed(2)) : null,
           relative_y: s.relative_y ? Number(Number(s.relative_y).toFixed(2)) : null,
           row_number: Math.round(Number(s.row_number)),
           seat_number: Math.round(Number(s.seat_number)),
           wave_number: s.wave_number ? Math.round(Number(s.wave_number)) : null
        }));
        const adjustedSeats = isMinyaCustom ? cleanedSeats : cleanedSeats.filter((s: any) => {
        if (s.seat_class === 'A') return s.row_number <= rowsA && s.table_id && validTableIds.has(s.table_id) && s.seat_number <= seatsPerTableA;
        if (s.seat_class === 'B') return s.row_number <= rowsB && s.table_id && validTableIds.has(s.table_id) && s.seat_number <= seatsPerTableB;
        if (s.seat_class === 'C') return s.row_number <= classCRows && s.seat_number <= classCSeatsPerSidePerRow;
        return true;
      });

      await supabase.from('seat_bookings').delete().eq('event_id', eventId);
      await supabase.from('seats').delete().eq('event_id', eventId);
      await supabase.from('seat_tables').delete().eq('event_id', eventId);

      const { error: insertTablesError } = await supabase.from('seat_tables').insert(adjustedTables);
      if (insertTablesError && !isMissingTable(insertTablesError)) { console.error('Tables Insert Error:', insertTablesError); throw new Error(insertTablesError.message); }
      const { error: insertSeatsError } = await supabase.from('seats').insert(adjustedSeats);
      if (insertSeatsError && !isMissingTable(insertSeatsError)) { console.error('Seats Insert Error:', insertSeatsError); throw new Error(insertSeatsError.message); }
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

    if (endpoint === '/seating/bulk-save') {
      const eventId = body?.event_id || DEFAULT_EVENT_ID;
      const { updates = [], deletions = [], inserts = { seats: [], elements: [] } } = body || {};

      for (const del of deletions) {
        if (del.type === 'table') {
          const { data: seats } = await supabase.from('seats').select('attendee_id').eq('table_id', del.id).not('attendee_id', 'is', null);
          if (seats && seats.length > 0) {
             for (const s of seats) { await updateAttendeeSafely(String(s.attendee_id), { seat_number: null, barcode: null }); }
          }
          await supabase.from('seats').delete().eq('table_id', del.id);
          await supabase.from('seat_tables').delete().eq('id', del.id);
        } else if (['element', 'stage', 'aisle', 'blocked'].includes(del.type)) {
          await supabase.from('layout_elements').delete().eq('id', del.id);
        } else if (del.type === 'seat') {
          const { data: seat } = await supabase.from('seats').select('attendee_id').eq('id', del.id).single();
          if (seat && seat.attendee_id) { await updateAttendeeSafely(String(seat.attendee_id), { seat_number: null, barcode: null }); }
          await supabase.from('seats').delete().eq('id', del.id);
        }
      }

      for (const item of updates) {
        if (['element', 'stage', 'aisle', 'blocked'].includes(item.type)) {
           await supabase.from('layout_elements').update({ position_x: Number(item.position_x ?? 0), position_y: Number(item.position_y ?? 0) }).eq('event_id', eventId).eq('id', item.id);
        } else if (item.type === 'seat') {
           await supabase.from('seats').update({ position_x: Number(item.position_x ?? 0), position_y: Number(item.position_y ?? 0) }).eq('event_id', eventId).eq('id', item.id);
        }
      }

      if (inserts.elements && inserts.elements.length > 0) {
          const gov = eventId.split('-')[0] || 'MINYA';
          const elPayload = inserts.elements.map((e: any) => ({
              id: e.id, event_id: eventId, governorate: gov, type: e.type, position_x: e.position_x, position_y: e.position_y, width: e.width, height: e.height, name: e.name
          }));
          await supabase.from('layout_elements').insert(elPayload);
      }

      if (inserts.seats && inserts.seats.length > 0) {
          const gov = eventId.split('-')[0] || 'MINYA';
          const tableIds = new Set(inserts.seats.map((s: any) => s.table_id).filter(Boolean));
          const tablePayload = Array.from(tableIds).map((tId: any) => {
              const parts = tId.split('-');
              const cls = parts[2] || 'A';
              const nameStr = parts[3] ? parts[3].replace('T', '') : '1';
              const count = inserts.seats.filter((s: any) => s.table_id === tId).length;
              return { id: tId, event_id: eventId, governorate: gov, seat_class: cls, row_number: 99, side: 'left', table_order: parseInt(nameStr) || 1, seats_count: count };
          });
          if (tablePayload.length > 0) {
              await supabase.from('seat_tables').insert(tablePayload);
          }
          
          const seatPayload = inserts.seats.map((s: any) => ({
              id: s.id, event_id: eventId, governorate: gov, seat_class: s.seat_class || 'C', row_number: 99, side: 'left', table_id: s.table_id || null, seat_number: s.seat_number || 1, seat_code: s.seat_code || s.id, status: 'available', position_x: s.position_x, position_y: s.position_y, wave_number: s.wave_number || null
          }));
          await supabase.from('seats').insert(seatPayload);
      }

      return { success: true };
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
        // Free the previous attendee
        await updateAttendeeSafely(String(seat.attendee_id), {
           seat_number: null,
           barcode: null
        });
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

    if (endpoint === '/seating/unassign-attendee') {
      const eventId = body?.event_id || DEFAULT_EVENT_ID;
      const seatId = body?.seat_id;
      if (!seatId) throw new Error('seat_id مطلوب');
      
      const { data: seat } = await supabase.from('seats').select('*').eq('event_id', eventId).eq('id', seatId).single();
      if (!seat) throw new Error('المقعد غير موجود');
      
      if (seat.attendee_id) {
        await updateAttendeeSafely(String(seat.attendee_id), {
          seat_number: null,
          barcode: null
        });
      }
      
      await supabase
        .from('seats')
        .update({ status: 'available', attendee_id: null, reserved_by: null, reserved_until: null })
        .eq('event_id', eventId)
        .eq('id', seatId);
        
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

    if (endpoint === '/seating/auto-assign-all') {
      const eventId = body?.event_id || DEFAULT_EVENT_ID;
      
      // Get all attendees without seats
      const { data: attendees } = await supabase.from('attendees').select('id, seat_class, governorate').is('seat_number', null);
      if (!attendees || !attendees.length) return { success: true, count: 0 };
      
      let assignedCount = 0;
      
      // Group by class to process efficiently
      const classes = ['A', 'B', 'C'];
      for (const cls of classes) {
         const classAttendees = attendees.filter(a => a.seat_class === cls);
         if (!classAttendees.length) continue;
         
         // Get available seats for this class
         const { data: availableSeats } = await supabase.from('seats')
            .select('*')
            .eq('event_id', eventId)
            .eq('seat_class', cls)
            .eq('status', 'available')
            .order('row_number', { ascending: true })
            .order('seat_number', { ascending: true })
            .limit(classAttendees.length);
            
         if (!availableSeats || !availableSeats.length) continue;
         
         const toAssign = Math.min(classAttendees.length, availableSeats.length);
         
         const assignmentsToMake = [];
         for (let i = 0; i < toAssign; i++) {
            assignmentsToMake.push({ att: classAttendees[i], seat: availableSeats[i] });
         }
         
         const BATCH_SIZE = 15;
         for (let i = 0; i < assignmentsToMake.length; i += BATCH_SIZE) {
            const batch = assignmentsToMake.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async ({ att, seat }) => {
               await supabase.from('seats').update({
                  status: 'booked',
                  attendee_id: att.id
               }).eq('id', seat.id);
               
               await supabase.from('attendees').update({
                  seat_number: seat.seat_number,
                  governorate: seat.governorate
               }).eq('id', att.id);
            }));
            assignedCount += batch.length;
         }
      }
      return { success: true, count: assignedCount };
    }
    
    if (endpoint === '/seating/auto-assign') {
      const eventId = body?.event_id || DEFAULT_EVENT_ID;
      const hallGovernorate = getGovernorateFromEventId(eventId);
      const targetClass = body?.seat_class as 'A' | 'B' | 'C' | undefined;
      const classList: Array<'A' | 'B' | 'C'> = targetClass ? [targetClass] : ['A', 'B', 'C'];

      let assigned = 0;
      for (const cls of classList) {
        // Remove .limit() to fetch all attendees and all seats without pagination limit up to 5000
        const [{ data: attendees }, { data: seats }] = await Promise.all([
          supabase
            .from('attendees')
            .select('id, full_name, governorate, seat_class, status, seat_number')
            .eq('governorate', hallGovernorate)
            .eq('seat_class', cls)
            .eq('status', 'registered')
            .eq('is_deleted', false)
            .is('seat_number', null)
            .order('created_at', { ascending: true })
            .limit(5000),
          supabase
            .from('seats')
            .select('id, seat_number, seat_class, seat_code, position_x, position_y, status, attendee_id')
            .eq('event_id', eventId)
            .eq('seat_class', cls)
            .order('row_number', { ascending: true })
            .limit(5000)
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

        const assignmentsToMake: any[] = [];
        for (const attendee of attendeeList) {
          const existing = seatList.find((s) => s.attendee_id === attendee.id && s.status === 'booked');
          if (existing) continue;
          const nextSeat = availableSeats.shift();
          if (!nextSeat) break;
          assignmentsToMake.push({ attendee, seat: nextSeat });
        }

        // Process in batches of 15 to avoid timeout
        const BATCH_SIZE = 15;
        for (let i = 0; i < assignmentsToMake.length; i += BATCH_SIZE) {
          const batch = assignmentsToMake.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map(async ({ attendee, seat }) => {
             await supabase
               .from('seats')
               .update({ status: 'booked', attendee_id: attendee.id, reserved_by: null, reserved_until: null })
               .eq('id', seat.id);

             await updateAttendeeSafely(String(attendee.id), {
               seat_number: Number(seat.seat_number),
               seat_class: seat.seat_class,
               barcode: seat.seat_code
             });
          }));
          assigned += batch.length;
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
        barcode: body.barcode || null,
        ticket_printed: false,
        ticket_printed_at: null,
        certificate_printed: false,
        certificate_printed_at: null,
        is_deleted: false
      });
      if (error) throw new Error(error.message);
      
      if (data) {
        const newBarcode = await syncSeatStatus(data.id, data.governorate, data.seat_class, data.seat_number, data.barcode);
        if (newBarcode && newBarcode !== data.barcode) {
          await supabase.from('attendees').update({ barcode: newBarcode }).eq('id', data.id);
          data.barcode = newBarcode;
        }
      }

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
        barcode: body.barcode || null,
      };

      const { data: updated, error: updateError } = await updateAttendeeSafely(attendeeId, updatePayload);
      if (updateError || !updated) throw new Error(updateError?.message || 'فشل تحديث العميل');

      const newBarcode = await syncSeatStatus(updated.id, updated.governorate, updated.seat_class, updated.seat_number, updated.barcode);
      if (newBarcode && newBarcode !== updated.barcode) {
         await supabase.from('attendees').update({ barcode: newBarcode }).eq('id', updated.id);
      }

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
        barcode: body.barcode || null,
      };

      const { data: updated, error: updateError } = await updateAttendeeSafely(attendeeId, updatePayload);
      if (updateError || !updated) throw new Error(updateError?.message || 'فشل تحديث العميل');

      const newBarcode = await syncSeatStatus(updated.id, updated.governorate, updated.seat_class, updated.seat_number, updated.barcode);
      if (newBarcode && newBarcode !== updated.barcode) {
         await supabase.from('attendees').update({ barcode: newBarcode }).eq('id', updated.id);
      }

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
        supabase.from('attendees').select('*').eq('id', id),
        currentUser
      );
      const { data: oldRecordRaw } = await scopedRecord.single();
      const oldRecord = normalizeAttendeePricing(oldRecordRaw);
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
        
        // If the attendee no longer has a seat, they shouldn't have a barcode
        const finalBarcode = resolvedSeat === null ? null : (body.barcode || oldRecord.barcode || null);

        bodyToSave = {
          ...body,
          warnings: oldRecordRaw?.warnings ?? body.warnings,
          full_name_en: nextFullNameEn,
          base_ticket_price: baseTicketPrice,
          certificate_included: certificateIncluded,
          remaining_amount: remainingAmount,
          seat_number: resolvedSeat,
          barcode: finalBarcode
        };
      }
    }

    const result = table === 'attendees'
      ? await updateAttendeeSafely(String(id), { ...bodyToSave, company_id: getCompanyIdForCreatedRecords(currentUser) })
      : await supabase.from(table).update(bodyToSave).eq('id', id).select().single();
    const { data, error } = result as any;
    if (error) throw new Error(error.message);

    if (table === 'attendees' && data) {
        // Only run syncSeatStatus if we are actually assigning or modifying a seat
        if (body.seat_number !== undefined || body.barcode !== undefined) {
            const newBarcode = await syncSeatStatus(data.id, data.governorate, data.seat_class, data.seat_number, data.barcode);
            if (newBarcode && newBarcode !== data.barcode) {
               await updateAttendeeSafely(String(data.id), { barcode: newBarcode });
               data.barcode = newBarcode;
            }
        }
    }

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
      const payload: any = documentType === 'ticket'
        ? { ticket_printed: true, ticket_printed_at: now }
        : { certificate_printed: true, certificate_printed_at: now };
         
      // Fetch the old record first to preserve metadata in warnings array
      const { data: oldRecordRaw } = await supabase.from('attendees').select('*').eq('id', id).single();
      if (oldRecordRaw) {
          payload.warnings = oldRecordRaw.warnings;
      }
         
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
