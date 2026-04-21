import { supabase } from './supabase';
import { areSeatsConsecutive, findConsecutiveBlock, isAdjacentSeat, sortSeatsForPlacement } from './seatingAdjacency';

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
  'full_name_en',
  'job_title',
  'profile_photo_url',
  'seat_number',
  'seat_class',
  'barcode',
  'governorate',
  'status',
  'occupation_type',
  'organization_name',
  'ticket_price_override',
  'base_ticket_price',
  'certificate_included',
  'preferred_neighbor_name',
  'preferred_neighbor_ids',
  'sales_channel',
  'sales_source_name',
  'commission_amount',
  'commission_notes',
  'company_id',
  'notes',
  'ticket_overrides',
  'seat_change_pending',
  'seat_change_last_at',
  'last_seat_code',
  'seat_change_history'
] as const;

const getMissingAttendeeColumn = (error: any) => {
  const errorMsg = String(error?.message || '');
  const match = errorMsg.match(SCHEMA_COLUMN_ERROR);
  if (!match) return null;
  return match[2] || match[4] || match[6] || match[8] || null;
};

const runAttendeesSelectWithSchemaFallback = async (
  buildQuery: (selectClause: string) => any,
  desiredColumns: string[]
) => {
  let columns = [...desiredColumns];
  let attempts = 0;

  while (columns.length > 0 && attempts <= desiredColumns.length) {
    const { data, error } = await buildQuery(columns.join(','));
    const missingColumn = getMissingAttendeeColumn(error);
    if (error && missingColumn && columns.includes(missingColumn)) {
      columns = columns.filter((column) => column !== missingColumn);
      attempts += 1;
      continue;
    }
    return { data, error, columns };
  }

  return { data: [], error: null, columns: [] as string[] };
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
    
    // Auto-heal logic removed to prevent loops/silent failures. Validation is handled by UI.
    
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
    
    // Auto-heal logic removed to prevent loops/silent failures. Validation is handled by UI.

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
  if (override !== undefined && override !== null && !Number.isNaN(Number(override)) && Number(override) >= 0) {
    return Number(override);
  }
  return SEAT_PRICES[seatClass] || 0;
};

const getBaseTicketPrice = (payload: any) => {
  const hasOverride = payload?.ticket_price_override !== undefined
    && payload?.ticket_price_override !== null
    && payload?.ticket_price_override !== ''
    && !Number.isNaN(Number(payload.ticket_price_override));
  if (hasOverride) {
    return Number(payload.ticket_price_override);
  }
  if (payload?.base_ticket_price !== undefined && payload?.base_ticket_price !== null && Number(payload.base_ticket_price) > 0) {
    return Number(payload.base_ticket_price);
  }
  return SEAT_PRICES[payload?.seat_class] || 0;
};

const getCertificateIncluded = (payload: any) => {
  const hasCustomPrice = payload?.ticket_price_override !== undefined
    && payload?.ticket_price_override !== null
    && payload?.ticket_price_override !== ''
    && !Number.isNaN(Number(payload.ticket_price_override));
  if (!hasCustomPrice) return true;
  if (payload?.certificate_included === undefined || payload?.certificate_included === null) return false;
  return Boolean(payload.certificate_included);
};

const markSeatChanged = async (
  attendeeId: string,
  oldSeatCode: string | null | undefined,
  newSeatCode: string | null | undefined,
  reason: string
) => {
  const fromCode = String(oldSeatCode || '').trim();
  const toCode = String(newSeatCode || '').trim();
  if (!attendeeId || !fromCode || !toCode || fromCode === toCode) return;

  const { data: attendee } = await supabase.from('attendees').select('*').eq('id', attendeeId).single();
  if (!attendee) return;
  const hydrated = normalizeAttendeePricing(attendee);
  const now = new Date().toISOString();
  const currentHistory = Array.isArray(hydrated?.seat_change_history) ? hydrated.seat_change_history : [];
  const nextHistory = [
    ...currentHistory.slice(-49),
    { at: now, from: fromCode, to: toCode, reason: reason || 'seat_update' }
  ];
  await updateAttendeeSafely(String(attendeeId), {
    seat_change_pending: true,
    seat_change_last_at: now,
    last_seat_code: toCode,
    seat_change_history: nextHistory
  });
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
  const hasOverride = hydrated.ticket_price_override !== undefined
    && hydrated.ticket_price_override !== null
    && hydrated.ticket_price_override !== ''
    && !Number.isNaN(Number(hydrated.ticket_price_override));
  const override = hasOverride ? Number(hydrated.ticket_price_override) : 0;
  const existingBase = Number(hydrated.base_ticket_price || 0);
  const payment = Number(hydrated.payment_amount || 0);

  let base = hasOverride ? override : (existingBase > 0 ? existingBase : classDefault);
  if (base === classDefault && (!existingBase && !hasOverride) && hydrated.payment_type === 'full' && payment > 0 && payment < classDefault) {
    base = payment;
  }

  const remaining = Math.max(0, base - payment);
  const hasCustom = hasOverride || (base >= 0 && base !== classDefault);
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
  const reverseByTarget = new Map<string, Set<string>>();

  for (const attendee of attendees) {
    const ids = Array.isArray(attendee?.preferred_neighbor_ids) ? attendee.preferred_neighbor_ids : [];
    for (const targetId of ids) {
      if (!targetId) continue;
      const key = String(targetId);
      const bucket = reverseByTarget.get(key) || new Set<string>();
      bucket.add(String(attendee.id));
      reverseByTarget.set(key, bucket);
    }
  }

  return attendees.map((attendee: any) => {
    const forwardIds = Array.isArray(attendee.preferred_neighbor_ids) ? attendee.preferred_neighbor_ids : [];
    const reverseIds = Array.from(reverseByTarget.get(String(attendee.id)) || []).filter((id) => id !== String(attendee.id));
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
    || msg.includes(`column attendees.${col} does not exist`)
    || msg.includes(`'${col}' column`)
    || msg.includes(`"${col}"`);
};
const isBarcodeUniqueViolation = (error: any) => {
  const msg = String(error?.message || '').toLowerCase();
  const code = String((error as any)?.code || '').toLowerCase();
  return code === '23505' || msg.includes('attendees_barcode_key') || (msg.includes('duplicate key') && msg.includes('barcode'));
};

const applyCompanyScopeToAttendeesQuery = (query: any, currentUser: any) => {
  if (!currentUser) return query;
  if (isCompanyScopedRole(currentUser.role)) {
    return query.eq('company_id', currentUser.company_id || '__none__');
  }
  return query;
};

const applyActiveAttendeesFilter = (query: any) => query.not('is_deleted', 'is', true);
const sortByCreatedAtDesc = <T extends { created_at?: string | null }>(rows: T[]) =>
  [...(rows || [])].sort((a, b) => {
    const ta = new Date(String(a?.created_at || 0)).getTime();
    const tb = new Date(String(b?.created_at || 0)).getTime();
    return tb - ta;
  });

const getCompanyIdForCreatedRecords = (currentUser: any) => {
  if (!currentUser) return null;
  if (isCompanyScopedRole(currentUser.role)) return currentUser.company_id || null;
  return null;
};

const SEAT_AVAILABLE_STATUSES = new Set(['available', 'vip']);

const getAdjacentConflictReport = (attendees: any[], seats: any[]) => {
  const byAttendeeId = new Map((attendees || []).map((a) => [String(a.id), normalizeAttendeePricing(a)]));
  const seatByAttendeeId = new Map<string, any>();
  for (const seat of seats || []) {
    if (!seat?.attendee_id) continue;
    seatByAttendeeId.set(String(seat.attendee_id), seat);
  }

  const seen = new Set<string>();
  const issues: Array<{
    key: string;
    attendee_ids: string[];
    attendee_names: string[];
    seat_codes: string[];
    seat_class: string;
    reason: string;
  }> = [];

  for (const attendee of attendees || []) {
    const sourceId = String(attendee?.id || '');
    if (!sourceId) continue;
    const sourceSeat = seatByAttendeeId.get(sourceId);
    if (!sourceSeat) continue;

    const neighbors = Array.isArray(attendee?.preferred_neighbor_ids) ? attendee.preferred_neighbor_ids : [];
    for (const rawNeighborId of neighbors) {
      const neighborId = String(rawNeighborId || '');
      if (!neighborId || neighborId === sourceId) continue;
      const pairKey = [sourceId, neighborId].sort().join('|');
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      const neighbor = byAttendeeId.get(neighborId);
      const neighborSeat = seatByAttendeeId.get(neighborId);
      if (!neighbor || !neighborSeat) continue;
      if (!isAdjacentSeat(sourceSeat, neighborSeat)) {
        issues.push({
          key: pairKey,
          attendee_ids: [sourceId, neighborId],
          attendee_names: [String(attendee?.full_name || sourceId), String(neighbor?.full_name || neighborId)],
          seat_codes: [String(sourceSeat?.seat_code || '-'), String(neighborSeat?.seat_code || '-')],
          seat_class: String(sourceSeat?.seat_class || attendee?.seat_class || ''),
          reason: 'preferred_neighbor_not_adjacent'
        });
      }
    }
  }

  return issues;
};

const applySeatAssignment = async (
  eventId: string,
  attendeeId: string,
  seat: any,
  reason: string
) => {
  const attendeeRes = await supabase.from('attendees').select('*').eq('id', attendeeId).single();
  const attendee = attendeeRes.data;
  if (!attendee) throw new Error('تعذر تحميل بيانات المشترك أثناء إعادة التسكين');
  const previousCode = String(attendee?.barcode || '').trim();

  await supabase
    .from('seats')
    .update({ status: 'available', attendee_id: null, reserved_by: null, reserved_until: null })
    .eq('event_id', eventId)
    .eq('attendee_id', attendeeId)
    .neq('id', seat.id);

  const claimRes = await supabase
    .from('seats')
    .update({ status: 'booked', attendee_id: attendeeId, reserved_by: null, reserved_until: null })
    .eq('event_id', eventId)
    .eq('id', seat.id)
    .select('*')
    .single();
  if (claimRes.error || !claimRes.data) throw new Error(claimRes.error?.message || 'فشل حجز المقعد المستهدف');

  const updateRes = await updateAttendeeSafely(String(attendeeId), {
    seat_number: Number(claimRes.data.seat_number),
    seat_class: claimRes.data.seat_class,
    barcode: claimRes.data.seat_code
  });
  if (updateRes.error) throw new Error(updateRes.error.message);

  await markSeatChanged(String(attendeeId), previousCode, claimRes.data.seat_code, reason);
  return claimRes.data;
};

const solveAdjacencyForGroup = async (
  eventId: string,
  attendees: any[],
  seats: any[],
  groupAttendeeIds: string[]
) => {
  const targetIds = [...new Set((groupAttendeeIds || []).map((id) => String(id || '')).filter(Boolean))];
  if (targetIds.length < 2) {
    throw new Error('يلزم اختيار شخصين على الأقل لتطبيق المنطق');
  }

  const byAttendeeId = new Map((attendees || []).map((a) => [String(a.id), normalizeAttendeePricing(a)]));
  const seatByAttendeeId = new Map<string, any>();
  const seatById = new Map<string, any>();
  for (const seat of seats || []) {
    seatById.set(String(seat.id), seat);
    if (seat?.attendee_id) seatByAttendeeId.set(String(seat.attendee_id), seat);
  }

  const targetSeats = targetIds.map((id) => seatByAttendeeId.get(id)).filter(Boolean);
  if (targetSeats.length !== targetIds.length) {
    throw new Error('لا يمكن الحل الآن لأن بعض الأفراد غير مسكنين');
  }
  const seatClass = String(targetSeats[0]?.seat_class || '');
  if (!seatClass || targetSeats.some((s) => String(s?.seat_class || '') !== seatClass)) {
    throw new Error('لا يمكن تجميع أشخاص من فئات مقاعد مختلفة');
  }

  const sameClassSeats = sortSeatsForPlacement((seats || []).filter((s) => String(s?.seat_class || '') === seatClass));
  const freeSeats = sameClassSeats.filter((s) => !s?.attendee_id && SEAT_AVAILABLE_STATUSES.has(String(s?.status || '').toLowerCase()));
  let targetBlock = findConsecutiveBlock(freeSeats, targetIds.length);

  if (!targetBlock) {
    const freeSeatIds = new Set(freeSeats.map((s) => String(s.id)));
    for (const idx in sameClassSeats) {
      const start = Number(idx);
      if (start + targetIds.length > sameClassSeats.length) break;
      const block = sameClassSeats.slice(start, start + targetIds.length);
      if (!areSeatsConsecutive(block)) continue;
      const occupiedInBlock = block.filter((s) => s.attendee_id && !targetIds.includes(String(s.attendee_id)));
      const outsideFreeSeats = freeSeats.filter((s) => !block.some((b) => String(b.id) === String(s.id)));
      if (occupiedInBlock.length > outsideFreeSeats.length) continue;

      for (let i = 0; i < occupiedInBlock.length; i += 1) {
        const fromSeat = occupiedInBlock[i];
        const moveToSeat = outsideFreeSeats[i];
        if (!fromSeat?.attendee_id || !moveToSeat) continue;
        await applySeatAssignment(eventId, String(fromSeat.attendee_id), moveToSeat, 'logic_reseat_evict');
        freeSeatIds.delete(String(moveToSeat.id));
        freeSeatIds.add(String(fromSeat.id));
      }
      targetBlock = block;
      break;
    }
  }

  if (!targetBlock || targetBlock.length < targetIds.length) {
    throw new Error('لا توجد كتلة متجاورة متاحة حتى بعد المحاولات الذكية');
  }

  // Ensure block seats are ordered and target attendees are stably ordered by created_at.
  const sortedBlock = sortSeatsForPlacement(targetBlock);
  const sortedTargets = [...targetIds].sort((a, b) => {
    const da = new Date(String(byAttendeeId.get(a)?.created_at || 0)).getTime();
    const db = new Date(String(byAttendeeId.get(b)?.created_at || 0)).getTime();
    return da - db;
  });

  for (let i = 0; i < sortedTargets.length; i += 1) {
    const attendeeId = sortedTargets[i];
    const seat = sortedBlock[i];
    if (!attendeeId || !seat) continue;
    await applySeatAssignment(eventId, attendeeId, seat, 'logic_reseat_target');
  }

  return {
    success: true,
    assigned: sortedTargets.length,
    seat_class: seatClass,
    seat_codes: sortedBlock.map((s) => s.seat_code),
    attendee_ids: sortedTargets
  };
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
    // If we're deliberately unassigning the user (seatCode is null and seatNumber is null)
    if (seatCode === null && seatNumber === null) {
      await supabase
        .from('seats')
        .update({ status: 'available', attendee_id: null, reserved_by: null, reserved_until: null })
        .eq('attendee_id', attendeeId);
      return null;
    }
    
    // If no target seat but we have a current assignment, keep it ONLY if they didn't explicitly request no seat
    if (currentAssignment && seatNumber !== null && seatCode !== null) return currentAssignment.seat_code;
    
    return null;
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
  const eventId = `${normalizeGovernorate(gov).toUpperCase()}-2026-MAIN`;

  const requestedSeat = payload.seat_number ? Number(payload.seat_number) : null;
  if (requestedSeat && (requestedSeat < 1 || requestedSeat > capacity)) {
    throw new Error(`رقم المقعد يجب أن يكون بين 1 و ${capacity} لفئة ${payload.seat_class} في ${gov}`);
  }

  try {
    if (requestedSeat) {
      const { data: seatRow, error: seatError } = await supabase
        .from('seats')
        .select('id, seat_number, status, attendee_id')
        .eq('event_id', eventId)
        .eq('seat_class', payload.seat_class)
        .eq('seat_number', requestedSeat)
        .maybeSingle();
      if (seatError) throw seatError;
      if (!seatRow) return requestedSeat;
      const unavailable = !SEAT_AVAILABLE_STATUSES.has(String(seatRow.status || '').toLowerCase()) || Boolean(seatRow.attendee_id);
      if (unavailable) throw new Error(`المقعد رقم ${requestedSeat} محجوز بالفعل`);
      return requestedSeat;
    }

    const { data: seatsData, error: seatsError } = await supabase
      .from('seats')
      .select('seat_number, status, attendee_id')
      .eq('event_id', eventId)
      .eq('seat_class', payload.seat_class)
      .in('status', Array.from(SEAT_AVAILABLE_STATUSES))
      .order('seat_number', { ascending: true })
      .limit(Math.max(capacity, 100));
    if (seatsError) throw seatsError;

    const candidates = (seatsData || [])
      .filter((row: any) => Number.isInteger(Number(row?.seat_number)) && Number(row.seat_number) > 0)
      .filter((row: any) => !row?.attendee_id)
      .map((row: any) => Number(row.seat_number));

    if (candidates.length === 0) {
      throw new Error(`اكتمل عدد المقاعد لفئة ${payload.seat_class} في يوم ${gov}`);
    }
    return candidates[Math.floor(Math.random() * candidates.length)];
  } catch (error: any) {
    const msg = String(error?.message || '').toLowerCase();
    // Keep registration available even under temporary DB pressure/timeouts.
    if (msg.includes('statement timeout') || msg.includes('canceling statement')) {
      return requestedSeat ?? null;
    }
    throw error;
  }
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
const LAYOUT_DRAFTS_KEY = 'seating_layout_drafts_v1';

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

const readLayoutDraftsStore = () => {
  try {
    return JSON.parse(localStorage.getItem(LAYOUT_DRAFTS_KEY) || '{}');
  } catch {
    return {};
  }
};

const writeLayoutDraftsStore = (value: any) => {
  localStorage.setItem(LAYOUT_DRAFTS_KEY, JSON.stringify(value || {}));
};

const getLayoutDraftStoreKey = (eventId: string, governorate: string) => `${eventId}::${governorate}`;

const normalizeDraftPayload = (draft: any) => {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return {};
  try {
    return JSON.parse(JSON.stringify(draft));
  } catch {
    return {};
  }
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

    if (endpoint.startsWith('/seating/available-seats')) {
      const query = endpoint.split('?')[1] || '';
      const params = new URLSearchParams(query);
      const eventId = params.get('eventId') || DEFAULT_EVENT_ID;
      const seatClass = params.get('seat_class');
      const rawLimit = Number(params.get('limit') || 800);
      const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 5000) : 800;

      let q = supabase
        .from('seats')
        .select('id, seat_number, seat_code, seat_class, status')
        .eq('event_id', eventId)
        .in('status', ['available', 'vip'])
        .order('seat_number', { ascending: true })
        .limit(limit);

      if (seatClass) q = q.eq('seat_class', seatClass);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return Array.isArray(data) ? data : [];
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
      
      // Search by fuzzy governorate tokens to catch case/style differences in stored data.
      const govTokens = [hallGovernorate];
      if (hallGovernorate === 'Minya') govTokens.push('minya', 'المنيا', 'منيا');
      if (hallGovernorate === 'Asyut') govTokens.push('asyut', 'assiut', 'أسيوط', 'اسيوط');
      if (hallGovernorate === 'Sohag') govTokens.push('sohag', 'سوهاج');
      if (hallGovernorate === 'Qena') govTokens.push('qena', 'قنا');
      const govOrFilter = govTokens
        .filter(Boolean)
        .map((token) => `governorate.ilike.%${String(token).replace(/,/g, '')}%`)
        .join(',');

      let attendeesQuery = supabase
        .from('attendees')
        .select('*')
        .in('status', ['registered', 'interested']) // Show both for seating just in case
        .order('created_at', { ascending: true });
      attendeesQuery = applyActiveAttendeesFilter(attendeesQuery);
      if (govOrFilter) attendeesQuery = attendeesQuery.or(govOrFilter);
      if (seatClass) attendeesQuery = attendeesQuery.eq('seat_class', seatClass);
      const { data, error } = await attendeesQuery;
      if (error) throw new Error(error.message);
      return enrichAttendeesNeighborLabels(data || []);
    }

    if (endpoint.startsWith('/seating/logic/report')) {
      const query = endpoint.split('?')[1] || '';
      const params = new URLSearchParams(query);
      const eventId = params.get('eventId') || DEFAULT_EVENT_ID;
      const hallGovernorate = getGovernorateFromEventId(eventId);

      const [seatsRes, attendeesRes] = await Promise.all([
        supabase
          .from('seats')
          .select('id, seat_number, seat_class, seat_code, row_number, table_id, attendee_id, status')
          .eq('event_id', eventId)
          .order('row_number', { ascending: true }),
        applyCompanyScopeToAttendeesQuery(
          supabase
            .from('attendees')
            .select('*')
            .eq('governorate', hallGovernorate)
            .in('status', ['registered', 'interested']),
          currentUser
        )
      ]);
      if (seatsRes.error) throw new Error(seatsRes.error.message);
      if (attendeesRes.error) throw new Error(attendeesRes.error.message);

      const attendees = enrichAttendeesNeighborLabels(attendeesRes.data || []);
      const issues = getAdjacentConflictReport(attendees, seatsRes.data || []);
      return {
        success: true,
        event_id: eventId,
        governorate: hallGovernorate,
        issues,
        count: issues.length,
        updated_at: new Date().toISOString()
      };
    }

    if (endpoint.startsWith('/seating/layout-versions')) {
      const query = endpoint.split('?')[1] || '';
      const params = new URLSearchParams(query);
      const eventId = params.get('eventId') || DEFAULT_EVENT_ID;
      const store = readLayoutVersionsStore();
      const versions = Array.isArray(store[eventId]) ? store[eventId] : [];
      return versions.map((v: any) => ({ id: v.id, name: v.name, created_at: v.created_at }));
    }

    if (endpoint.startsWith('/seating/layout-draft')) {
      const query = endpoint.split('?')[1] || '';
      const params = new URLSearchParams(query);
      const eventId = params.get('eventId') || DEFAULT_EVENT_ID;
      const governorate = normalizeGovernorate(params.get('governorate') || getGovernorateFromEventId(eventId));
      const localStore = readLayoutDraftsStore();
      const localKey = getLayoutDraftStoreKey(eventId, governorate);
      const localDraft = localStore?.[localKey];

      const fallbackResult = {
        event_id: eventId,
        governorate,
        draft: normalizeDraftPayload(localDraft?.draft || {}),
        has_draft: Boolean(localDraft && Object.keys(localDraft?.draft || {}).length > 0),
        updated_at: localDraft?.updated_at || null,
        source: 'local'
      };

      const { data, error } = await supabase
        .from('seating_layout_drafts')
        .select('event_id, governorate, draft, updated_at')
        .eq('event_id', eventId)
        .eq('governorate', governorate)
        .maybeSingle();

      if (error) {
        if (isMissingColumnError(error, 'governorate')) {
          const legacy = await supabase
            .from('seating_layout_drafts')
            .select('event_id, draft, updated_at')
            .eq('event_id', eventId)
            .maybeSingle();
          if (legacy.error && !isMissingTable(legacy.error)) throw new Error(legacy.error.message);
          const legacyDraft = normalizeDraftPayload(legacy.data?.draft || {});
          if (Object.keys(legacyDraft).length === 0) return fallbackResult;
          localStore[localKey] = {
            event_id: eventId,
            governorate,
            draft: legacyDraft,
            updated_at: legacy.data?.updated_at || new Date().toISOString(),
            source: 'remote_legacy'
          };
          writeLayoutDraftsStore(localStore);
          return {
            event_id: eventId,
            governorate,
            draft: legacyDraft,
            has_draft: true,
            updated_at: legacy.data?.updated_at || null,
            source: 'remote_legacy'
          };
        }
        if (!isMissingTable(error)) throw new Error(error.message);
        return fallbackResult;
      }

      const remoteDraft = normalizeDraftPayload(data?.draft || {});
      const hasRemoteDraft = Object.keys(remoteDraft).length > 0;
      if (!data || !hasRemoteDraft) {
        return fallbackResult;
      }

      localStore[localKey] = {
        event_id: eventId,
        governorate,
        draft: remoteDraft,
        updated_at: data?.updated_at || new Date().toISOString(),
        source: 'remote'
      };
      writeLayoutDraftsStore(localStore);

      return {
        event_id: eventId,
        governorate,
        draft: remoteDraft,
        has_draft: true,
        updated_at: data?.updated_at || null,
        source: 'remote'
      };
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
        applyActiveAttendeesFilter(supabase.from('attendees').select('*').eq('lead_status', 'under_review')),
        currentUser
      ).order('created_at', { ascending: false });
      const completedMineQuery = applyCompanyScopeToAttendeesQuery(
        applyActiveAttendeesFilter(supabase.from('attendees').select('*').eq('lead_status', 'sales_completed').eq('sales_user_id', userId)),
        currentUser
      ).order('sales_verified_at', { ascending: false });
      let [{ data: underReview, error: underReviewError }, { data: completedMine, error: completedMineError }] = await Promise.all([underReviewQuery, completedMineQuery]);
      if ((underReviewError && isMissingColumnError(underReviewError, 'company_id')) || (completedMineError && isMissingColumnError(completedMineError, 'company_id'))) {
        const [legacyUnder, legacyCompleted] = await Promise.all([
          supabase
            .from('attendees')
            .select('*')
            .eq('lead_status', 'under_review')
            .or('is_deleted.eq.false,is_deleted.is.null')
            .order('created_at', { ascending: false }),
          supabase
            .from('attendees')
            .select('*')
            .eq('lead_status', 'sales_completed')
            .eq('sales_user_id', userId)
            .or('is_deleted.eq.false,is_deleted.is.null')
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
      const query = endpoint.split('?')[1] || '';
      const params = new URLSearchParams(query);
      const showTrash = endpoint.includes('trash=true');
      const liteMode = params.get('lite') === '1';
      const barcodeMatch = endpoint.match(/barcode=eq\.([^&]+)/);
      const idMatch = endpoint.match(/\/attendees\/([^\/?]+)/);
      const limitParam = Number(params.get('limit') || 0);
      const offsetParam = Number(params.get('offset') || 0);
      const hasLimit = Number.isFinite(limitParam) && limitParam > 0;
      const hasOffset = Number.isFinite(offsetParam) && offsetParam >= 0;

      if (endpoint.startsWith('/attendees/check-duplicates')) {
        const fullNameRaw = String(params.get('full_name') || '').trim();
        const phoneRaw = String(params.get('phone_primary') || '').trim();
        const fullName = fullNameRaw.replace(/,/g, '');
        const phone = phoneRaw.replace(/,/g, '');

        const duplicateResult = {
          duplicate_name: false,
          duplicate_phone: false,
          name_owner: null as any,
          phone_owner: null as any
        };

        if (fullName) {
          const buildNameQuery = (selectClause: string) => {
            let q = applyCompanyScopeToAttendeesQuery(supabase.from('attendees').select(selectClause), currentUser);
            q = applyActiveAttendeesFilter(q).ilike('full_name', fullName).limit(1);
            return q;
          };
          const nameRes = await runAttendeesSelectWithSchemaFallback(buildNameQuery, ['id', 'full_name', 'phone_primary', 'is_deleted']);
          if (nameRes.error && isMissingColumnError(nameRes.error, 'company_id')) {
            const legacy = await runAttendeesSelectWithSchemaFallback(
              (selectClause) => applyActiveAttendeesFilter(supabase.from('attendees').select(selectClause)).ilike('full_name', fullName).limit(1),
              ['id', 'full_name', 'phone_primary', 'is_deleted']
            );
            if (legacy.error) throw new Error(legacy.error.message);
            duplicateResult.name_owner = Array.isArray(legacy.data) && legacy.data.length > 0 ? legacy.data[0] : null;
          } else {
            if (nameRes.error) throw new Error(nameRes.error.message);
            duplicateResult.name_owner = Array.isArray(nameRes.data) && nameRes.data.length > 0 ? nameRes.data[0] : null;
          }
          duplicateResult.duplicate_name = Boolean(duplicateResult.name_owner);
        }

        if (phone) {
          const buildPhoneQuery = (selectClause: string) => {
            let q = applyCompanyScopeToAttendeesQuery(supabase.from('attendees').select(selectClause), currentUser);
            q = applyActiveAttendeesFilter(q).eq('phone_primary', phone).limit(1);
            return q;
          };
          const phoneRes = await runAttendeesSelectWithSchemaFallback(buildPhoneQuery, ['id', 'full_name', 'phone_primary', 'is_deleted']);
          if (phoneRes.error && isMissingColumnError(phoneRes.error, 'company_id')) {
            const legacy = await runAttendeesSelectWithSchemaFallback(
              (selectClause) => applyActiveAttendeesFilter(supabase.from('attendees').select(selectClause)).eq('phone_primary', phone).limit(1),
              ['id', 'full_name', 'phone_primary', 'is_deleted']
            );
            if (legacy.error) throw new Error(legacy.error.message);
            duplicateResult.phone_owner = Array.isArray(legacy.data) && legacy.data.length > 0 ? legacy.data[0] : null;
          } else {
            if (phoneRes.error) throw new Error(phoneRes.error.message);
            duplicateResult.phone_owner = Array.isArray(phoneRes.data) && phoneRes.data.length > 0 ? phoneRes.data[0] : null;
          }
          duplicateResult.duplicate_phone = Boolean(duplicateResult.phone_owner);
        }

        return duplicateResult;
      }
      
      const attendeeListColumns = [
        'id',
        'full_name',
        'full_name_en',
        'phone_primary',
        'phone_secondary',
        'email_primary',
        'email_secondary',
        'facebook_link',
        'governorate',
        'seat_class',
        'seat_number',
        'ticket_price_override',
        'base_ticket_price',
        'certificate_included',
        'payment_type',
        'payment_amount',
        'remaining_amount',
        'commission_amount',
        'commission_notes',
        'status',
        'qr_code',
        'barcode',
        'attendance_status',
        'checked_in_at',
        'checked_in_by',
        'created_by',
        'company_id',
        'sales_channel',
        'sales_source_name',
        'created_at',
        'updated_at',
        'is_deleted',
        'university',
        'faculty',
        'year',
        'notes',
        'profile_photo_url',
        'preferred_neighbor_name',
        'preferred_neighbor_ids',
        'warnings'
      ];
      const attendeeLiteColumns = [
        'id',
        'full_name',
        'governorate',
        'seat_class',
        'seat_number',
        'status',
        'is_deleted',
        'phone_primary',
        'barcode',
        'payment_type',
        'payment_amount',
        'ticket_price_override',
        'base_ticket_price',
        'certificate_included',
        'profile_photo_url',
        'preferred_neighbor_name',
        'preferred_neighbor_ids',
        'warnings',
        'created_at',
        'updated_at'
      ];
      const selectedColumns = liteMode ? attendeeLiteColumns : attendeeListColumns;

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
          applyActiveAttendeesFilter(supabase.from('attendees').select('id, full_name, is_deleted')),
          currentUser
        );
        const { data: relatedAttendees } = await related;
        return enrichAttendeesNeighborLabels([normalized, ...(relatedAttendees || []).filter((item: any) => item.id !== normalized.id)])[0];
      }

      let scoped = applyCompanyScopeToAttendeesQuery(
        supabase.from('attendees').select(attendeeListColumns.join(',')),
        currentUser
      );
      scoped = showTrash ? scoped.eq('is_deleted', true) : applyActiveAttendeesFilter(scoped);

      const governorate = params.get('governorate');
      const seatClass = params.get('seat_class');
      const status = params.get('status');
      const paymentType = params.get('payment_type');
      const attendance = params.get('attendance');
      const q = params.get('q');
      const safeSearch = q ? String(q).replace(/,/g, '').trim() : '';

      if (governorate) scoped = scoped.eq('governorate', governorate);
      if (seatClass) scoped = scoped.eq('seat_class', seatClass);
      if (status) scoped = scoped.eq('status', status);
      if (paymentType) {
        if (paymentType === 'zero_deposit') {
          scoped = scoped.eq('payment_type', 'deposit').eq('payment_amount', 0);
        } else {
          scoped = scoped.eq('payment_type', paymentType);
        }
      }
      if (attendance === 'present') scoped = scoped.eq('attendance_status', true);
      if (attendance === 'absent') scoped = scoped.eq('attendance_status', false);
      if (q) {
        const safe = String(q).replace(/,/g, '').trim();
        if (safe) {
          scoped = scoped.or(`full_name.ilike.%${safe}%,phone_primary.ilike.%${safe}%,email_primary.ilike.%${safe}%`);
        }
      }

      if (barcodeMatch) {
         scoped = scoped.eq('barcode', barcodeMatch[1]);
      }
      const buildScopedQuery = (selectClause: string) => {
        let q = applyCompanyScopeToAttendeesQuery(
          supabase.from('attendees').select(selectClause),
          currentUser
        );
        q = showTrash ? q.eq('is_deleted', true) : applyActiveAttendeesFilter(q);
        if (governorate) q = q.eq('governorate', governorate);
        if (seatClass) q = q.eq('seat_class', seatClass);
        if (status) q = q.eq('status', status);
        if (paymentType === 'full' || paymentType === 'deposit') {
          q = q.eq('payment_type', paymentType);
        } else if (paymentType === 'zero_deposit') {
          q = q.eq('payment_type', 'deposit').eq('payment_amount', 0);
        }
        if (attendance === 'present') q = q.eq('attendance_status', true);
        if (attendance === 'absent') q = q.or('attendance_status.is.false,attendance_status.is.null');
        if (safeSearch) q = q.or(`full_name.ilike.%${safeSearch}%,phone_primary.ilike.%${safeSearch}%,phone_secondary.ilike.%${safeSearch}%`);
        if (barcodeMatch) q = q.eq('barcode', barcodeMatch[1]);
        q = q.order('created_at', { ascending: false });
        if (hasOffset && hasLimit) q = q.range(offsetParam, offsetParam + limitParam - 1);
        else if (hasLimit) q = q.limit(limitParam);
        return q;
      };

      const initialResult = await runAttendeesSelectWithSchemaFallback(buildScopedQuery, selectedColumns);
      let { data, error } = initialResult;
      if (error && isMissingColumnError(error, 'company_id')) {
        const fallbackResult = await runAttendeesSelectWithSchemaFallback((selectClause) => {
          let fallbackQuery = supabase.from('attendees').select(selectClause);
          fallbackQuery = showTrash ? fallbackQuery.eq('is_deleted', true) : applyActiveAttendeesFilter(fallbackQuery);
          if (governorate) fallbackQuery = fallbackQuery.eq('governorate', governorate);
          if (seatClass) fallbackQuery = fallbackQuery.eq('seat_class', seatClass);
          if (status) fallbackQuery = fallbackQuery.eq('status', status);
          if (paymentType === 'full' || paymentType === 'deposit') {
            fallbackQuery = fallbackQuery.eq('payment_type', paymentType);
          } else if (paymentType === 'zero_deposit') {
            fallbackQuery = fallbackQuery.eq('payment_type', 'deposit').eq('payment_amount', 0);
          }
          if (attendance === 'present') fallbackQuery = fallbackQuery.eq('attendance_status', true);
          if (attendance === 'absent') fallbackQuery = fallbackQuery.or('attendance_status.is.false,attendance_status.is.null');
          if (safeSearch) fallbackQuery = fallbackQuery.or(`full_name.ilike.%${safeSearch}%,phone_primary.ilike.%${safeSearch}%,phone_secondary.ilike.%${safeSearch}%`);
          if (barcodeMatch) fallbackQuery = fallbackQuery.eq('barcode', barcodeMatch[1]);
          fallbackQuery = fallbackQuery.order('created_at', { ascending: false });
          if (hasOffset && hasLimit) fallbackQuery = fallbackQuery.range(offsetParam, offsetParam + limitParam - 1);
          else if (hasLimit) fallbackQuery = fallbackQuery.limit(limitParam);
          return fallbackQuery;
        }, selectedColumns);
        data = fallbackResult.data;
        error = fallbackResult.error;
      }
      if (error) throw new Error(error.message);
      if (!showTrash && (!data || data.length === 0)) {
        // Safety fallback: if scoped/filtered query returns nothing unexpectedly, try raw active rows.
        const raw = await runAttendeesSelectWithSchemaFallback(
          (selectClause) => supabase
            .from('attendees')
            .select(selectClause)
            .not('is_deleted', 'is', true)
            .order('created_at', { ascending: false })
            .limit(hasLimit ? limitParam : 1000),
          selectedColumns
        );
        if (!raw.error && Array.isArray(raw.data) && raw.data.length > 0) {
          data = raw.data;
        }
      }
      const sorted = Array.isArray(data) ? data : [];
      if (liteMode) return sorted.map(normalizeAttendeePricing);
      return enrichAttendeesNeighborLabels(sorted);
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
      const [{ data: companies }, attendeesResult] = await Promise.all([
        supabase.from('companies').select('id, name').order('name', { ascending: true }),
        runAttendeesSelectWithSchemaFallback(
          (selectClause) => supabase
            .from('attendees')
            .select(selectClause)
            .gte('created_at', sinceIso)
            .not('is_deleted', 'is', true),
          ['id', 'full_name', 'created_at', 'payment_amount', 'company_id', 'created_by']
        )
      ]);
      const attendees = Array.isArray(attendeesResult.data) ? attendeesResult.data : [];
      if (attendeesResult.error && !getMissingAttendeeColumn(attendeesResult.error)) {
        throw new Error(attendeesResult.error.message);
      }
      return (companies || []).map((company: any) => {
        const items = (attendees || []).filter((a: any) => a.company_id && a.company_id === company.id);
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
      const requestedCount = Number(body?.chairs_count);
      const newCount = Number.isFinite(requestedCount) ? Math.max(1, Math.floor(requestedCount)) : 1;
      const orientation: 'horizontal' | 'vertical' = body?.orientation === 'vertical' ? 'vertical' : 'horizontal';
      
      const { data: table } = await supabase.from('seat_tables').select('*').eq('id', tableId).single();
      if (!table) throw new Error('Table not found');
      
      const gov = table.governorate;
      
      // Update seats if count changes
      const { data: existingSeats } = await supabase.from('seats').select('*').eq('table_id', tableId).order('seat_number', { ascending: true });
      const currentCount = existingSeats.length;
      
      // rename & class change
      const nextTableId = `${gov}-${newClass}-T${newName}`;
      const tableOrder = parseInt(newName) || table.table_order;
      
      // Renaming table id directly violates FK (seats.table_id -> seat_tables.id),
      // so when id changes we create target table first, move seats, then delete old table.
      if (nextTableId !== tableId) {
        const { error: insertNewTableError } = await supabase.from('seat_tables').insert([{
          ...table,
          id: nextTableId,
          event_id: eventId,
          seat_class: newClass,
          seats_count: newCount,
          table_order: tableOrder
        }]);
        if (insertNewTableError) throw new Error(insertNewTableError.message);
      } else {
        const { error: updateTableError } = await supabase.from('seat_tables').update({
          seat_class: newClass,
          seats_count: newCount,
          table_order: tableOrder
        }).eq('id', tableId);
        if (updateTableError) throw new Error(updateTableError.message);
      }
      
      const reflowSeatsSymmetric = (seatsList: any[], countForLayout: number) => {
         if (!seatsList.length) return;
         const xs = existingSeats.map(s => Number(s.position_x || 0));
         const ys = existingSeats.map(s => Number(s.position_y || 0));
         const minX = existingSeats.length > 0 ? Math.min(...xs) : 50;
         const maxX = existingSeats.length > 0 ? Math.max(...xs) : 50;
         const minY = existingSeats.length > 0 ? Math.min(...ys) : 50;
         const maxY = existingSeats.length > 0 ? Math.max(...ys) : 50;
         const cx = (minX + maxX) / 2;
         const cy = (minY + maxY) / 2;
         const primaryCount = Math.ceil(countForLayout / 2);
         const secondaryCount = Math.floor(countForLayout / 2);

         for (let i = 0; i < seatsList.length; i++) {
           const s = seatsList[i];
           const inPrimary = i < primaryCount;
           const laneCount = inPrimary ? primaryCount : secondaryCount;
           const lanePos = inPrimary ? i : i - primaryCount;

           if (orientation === 'vertical') {
             const colHeight = (laneCount - 1) * 2.8;
             const colStartY = cy - (colHeight / 2);
             const newY = colStartY + lanePos * 2.8;
             const newX = cx + (inPrimary ? -2.8 : 2.8);
             s.position_x = newX;
             s.position_y = newY;
           } else {
             const rowWidth = (laneCount - 1) * 3.5;
             const rowStartX = cx - (rowWidth / 2);
             const newX = rowStartX + lanePos * 3.5;
             const newY = minY + (inPrimary ? 0 : 5);
             s.position_x = newX;
             s.position_y = newY;
           }
         }
      };

      if (newCount !== currentCount) {
         let finalSeatsList: any[] = [];
         const seatsToInsert: any[] = [];
         const seatsToDelete: any[] = [];
         const seatsToUpdate: any[] = [];

         if (newCount > currentCount) {
             finalSeatsList = [...existingSeats];
             const existingNumbersSet = new Set(existingSeats.map(s => Number(s.seat_number || 0)));
             let num = 1;
             while (finalSeatsList.length < newCount) {
                 while (existingNumbersSet.has(num)) num += 1;
                 const newSeatId = `${nextTableId}-S${num}`;
                 const newSeatCode = buildSeatCode(newClass as any, table.row_number, 'left', tableOrder, num).replace(`T${tableOrder}`, `T${newName}`);
                 const newSeat = {
                   id: newSeatId,
                   event_id: eventId,
                   governorate: gov,
                   seat_class: newClass,
                   row_number: table.row_number,
                   side: 'left',
                   table_id: nextTableId,
                   seat_number: num,
                   seat_code: newSeatCode,
                   status: 'available',
                   isNew: true
                 };
                 finalSeatsList.push(newSeat);
                 seatsToInsert.push(newSeat);
                 existingNumbersSet.add(num);
                 num += 1;
             }
         } else {
             const seatsToRemoveCount = currentCount - newCount;
             const sortedForRemoval = [...existingSeats].sort((a, b) => {
                 const aEmpty = a.status === 'available' ? 0 : 1;
                 const bEmpty = b.status === 'available' ? 0 : 1;
                 if (aEmpty !== bEmpty) return aEmpty - bEmpty;
                 return Number(b.seat_number) - Number(a.seat_number); 
             });
             const toRemove = sortedForRemoval.slice(0, seatsToRemoveCount);
             seatsToDelete.push(...toRemove);
             finalSeatsList = existingSeats.filter(s => !toRemove.find(r => r.id === s.id));
         }

         // Sort final list by seat_number
         finalSeatsList.sort((a, b) => Number(a.seat_number) - Number(b.seat_number));

         reflowSeatsSymmetric(finalSeatsList, newCount);

         for (let i = 0; i < finalSeatsList.length; i++) {
             const s = finalSeatsList[i];
             if (!s.isNew) {
                 const newSeatCode = buildSeatCode(newClass as any, table.row_number, 'left', tableOrder, s.seat_number).replace(`T${tableOrder}`, `T${newName}`);
                 const newSeatId = `${nextTableId}-S${s.seat_number}`;
                 seatsToUpdate.push({
                    oldId: s.id,
                    id: newSeatId,
                    table_id: nextTableId,
                    seat_class: newClass,
                    seat_code: newSeatCode,
                    position_x: Number(s.position_x || 0),
                    position_y: Number(s.position_y || 0)
                 });
             }
         }

         // Execute DB ops
         for (const s of seatsToUpdate) {
             const { error: updateSeatError } = await supabase.from('seats').update({
                id: s.id,
                table_id: s.table_id,
                seat_class: s.seat_class,
                seat_code: s.seat_code,
                position_x: s.position_x,
                position_y: s.position_y
             }).eq('id', s.oldId);
             if (updateSeatError) throw new Error(updateSeatError.message);
         }

         if (nextTableId !== tableId) {
            const { error: deleteOldTableError } = await supabase.from('seat_tables').delete().eq('id', tableId);
            if (deleteOldTableError) throw new Error(deleteOldTableError.message);
         }

         if (seatsToInsert.length > 0) {
             const cleanToInsert = seatsToInsert.map(s => { const { isNew, ...rest } = s; return rest; });
             const { error: insertSeatsError } = await supabase.from('seats').insert(cleanToInsert);
             if (insertSeatsError) throw new Error(insertSeatsError.message);
         }

         for (const s of seatsToDelete) {
             if (s.attendee_id) {
                 await updateAttendeeSafely(String(s.attendee_id), { seat_number: null, barcode: null });
             }
             const { error: deleteSeatError } = await supabase.from('seats').delete().eq('id', s.id);
             if (deleteSeatError) throw new Error(deleteSeatError.message);
         }

      } else {
         // Count didn't change, just update metadata if needed
         const stableSeats = [...existingSeats].sort((a, b) => Number(a.seat_number) - Number(b.seat_number));
         reflowSeatsSymmetric(stableSeats, stableSeats.length);
         for (const s of stableSeats) {
            const newSeatCode = buildSeatCode(newClass as any, table.row_number, 'left', tableOrder, s.seat_number).replace(`T${tableOrder}`, `T${newName}`);
            const newSeatId = `${nextTableId}-S${s.seat_number}`;
            const { error: updateSeatError } = await supabase.from('seats').update({
               id: newSeatId,
               table_id: nextTableId,
               seat_class: newClass,
               seat_code: newSeatCode,
               position_x: Number(s.position_x || 0),
               position_y: Number(s.position_y || 0)
            }).eq('id', s.id);
            if (updateSeatError) throw new Error(updateSeatError.message);
         }

         if (nextTableId !== tableId) {
           const { error: deleteOldTableError } = await supabase.from('seat_tables').delete().eq('id', tableId);
           if (deleteOldTableError) throw new Error(deleteOldTableError.message);
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
        const topCount = Math.ceil(chairsCount / 2);
        const bottomCount = Math.floor(chairsCount / 2);

        for(let i = 1; i <= chairsCount; i++) {
          const isTop = i <= topCount;
          const rowCount = isTop ? topCount : bottomCount;
          const localCol = isTop ? (i - 1) : (i - 1 - topCount);
          
          const rowWidth = (rowCount - 1) * 3.5;
          const rowStartX = offsetX - (rowWidth / 2);
          
          const seatX = rowStartX + localCol * 3.5;
          const seatY = offsetY + (isTop ? -2.5 : 2.5);

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
      const targetGovernorate = normalizeGovernorate(body?.governorate || getGovernorateFromEventId(eventId));
      const useMinyaTemplate = body?.use_minya_template !== false;
      const rowsA = Number(body?.classA?.rows || 3);
      const rowsB = Number(body?.classB?.rows || 3);
      const tablesPerSideA = Number(body?.classA?.tables_per_side || 3);
      const tablesPerSideB = Number(body?.classB?.tables_per_side || 3);
      const seatsPerTableA = Number(body?.classA?.seats_per_table || 12);
      const seatsPerTableB = Number(body?.classB?.seats_per_table || 12);
      const classCRows = Number(body?.classC?.rows || 23);
      const classCSeatsPerSidePerRow = Number(body?.classC?.seats_per_side_per_row || 8);

      let plan = useMinyaTemplate ? generateMinyaCustomPlan(eventId) : generateHallPlan(eventId, targetGovernorate);
      // Allow using Minya template for any governorate while keeping unique IDs and proper governorate values.
      if (useMinyaTemplate) {
        const tableIdMap = new Map<string, string>();
        const remappedTables = (plan.tables || []).map((t: any) => {
          const newId = String(t.id || '').replace(/^Minya-/, `${targetGovernorate}-`);
          tableIdMap.set(t.id, newId);
          return { ...t, id: newId, event_id: eventId, governorate: targetGovernorate };
        });
        const remappedSeats = (plan.seats || []).map((s: any) => ({
          ...s,
          id: String(s.id || '').replace(/^Minya-/, `${targetGovernorate}-`),
          table_id: s.table_id ? (tableIdMap.get(s.table_id) || String(s.table_id).replace(/^Minya-/, `${targetGovernorate}-`)) : null,
          event_id: eventId,
          governorate: targetGovernorate
        }));
        plan = { tables: remappedTables, seats: remappedSeats };
      }

      const { tables, seats } = plan;
      const isMinyaCustom = useMinyaTemplate;
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

      // Prevent PK conflicts when the same layout IDs were used before
      // in other events/governorates (legacy data). We clear by IDs first.
      const seatIdsToReset = adjustedSeats.map((s: any) => s.id).filter(Boolean);
      const tableIdsToReset = adjustedTables.map((t: any) => t.id).filter(Boolean);
      const chunk = <T,>(arr: T[], size: number) => {
        const out: T[][] = [];
        for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
        return out;
      };
      for (const ids of chunk(seatIdsToReset, 200)) {
        await supabase.from('seat_bookings').delete().in('seat_id', ids as any);
        await supabase.from('seats').delete().in('id', ids as any);
      }
      for (const ids of chunk(tableIdsToReset, 200)) {
        await supabase.from('seat_tables').delete().in('id', ids as any);
      }

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
           const nextElementPayload: any = {
             position_x: Number(item.position_x ?? 0),
             position_y: Number(item.position_y ?? 0)
           };
           if (item.width !== undefined) nextElementPayload.width = Number(item.width ?? 8);
           if (item.height !== undefined) nextElementPayload.height = Number(item.height ?? 4);
           if (item.name !== undefined) nextElementPayload.name = item.name ?? null;
           await supabase
             .from('layout_elements')
             .update(nextElementPayload)
             .eq('event_id', eventId)
             .eq('id', item.id);
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

    if (endpoint === '/seating/layout-draft/autosave') {
      const eventId = body?.event_id || DEFAULT_EVENT_ID;
      const governorate = normalizeGovernorate(body?.governorate || getGovernorateFromEventId(eventId));
      const draft = normalizeDraftPayload(body?.draft || {});
      const now = new Date().toISOString();

      const localStore = readLayoutDraftsStore();
      const localKey = getLayoutDraftStoreKey(eventId, governorate);
      localStore[localKey] = {
        event_id: eventId,
        governorate,
        draft,
        updated_at: now,
        source: 'local'
      };
      writeLayoutDraftsStore(localStore);

      if (!navigator.onLine) {
        return {
          success: true,
          event_id: eventId,
          governorate,
          updated_at: now,
          source: 'local_offline'
        };
      }

      const upsertPayload = {
        event_id: eventId,
        governorate,
        draft,
        updated_at: now
      };

      const { data, error } = await supabase
        .from('seating_layout_drafts')
        .upsert(upsertPayload, { onConflict: 'event_id,governorate' })
        .select('event_id, governorate, updated_at')
        .single();

      if (error) {
        const canTryLegacyUpsert = isMissingColumnError(error, 'governorate')
          || String(error?.message || '').toLowerCase().includes('there is no unique or exclusion constraint matching the on conflict specification');
        if (canTryLegacyUpsert) {
          const legacyRes = await supabase
            .from('seating_layout_drafts')
            .upsert({ event_id: eventId, draft, updated_at: now }, { onConflict: 'event_id' })
            .select('event_id, updated_at')
            .single();
          if (!legacyRes.error) {
            localStore[localKey] = {
              ...localStore[localKey],
              updated_at: legacyRes.data?.updated_at || now,
              source: 'remote_legacy'
            };
            writeLayoutDraftsStore(localStore);
            return {
              success: true,
              event_id: eventId,
              governorate,
              updated_at: legacyRes.data?.updated_at || now,
              source: 'remote_legacy'
            };
          }
        }
        if (!isMissingTable(error) && !isMissingColumnError(error, 'governorate')) {
          console.warn('layout-draft autosave remote failed, fallback to local store', error);
        }
        return {
          success: true,
          event_id: eventId,
          governorate,
          updated_at: now,
          source: 'local_fallback'
        };
      }

      localStore[localKey] = {
        ...localStore[localKey],
        updated_at: data?.updated_at || now,
        source: 'remote'
      };
      writeLayoutDraftsStore(localStore);

      return {
        success: true,
        event_id: eventId,
        governorate,
        updated_at: data?.updated_at || now,
        source: 'remote'
      };
    }

    if (endpoint === '/seating/layout-draft/clear') {
      const eventId = body?.event_id || DEFAULT_EVENT_ID;
      const governorate = normalizeGovernorate(body?.governorate || getGovernorateFromEventId(eventId));
      const localStore = readLayoutDraftsStore();
      const localKey = getLayoutDraftStoreKey(eventId, governorate);
      if (localStore?.[localKey]) {
        delete localStore[localKey];
        writeLayoutDraftsStore(localStore);
      }

      const { error } = await supabase
        .from('seating_layout_drafts')
        .delete()
        .eq('event_id', eventId)
        .eq('governorate', governorate);
      if (error) {
        if (isMissingColumnError(error, 'governorate')) {
          const legacyDelete = await supabase
            .from('seating_layout_drafts')
            .delete()
            .eq('event_id', eventId);
          if (legacyDelete.error && !isMissingTable(legacyDelete.error)) {
            throw new Error(legacyDelete.error.message);
          }
        } else if (!isMissingTable(error)) {
          throw new Error(error.message);
        }
      }
      return { success: true, event_id: eventId, governorate };
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

      // Safety guard for unique barcode constraint:
      // clear any stale holder(s) for this barcode before assigning it.
      const { data: staleHolders } = await supabase
        .from('attendees')
        .select('id')
        .eq('barcode', seat.seat_code)
        .neq('id', attendeeId);
      for (const holder of (staleHolders || []) as any[]) {
        await updateAttendeeSafely(String(holder.id), { barcode: null, seat_number: null });
      }

      let updateRes = await updateAttendeeSafely(String(attendeeId), {
        status: 'registered',
        seat_number: Number(seat.seat_number),
        seat_class: seat.seat_class,
        barcode: seat.seat_code
      });
      // Final retry for rare race conditions across multiple devices.
      if (updateRes.error && isBarcodeUniqueViolation(updateRes.error)) {
        const { data: staleAgain } = await supabase
          .from('attendees')
          .select('id')
          .eq('barcode', seat.seat_code)
          .neq('id', attendeeId);
        for (const holder of (staleAgain || []) as any[]) {
          await updateAttendeeSafely(String(holder.id), { barcode: null, seat_number: null });
        }
        updateRes = await updateAttendeeSafely(String(attendeeId), {
          status: 'registered',
          seat_number: Number(seat.seat_number),
          seat_class: seat.seat_class,
          barcode: seat.seat_code
        });
      }
      if (updateRes.error) throw new Error(updateRes.error.message);

      await markSeatChanged(String(attendeeId), attendee?.barcode, seat?.seat_code, 'manual_assign');

      return { success: true };
    }

    if (endpoint === '/seating/unassign-attendee') {
      const eventId = body?.event_id || DEFAULT_EVENT_ID;
      const seatId = body?.seat_id;
      const attendeeId = body?.attendee_id; // Try to use provided attendeeId first
      
      if (!seatId && !attendeeId) throw new Error('seat_id أو attendee_id مطلوب');
      
      let targetAttendeeId = attendeeId;
      
      // If we have a seatId, clear the seat and find the attendee
      if (seatId) {
          const { data: seat } = await supabase.from('seats').select('*').eq('event_id', eventId).eq('id', seatId).single();
          if (seat) {
              if (!targetAttendeeId) targetAttendeeId = seat.attendee_id;
              
              await supabase
                .from('seats')
                .update({ status: 'available', attendee_id: null, reserved_by: null, reserved_until: null })
                .eq('event_id', eventId)
                .eq('id', seatId);
          }
      }
      
      // Also clear any other seats this attendee might have
      if (targetAttendeeId) {
          await supabase
            .from('seats')
            .update({ status: 'available', attendee_id: null, reserved_by: null, reserved_until: null })
            .eq('event_id', eventId)
            .eq('attendee_id', targetAttendeeId);
            
          const updateRes = await updateAttendeeSafely(String(targetAttendeeId), {
            seat_number: null,
            barcode: null
          });
          if (updateRes.error) throw new Error(updateRes.error.message);
      }
        
      return { success: true };
    }

    if (endpoint === '/seating/recover-from-barcodes') {
      const eventId = body?.event_id || DEFAULT_EVENT_ID;

      const { data: seats, error: seatsErr } = await supabase
        .from('seats')
        .select('id, seat_code, seat_number, seat_class, attendee_id, status, governorate')
        .eq('event_id', eventId);
      if (seatsErr) throw new Error(seatsErr.message);

      const selectWithSeatNumber = 'id, full_name, governorate, seat_class, seat_number, barcode, status, is_deleted';
      const selectWithoutSeatNumber = 'id, full_name, governorate, seat_class, barcode, status, is_deleted';
      let supportsSeatNumber = true;
      let attendees: any[] | null = null;

      let scopedAttendees = applyCompanyScopeToAttendeesQuery(
        supabase
          .from('attendees')
          .select(selectWithSeatNumber)
          .eq('is_deleted', false),
        currentUser
      );
      let { data: attendeesData, error: attErr } = await scopedAttendees;

      if (attErr && isMissingColumnError(attErr, 'seat_number')) {
        supportsSeatNumber = false;
        scopedAttendees = applyCompanyScopeToAttendeesQuery(
          supabase
            .from('attendees')
            .select(selectWithoutSeatNumber)
            .eq('is_deleted', false),
          currentUser
        );
        const retry = await scopedAttendees;
        attendeesData = retry.data as any;
        attErr = retry.error as any;
      }

      if (attErr && isMissingColumnError(attErr, 'company_id')) {
        const fallbackPrimary = await supabase
          .from('attendees')
          .select(supportsSeatNumber ? selectWithSeatNumber : selectWithoutSeatNumber)
          .eq('is_deleted', false);
        let fallbackData: any = fallbackPrimary.data as any;
        let fallbackErr: any = fallbackPrimary.error as any;
        if (fallbackErr && supportsSeatNumber && isMissingColumnError(fallbackErr, 'seat_number')) {
          supportsSeatNumber = false;
          const fallbackRetry = await supabase
            .from('attendees')
            .select(selectWithoutSeatNumber)
            .eq('is_deleted', false);
          fallbackData = fallbackRetry.data as any;
          fallbackErr = fallbackRetry.error as any;
        }
        attendees = fallbackData;
        attErr = fallbackErr;
      } else {
        attendees = attendeesData as any;
      }
      if (attErr) throw new Error(attErr.message);

      const seatByCode = new Map<string, any>();
      for (const s of (seats || []) as any[]) {
        if (s.seat_code) seatByCode.set(String(s.seat_code), s);
      }
      const seatsByClassAndNumber = new Map<string, any[]>();
      for (const s of (seats || []) as any[]) {
        const key = `${s.seat_class}#${Number(s.seat_number || 0)}`;
        const arr = seatsByClassAndNumber.get(key) || [];
        arr.push(s);
        seatsByClassAndNumber.set(key, arr);
      }
      const occupiedSeatIds = new Set<string>();
      let restored = 0;
      let skippedNoSeat = 0;
      let skippedConflict = 0;
      let restoredFromSeatNumber = 0;

      const allAttendees = ((attendees || []) as any[]);
      const assignmentBySeatId = new Map<string, any>();
      const barcodeCandidates = allAttendees.filter((a) => !!a.barcode);
      const unresolvedIds = new Set<string>();

      for (const attendee of barcodeCandidates) {
        const seat = seatByCode.get(String(attendee.barcode || ''));
        if (!seat) {
          skippedNoSeat += 1;
          unresolvedIds.add(String(attendee.id));
          continue;
        }
        if (occupiedSeatIds.has(seat.id) || assignmentBySeatId.has(String(seat.id))) {
          skippedConflict += 1;
          unresolvedIds.add(String(attendee.id));
          continue;
        }
        assignmentBySeatId.set(String(seat.id), { attendee, seat, fromSeatNumber: false });
        occupiedSeatIds.add(seat.id);
      }

      // Fallback: when barcode is missing/invalid, try seat_number + seat_class
      // only when the target is unique in this hall to avoid wrong mapping.
      const seatNumberCandidates = supportsSeatNumber ? allAttendees.filter((a) =>
        (unresolvedIds.has(String(a.id)) || !a.barcode) &&
        a.seat_class &&
        Number(a.seat_number || 0) > 0
      ) : [];
      for (const attendee of seatNumberCandidates) {
        if (occupiedSeatIds.size >= (seats || []).length) break;
        const key = `${attendee.seat_class}#${Number(attendee.seat_number || 0)}`;
        const candidates = (seatsByClassAndNumber.get(key) || []).filter((s: any) => !occupiedSeatIds.has(s.id));
        if (candidates.length !== 1) continue;
        const seat = candidates[0];
        assignmentBySeatId.set(String(seat.id), { attendee, seat, fromSeatNumber: true });
        occupiedSeatIds.add(seat.id);
      }

      if (assignmentBySeatId.size === 0) {
        return { success: true, restored: 0, restored_from_seat_number: 0, skipped_no_seat: skippedNoSeat, skipped_conflict: skippedConflict, note: 'لا يوجد تطابقات صالحة للاسترجاع' };
      }

      // Apply only targeted updates (no global wipe), so running recovery repeatedly is safe.
      for (const item of assignmentBySeatId.values() as any) {
        const attendee = item.attendee;
        const seat = item.seat;
        if (seat.attendee_id && String(seat.attendee_id) !== String(attendee.id)) {
          await updateAttendeeSafely(String(seat.attendee_id), { seat_number: null, barcode: null });
        }
        await supabase
          .from('seats')
          .update({ status: 'available', attendee_id: null, reserved_by: null, reserved_until: null })
          .eq('event_id', eventId)
          .eq('attendee_id', attendee.id)
          .neq('id', seat.id);
        await supabase
          .from('seats')
          .update({ status: 'booked', attendee_id: attendee.id, reserved_by: null, reserved_until: null })
          .eq('event_id', eventId)
          .eq('id', seat.id);

        const updateRes = await updateAttendeeSafely(String(attendee.id), {
          status: 'registered',
          seat_number: Number(seat.seat_number),
          seat_class: seat.seat_class,
          barcode: seat.seat_code
        });
        if (updateRes.error) throw new Error(updateRes.error.message);

        restored += 1;
        if (item.fromSeatNumber) restoredFromSeatNumber += 1;
      }

      return { success: true, restored, restored_from_seat_number: restoredFromSeatNumber, skipped_no_seat: skippedNoSeat, skipped_conflict: skippedConflict };
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

        const updateRes = await updateAttendeeSafely(String(attendee.id), {
          status: 'registered',
          seat_number: Number(seat.seat_number),
          seat_class: seat.seat_class,
          barcode: seat.seat_code
        });
        if (updateRes.error) throw new Error(updateRes.error.message);
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
      await markSeatChanged(String(attendeeAId), attendeeA?.barcode, seatB?.seat_code, 'swap_attendees');
      await markSeatChanged(String(attendeeBId), attendeeB?.barcode, seatA?.seat_code, 'swap_attendees');

      return { success: true };
    }

    if (endpoint === '/seating/logic/solve') {
      const eventId = body?.event_id || DEFAULT_EVENT_ID;
      const groupIdsRaw = Array.isArray(body?.attendee_ids) ? body.attendee_ids : [];
      const groupIds = groupIdsRaw.map((id: any) => String(id || '')).filter(Boolean);
      if (groupIds.length < 2) throw new Error('يلزم إرسال attendee_ids (شخصين على الأقل)');

      const hallGovernorate = getGovernorateFromEventId(eventId);
      const [seatsRes, attendeesRes] = await Promise.all([
        supabase
          .from('seats')
          .select('id, seat_number, seat_class, seat_code, row_number, table_id, attendee_id, status')
          .eq('event_id', eventId),
        applyCompanyScopeToAttendeesQuery(
          supabase
            .from('attendees')
            .select('*')
            .eq('is_deleted', false)
            .eq('governorate', hallGovernorate)
            .in('status', ['registered', 'interested']),
          currentUser
        )
      ]);
      if (seatsRes.error) throw new Error(seatsRes.error.message);
      if (attendeesRes.error) throw new Error(attendeesRes.error.message);

      const result = await solveAdjacencyForGroup(
        eventId,
        attendeesRes.data || [],
        seatsRes.data || [],
        groupIds
      );
      return {
        ...result,
        message: 'تم تنفيذ إعادة التسكين المنطقي بنجاح'
      };
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

    if (endpoint === '/seating/auto-seat') {
      const eventId = body?.event_id || DEFAULT_EVENT_ID;
      const hallGovernorate = getGovernorateFromEventId(eventId);
      const targetClass = body?.seat_class as 'A' | 'B' | 'C' | undefined;
      const classList: Array<'A' | 'B' | 'C'> = targetClass ? [targetClass] : ['A', 'B', 'C'];
      const paidMode: 'any_paid' | 'fully_paid' = body?.paid_mode === 'fully_paid' ? 'fully_paid' : 'any_paid';

      const getTableOrderFromSeat = (seat: any) => {
        const fromTableId = getTableOrderFromTableId(seat?.table_id || null);
        if (Number.isInteger(fromTableId as any) && Number(fromTableId) > 0) return Number(fromTableId);
        return Number(seat?.table_order || 9999);
      };
      const sortSeats = (items: any[]) => [...(items || [])].sort((a, b) => {
        const rowA = Number(a?.row_number || 9999);
        const rowB = Number(b?.row_number || 9999);
        if (rowA !== rowB) return rowA - rowB;
        const tableA = getTableOrderFromSeat(a);
        const tableB = getTableOrderFromSeat(b);
        if (tableA !== tableB) return tableA - tableB;
        const seatA = Number(a?.seat_number || 9999);
        const seatB = Number(b?.seat_number || 9999);
        if (seatA !== seatB) return seatA - seatB;
        const xA = Number(a?.position_x || 9999);
        const xB = Number(b?.position_x || 9999);
        return xA - xB;
      });
      const areConsecutive = (items: any[]) => {
        if (!items?.length) return false;
        const sorted = [...items].sort((a, b) => Number(a?.seat_number || 0) - Number(b?.seat_number || 0));
        for (let i = 1; i < sorted.length; i += 1) {
          if (Number(sorted[i].seat_number) !== Number(sorted[i - 1].seat_number) + 1) return false;
        }
        return true;
      };
      const findBlock = (pool: any[], size: number) => {
        if (size <= 0) return [] as any[];
        const available = sortSeats(pool);
        if (available.length < size) return null;
        if (size === 1) return [available[0]];

        const byTable = new Map<string, any[]>();
        for (const seat of available) {
          if (!seat?.table_id) continue;
          const key = String(seat.table_id);
          const arr = byTable.get(key) || [];
          arr.push(seat);
          byTable.set(key, arr);
        }
        for (const seats of byTable.values()) {
          const sorted = sortSeats(seats);
          for (let i = 0; i + size <= sorted.length; i += 1) {
            const slice = sorted.slice(i, i + size);
            if (areConsecutive(slice)) return slice;
          }
        }

        const byRow = new Map<string, any[]>();
        for (const seat of available) {
          const key = `${seat?.seat_class || ''}#${Number(seat?.row_number || 0)}`;
          const arr = byRow.get(key) || [];
          arr.push(seat);
          byRow.set(key, arr);
        }
        for (const seats of byRow.values()) {
          const sorted = sortSeats(seats);
          for (let i = 0; i + size <= sorted.length; i += 1) {
            const slice = sorted.slice(i, i + size);
            if (areConsecutive(slice)) return slice;
          }
        }

        return null;
      };

      const overallStats: any = {
        success: true,
        endpoint: '/seating/auto-seat',
        event_id: eventId,
        governorate: hallGovernorate,
        paid_mode: paidMode,
        classes: {} as Record<string, any>,
        totals: {
          candidates: 0,
          paid_candidates: 0,
          unpaid_skipped: 0,
          assigned: 0,
          groups_assigned: 0,
          groups_blocked: 0,
          seat_conflicts: 0,
          attendee_update_failed: 0,
          no_available_seats: 0
        }
      };

      for (const cls of classList) {
        const [{ data: attendeesRaw, error: attendeesError }, { data: seatsRaw, error: seatsError }] = await Promise.all([
          supabase
            .from('attendees')
            .select('*')
            .eq('governorate', hallGovernorate)
            .eq('seat_class', cls)
            .eq('status', 'registered')
            .eq('is_deleted', false)
            .order('created_at', { ascending: true })
            .limit(5000),
          supabase
            .from('seats')
            .select('id, seat_number, seat_class, seat_code, position_x, position_y, status, attendee_id, row_number, table_id')
            .eq('event_id', eventId)
            .eq('seat_class', cls)
            .order('row_number', { ascending: true })
            .limit(5000)
        ]);
        if (attendeesError) throw new Error(attendeesError.message);
        if (seatsError) throw new Error(seatsError.message);

        const attendees = ((attendeesRaw || []) as any[]).map((item) => normalizeAttendeePricing(applyAttendeeMeta(item)));
        const allSeats = (seatsRaw || []) as any[];
        const seatedInHallIds = new Set(allSeats.filter((seat) => !!seat.attendee_id).map((seat) => String(seat.attendee_id)));
        const unseatedCandidates = attendees.filter((attendee) => {
          const id = String(attendee?.id || '');
          if (!id) return false;
          if (seatedInHallIds.has(id)) return false;
          return true;
        });
        const classStats: any = {
          candidates: unseatedCandidates.length,
          paid_candidates: 0,
          unpaid_skipped: 0,
          available_seats: 0,
          assigned: 0,
          groups_total: 0,
          groups_assigned: 0,
          groups_blocked_together: 0,
          seat_conflicts: 0,
          attendee_update_failed: 0,
          no_available_seats: 0
        };

        const isPaid = (attendee: any) => {
          const paymentAmount = Number(attendee?.payment_amount || 0);
          const remaining = Number(attendee?.remaining_amount ?? 0);
          if (paymentAmount <= 0) return false;
          if (paidMode === 'fully_paid') return remaining <= 0;
          return true;
        };
        const paidAttendees = unseatedCandidates.filter((attendee) => isPaid(attendee));
        classStats.paid_candidates = paidAttendees.length;
        classStats.unpaid_skipped = Math.max(0, unseatedCandidates.length - paidAttendees.length);

        const initiallyAvailable = allSeats.filter(
          (seat) =>
            !seat.attendee_id &&
            ['available', 'vip', 'booked'].includes(String(seat.status || '').toLowerCase())
        );
        classStats.available_seats = initiallyAvailable.length;
        if (!paidAttendees.length || !initiallyAvailable.length) {
          if (!initiallyAvailable.length && paidAttendees.length > 0) classStats.no_available_seats = paidAttendees.length;
          overallStats.classes[cls] = classStats;
          overallStats.totals.candidates += classStats.candidates;
          overallStats.totals.paid_candidates += classStats.paid_candidates;
          overallStats.totals.unpaid_skipped += classStats.unpaid_skipped;
          overallStats.totals.no_available_seats += classStats.no_available_seats;
          continue;
        }

        const candidateIds = new Set(paidAttendees.map((a) => String(a.id)));
        const byId = new Map(paidAttendees.map((a) => [String(a.id), a]));
        const adjacency = new Map<string, Set<string>>();
        for (const attendee of paidAttendees) {
          const id = String(attendee.id);
          const neighborIds = Array.isArray(attendee.preferred_neighbor_ids) ? attendee.preferred_neighbor_ids : [];
          for (const rawNeighborId of neighborIds) {
            const neighborId = String(rawNeighborId || '');
            if (!candidateIds.has(neighborId) || neighborId === id) continue;
            if (!adjacency.has(id)) adjacency.set(id, new Set<string>());
            if (!adjacency.has(neighborId)) adjacency.set(neighborId, new Set<string>());
            adjacency.get(id)!.add(neighborId);
            adjacency.get(neighborId)!.add(id);
          }
        }

        const groups: Array<{ kind: 'companion' | 'company' | 'single'; members: any[]; oldestAt: string }> = [];
        const used = new Set<string>();
        for (const attendee of paidAttendees) {
          const startId = String(attendee.id);
          if (used.has(startId)) continue;
          const neighbors = adjacency.get(startId);
          if (!neighbors || neighbors.size === 0) continue;
          const stack = [startId];
          const componentIds: string[] = [];
          used.add(startId);
          while (stack.length > 0) {
            const current = stack.pop()!;
            componentIds.push(current);
            const nextNeighbors = adjacency.get(current);
            if (!nextNeighbors) continue;
            for (const n of nextNeighbors) {
              if (used.has(n)) continue;
              used.add(n);
              stack.push(n);
            }
          }
          const members = componentIds
            .map((id) => byId.get(id))
            .filter(Boolean)
            .sort((a: any, b: any) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
          if (!members.length) continue;
          groups.push({
            kind: members.length > 1 ? 'companion' : 'single',
            members,
            oldestAt: String(members[0]?.created_at || '')
          });
        }

        const remainingSingles = paidAttendees.filter((attendee) => !used.has(String(attendee.id)));
        const companyMap = new Map<string, any[]>();
        for (const attendee of remainingSingles) {
          const companyId = attendee.company_id ? String(attendee.company_id) : `__single__${attendee.id}`;
          const arr = companyMap.get(companyId) || [];
          arr.push(attendee);
          companyMap.set(companyId, arr);
        }
        for (const companyMembers of companyMap.values()) {
          const members = [...companyMembers].sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
          groups.push({
            kind: members.length > 1 && members.every((m) => !!m.company_id) ? 'company' : 'single',
            members,
            oldestAt: String(members[0]?.created_at || '')
          });
        }
        groups.sort((a, b) => new Date(a.oldestAt || 0).getTime() - new Date(b.oldestAt || 0).getTime());
        classStats.groups_total = groups.length;

        let availablePool = sortSeats(initiallyAvailable);
        const removeFromPool = (seatIds: string[]) => {
          const idSet = new Set(seatIds.map((id) => String(id)));
          availablePool = availablePool.filter((seat) => !idSet.has(String(seat.id)));
        };

        for (const group of groups) {
          if (!group.members.length) continue;
          if (availablePool.length <= 0) {
            classStats.no_available_seats += group.members.length;
            continue;
          }

          const groupSize = group.members.length;
          const strictTogether = group.kind === 'companion' && groupSize > 1;
          let pickedSeats = findBlock(availablePool, groupSize);
          if (!pickedSeats && strictTogether) {
            // Keep preference for together seating, but do not block all assignments.
            classStats.groups_blocked_together += 1;
            pickedSeats = sortSeats(availablePool).slice(0, Math.min(groupSize, availablePool.length));
          } else if (!pickedSeats && !strictTogether) {
            pickedSeats = sortSeats(availablePool).slice(0, Math.min(groupSize, availablePool.length));
          }
          if (!pickedSeats || pickedSeats.length === 0) {
            if (!strictTogether) classStats.groups_blocked_together += 1;
            continue;
          }

          const seatsToUse = pickedSeats.slice(0, Math.min(group.members.length, pickedSeats.length));
          removeFromPool(seatsToUse.map((seat) => String(seat.id)));
          let groupAssigned = 0;

          for (let i = 0; i < seatsToUse.length; i += 1) {
            const attendee = group.members[i];
            const seat = seatsToUse[i];
            if (!attendee || !seat) continue;

            const { data: claimedSeat, error: claimSeatError } = await supabase
              .from('seats')
              .update({ status: 'booked', attendee_id: attendee.id, reserved_by: null, reserved_until: null })
              .eq('event_id', eventId)
              .eq('id', seat.id)
              .in('status', ['available', 'vip', 'booked'])
              .is('attendee_id', null)
              .select('id, seat_number, seat_class, seat_code')
              .maybeSingle();
            if (claimSeatError) throw new Error(claimSeatError.message);
            if (!claimedSeat) {
              classStats.seat_conflicts += 1;
              continue;
            }

            const updateRes = await updateAttendeeSafely(String(attendee.id), {
              seat_number: Number(claimedSeat.seat_number),
              seat_class: claimedSeat.seat_class,
              barcode: claimedSeat.seat_code
            });
            if (updateRes.error) {
              classStats.attendee_update_failed += 1;
              await supabase
                .from('seats')
                .update({ status: 'available', attendee_id: null, reserved_by: null, reserved_until: null })
                .eq('event_id', eventId)
                .eq('id', claimedSeat.id)
                .eq('attendee_id', attendee.id);
              continue;
            }
            groupAssigned += 1;
          }

          if (groupAssigned > 0) {
            classStats.assigned += groupAssigned;
            classStats.groups_assigned += 1;
          }
        }

        overallStats.classes[cls] = classStats;
        overallStats.totals.candidates += classStats.candidates;
        overallStats.totals.paid_candidates += classStats.paid_candidates;
        overallStats.totals.unpaid_skipped += classStats.unpaid_skipped;
        overallStats.totals.assigned += classStats.assigned;
        overallStats.totals.groups_assigned += classStats.groups_assigned;
        overallStats.totals.groups_blocked += classStats.groups_blocked_together;
        overallStats.totals.seat_conflicts += classStats.seat_conflicts;
        overallStats.totals.attendee_update_failed += classStats.attendee_update_failed;
        overallStats.totals.no_available_seats += classStats.no_available_seats;
      }

      const legacyByClass: any = {};
      for (const cls of classList) {
        const item = overallStats.classes?.[cls] || {};
        legacyByClass[cls] = {
          candidates: Number(item.candidates || 0),
          available_seats: Number(item.available_seats || 0),
          assigned: Number(item.assigned || 0),
          unassigned: Math.max(0, Number(item.paid_candidates || 0) - Number(item.assigned || 0))
        };
      }

      return {
        ...overallStats,
        by_class: legacyByClass,
        total_candidates: Number(overallStats.totals?.candidates || 0),
        total_available_seats: Number((legacyByClass.A?.available_seats || 0) + (legacyByClass.B?.available_seats || 0) + (legacyByClass.C?.available_seats || 0)),
        total_assigned: Number(overallStats.totals?.assigned || 0),
        total_unassigned: Math.max(0, Number(overallStats.totals?.paid_candidates || 0) - Number(overallStats.totals?.assigned || 0))
      };
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
            .select('id, full_name, governorate, seat_class, status, barcode')
            .eq('governorate', hallGovernorate)
            .eq('seat_class', cls)
            .eq('status', 'registered')
            .eq('is_deleted', false)
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

        const attendeeList = ((attendees || []) as any[]).filter((a) => !(a?.barcode && String(a.barcode).trim() !== ''));
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
        if (creator && creator.role === 'social_media' && body.ticket_price_override !== undefined && body.ticket_price_override !== null && body.ticket_price_override !== '') {
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
      if (body.ticket_price_override !== undefined && body.ticket_price_override !== null && body.ticket_price_override !== '') {
        throw new Error('السعر المخصص للتذكرة مسموح للمالك فقط');
      }

      const paidAmount = Number(body.payment_amount || 0);
      if (paidAmount <= 0) throw new Error('يجب تسجيل قيمة العربون');

      const totalPrice = getBaseTicketPrice(oldRecord);
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

      const totalPrice = getBaseTicketPrice(oldRecord);
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
        const finalBarcode = body.barcode === null ? null : (resolvedSeat === null ? null : (body.barcode || oldRecord.barcode || null));

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
        // Run syncSeatStatus to ensure the seat is properly updated and we get the correct barcode back
        // Important: if we are trying to unassign, we must explicitly pass nulls
        const passedSeatNumber = body.seat_number === null ? null : data.seat_number;
        const passedBarcode = body.barcode === null ? null : data.barcode;
        
        const newBarcode = await syncSeatStatus(data.id, data.governorate, data.seat_class, passedSeatNumber, passedBarcode);
        if (newBarcode !== data.barcode) {
           await updateAttendeeSafely(String(data.id), { barcode: newBarcode });
           data.barcode = newBarcode;
        }
    }

    return data;
  },

  async patch(endpoint: string, body: any = {}) {
    const currentUser = getSessionUser();
    const parts = endpoint.split('/');
    const id = parts[2];
    
    // Custom patch route for updating attendee directly
    if (endpoint.match(/^\/attendees\/[^/]+$/)) {
      const payload: any = { ...body };

      const result = await updateAttendeeSafely(String(id), payload);
      const { data, error } = result as any;
      if (error) throw new Error(error.message);
      return normalizeAttendeePricing(data);
    }
    
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
      payload.seat_change_pending = false;
         
      // Instead of overwriting fields with oldRecordRaw, we ONLY update the print status.
      // This prevents the race condition where `mark-printed` overwrites the recent `patch` save.
      
      const { data: currentRecord } = await supabase.from('attendees').select('*').eq('id', id).single();
      if (!currentRecord) throw new Error('Attendee not found');

      // Only update what is strictly necessary for print status
      const { data, error } = await supabase
        .from('attendees')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
        
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
