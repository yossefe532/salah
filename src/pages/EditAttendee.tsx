import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { api, GOVERNORATE_CAPACITIES } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Loader2, Save, ArrowRight, Plus, Minus } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Attendee, Governorate, SeatClass, PaymentType } from '../types';
import { optimizeProfilePhoto } from '../lib/profilePhoto';
import NeighborSelector from '../components/NeighborSelector';

const schema = z.object({
  full_name: z.string().min(3, 'الاسم يجب أن يكون 3 أحرف على الأقل'),
  full_name_en: z.string().optional(),
  occupation_type: z.enum(['student', 'employee', 'business_owner', 'executive']).optional(),
  organization_name: z.string().optional().or(z.literal('')),
  job_title: z.string().optional().or(z.literal('')),
  university: z.string().optional().or(z.literal('')),
  faculty: z.string().optional().or(z.literal('')),
  year: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
  profile_photo_url: z.string().optional().or(z.literal('')),
  phone_primary: z.string().optional().or(z.literal('')),
  phone_secondary: z.string().optional().or(z.literal('')),
  email_primary: z.string().email('بريد إلكتروني غير صالح').optional().or(z.literal('')),
  email_secondary: z.string().email('بريد إلكتروني غير صالح').optional().or(z.literal('')),
  facebook_link: z.string().url('رابط غير صالح').optional().or(z.literal('')),
  governorate: z.enum(['Minya', 'Asyut', 'Sohag', 'Qena']),
  seat_class: z.enum(['A', 'B', 'C']),
  seat_number: z.number().int().positive().optional(),
  status: z.enum(['interested', 'registered']),
  payment_type: z.enum(['deposit', 'full']).optional(),
  payment_amount: z.number().min(0).optional(),
  sales_channel: z.enum(['direct', 'sales_team', 'external_partner', 'sponsor_referral']),
  sales_source_name: z.string().optional(),
  commission_amount: z.number().min(0).optional(),
  commission_notes: z.string().optional(),
  ticket_price_override: z.number().min(0).optional(),
  certificate_included: z.boolean().optional(),
  preferred_neighbor_name: z.string().optional(),
  preferred_neighbor_ids: z.array(z.string()).optional(),
});

type FormData = z.infer<typeof schema>;

const SEAT_PRICES = {
  A: 2000,
  B: 1700,
  C: 1500,
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
  const words = value.replace(/\s+/g, ' ').trim().split(' ');
  return words.map((word) => {
    if (dictionary[word]) return dictionary[word];
    
    // Smart Fallback Handling
    let raw = '';
    for (let i = 0; i < word.length; i++) {
      let char = word[i];
      
      // Handle Al (ال) at the beginning of words
      if (i === 0 && word.startsWith('ال')) {
         raw += 'El';
         i++; // skip 'ل'
         continue;
      }
      
      // Handle double 'ي' at the end
      if (i === word.length - 1 && char === 'ي' && word[i-1] === 'ي') {
         raw += 'y';
         continue;
      }
      
      // Handle 'ة' at the end
      if (i === word.length - 1 && char === 'ة') {
         raw += 'a';
         continue;
      }

      raw += map[char] ?? char;
    }
    
    // Clean up common bad mappings (like 'w' -> 'o' in the middle of words)
    raw = raw.replace(/aw/g, 'o').replace(/iy/g, 'y').replace(/ey/g, 'y');
    
    return raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : '';
  }).filter(Boolean).join(' ');
};

const EditAttendee: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showSecondaryPhone, setShowSecondaryPhone] = useState(false);
  const [showSecondaryEmail, setShowSecondaryEmail] = useState(false);
  const [englishNameEdited, setEnglishNameEdited] = useState(false);
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const [availableSeatsList, setAvailableSeatsList] = useState<{id: string, seat_number: number, seat_code: string}[]>([]);
  const [attendeesOptions, setAttendeesOptions] = useState<Attendee[]>([]);
  const [selectedBarcode, setSelectedBarcode] = useState<string | null>(null);
  const [currentSeatOption, setCurrentSeatOption] = useState<{ seat_number: number | null; seat_code: string } | null>(null);

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
        governorate: 'Minya',
        seat_class: 'B',
        status: 'registered',
        payment_type: 'deposit',
        payment_amount: 0,
        occupation_type: 'employee',
        sales_channel: 'direct',
        commission_amount: 0,
        certificate_included: true,
        full_name_en: '',
        organization_name: '',
        job_title: '',
        university: '',
        faculty: '',
        year: '',
        notes: '',
        profile_photo_url: '',
        preferred_neighbor_ids: [],
    }
  });

  const status = watch('status');
  const occupationType = watch('occupation_type');
  const fullName = watch('full_name');
  const fullNameEn = watch('full_name_en');
  const profilePhotoUrl = watch('profile_photo_url');
  const preferredNeighborIds = watch('preferred_neighbor_ids') || [];
  const governorate = watch('governorate');
  const seatClass = watch('seat_class');
  const paymentType = watch('payment_type');
  const selectedSeatNumber = watch('seat_number');
  const paymentAmount = Number(watch('payment_amount') || 0);
  const commissionAmount = Number(watch('commission_amount') || 0);
  const netTicketAmount = Math.max(0, paymentAmount - commissionAmount);
  const ticketPriceOverride = watch('ticket_price_override') as number | undefined;
  const hasTicketOverride = ticketPriceOverride !== undefined && ticketPriceOverride !== null && !Number.isNaN(Number(ticketPriceOverride));
  const isCustomPrice = !!(user?.role === 'owner' && hasTicketOverride && Number(ticketPriceOverride) >= 0);
  const currentGovCapacity = (GOVERNORATE_CAPACITIES[governorate] as any)?.[seatClass] || 0;
  const effectiveSeatPrice = isCustomPrice ? Number(ticketPriceOverride) : SEAT_PRICES[seatClass as keyof typeof SEAT_PRICES];

  useEffect(() => {
    if (!fullName) {
      if (!englishNameEdited) setValue('full_name_en', '');
      return;
    }
    if (!englishNameEdited || !fullNameEn) {
      setValue('full_name_en', transliterateArabicToEnglish(fullName));
    }
  }, [fullName, fullNameEn, englishNameEdited, setValue]);

  useEffect(() => {
    const fetchAttendee = async () => {
      try {
        const data: Attendee = await api.get(`/attendees/${id}`);
        reset({
          full_name: data.full_name,
          full_name_en: data.full_name_en || '',
          phone_primary: data.phone_primary,
          phone_secondary: data.phone_secondary || '',
          email_primary: data.email_primary || '',
          email_secondary: data.email_secondary || '',
          facebook_link: data.facebook_link || '',
          governorate: data.governorate,
          seat_class: data.seat_class,
          seat_number: data.seat_number || undefined,
          status: data.status,
          occupation_type: data.occupation_type || 'employee',
          organization_name: data.organization_name || '',
          job_title: data.job_title || '',
          university: data.university || '',
          faculty: data.faculty || '',
          year: data.year || '',
          notes: data.notes || '',
          profile_photo_url: data.profile_photo_url || '',
          preferred_neighbor_ids: Array.isArray(data.preferred_neighbor_ids) ? data.preferred_neighbor_ids : [],
          payment_type: data.payment_type || 'deposit',
          payment_amount: data.payment_amount || 0,
          sales_channel: data.sales_channel || 'direct',
          sales_source_name: data.sales_source_name || '',
          commission_amount: data.commission_amount || 0,
          commission_notes: data.commission_notes || '',
          ticket_price_override: data.ticket_price_override ?? undefined,
          certificate_included: data.certificate_included ?? true,
          preferred_neighbor_name: data.preferred_neighbor_name || '',
        });
        if (data.phone_secondary) setShowSecondaryPhone(true);
        if (data.email_secondary) setShowSecondaryEmail(true);
        setEnglishNameEdited(Boolean(data.full_name_en));
        setSelectedBarcode(data.barcode || null);
        setCurrentSeatOption(data.barcode ? { seat_number: data.seat_number ?? null, seat_code: data.barcode } : null);
        (window as any)._originalBarcode = data.barcode || null;
        setLoading(false);
      } catch (error) {
        console.error('Error fetching attendee:', error);
        setSubmitError('فشل تحميل بيانات المشترك');
        setLoading(false);
      }
    };

    if (id) fetchAttendee();
  }, [id, reset]);

  // Auto-fill full payment amount if switched to full
  useEffect(() => {
    if (status === 'registered' && paymentType === 'full') {
      setValue('payment_amount', effectiveSeatPrice);
    }
  }, [status, seatClass, paymentType, setValue, effectiveSeatPrice]);

  useEffect(() => {
    const loadSeats = async () => {
      if (status !== 'registered') {
        setAvailableSeatsList([]);
        setValue('seat_number', undefined);
        return;
      }

      const normalizeGov = (val: string) => {
         const v = String(val || '').trim().toLowerCase();
         if (v.includes('minya') || v.includes('منيا')) return 'minya';
         if (v.includes('asyut') || v.includes('أسيوط') || v.includes('اسيوط')) return 'asyut';
         if (v.includes('sohag') || v.includes('سوهاج')) return 'sohag';
         if (v.includes('qena') || v.includes('قنا')) return 'qena';
         return 'minya';
      };
      
      const eventId = `${normalizeGov(governorate).toUpperCase()}-2026-MAIN`;
      const seatsResponse = await api.get(`/seating/available-seats?eventId=${encodeURIComponent(eventId)}&seat_class=${encodeURIComponent(seatClass)}&limit=1500`);
      const validSeats = Array.isArray(seatsResponse) ? seatsResponse : [];
      const mapped = validSeats.map((s: any) => ({
        id: s.id,
        seat_number: Number(s.seat_number),
        seat_code: String(s.seat_code || '')
      }));
      const currentSeatExists = currentSeatOption && mapped.some((s) => s.seat_code === currentSeatOption.seat_code);
      const mergedSeats = currentSeatOption && !currentSeatExists
        ? [{ id: `current-${id}`, seat_number: Number(currentSeatOption.seat_number || 0), seat_code: `${currentSeatOption.seat_code} (مقعدك الحالي)` }, ...mapped]
        : mapped;
      setAvailableSeatsList(mergedSeats);

    };
    loadSeats();
  }, [currentSeatOption, governorate, id, seatClass, setValue, status]);

  useEffect(() => {
    register('preferred_neighbor_name');
    register('preferred_neighbor_ids');
  }, [register]);

  useEffect(() => {
    const loadAttendeesOptions = async () => {
      const pageSize = 500;
      const maxRows = 10000;
      let offset = 0;
      const collected: Attendee[] = [];

      while (offset < maxRows) {
        const response = await api.get(`/attendees?lite=1&status=registered&limit=${pageSize}&offset=${offset}`);
        const rows = Array.isArray(response) ? response : [];
        if (rows.length === 0) break;
        collected.push(...rows);
        if (rows.length < pageSize) break;
        offset += pageSize;
      }

      const unique = new Map<string, Attendee>();
      collected.forEach((attendee) => {
        if (attendee?.id) unique.set(attendee.id, attendee);
      });
      setAttendeesOptions(Array.from(unique.values()));
    };
    loadAttendeesOptions().catch(() => setAttendeesOptions([]));
  }, []);

  const handleProfilePhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setPhotoProcessing(true);
    setSubmitError(null);

    try {
      const optimized = await optimizeProfilePhoto(file);
      setValue('profile_photo_url', optimized, { shouldDirty: true, shouldValidate: true });
    } catch (error) {
      setSubmitError((error as Error).message || 'فشل تجهيز الصورة الشخصية');
    } finally {
      setPhotoProcessing(false);
      event.target.value = '';
    }
  };

  const onSubmit = async (data: FormData) => {
    if (!user || !id) return;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const newAttendeeId = crypto.randomUUID();
      const safeCommission = Math.max(0, Math.min(Number(data.commission_amount || 0), Number(data.payment_amount || 0)));
      const hasSubmittedOverride = data.ticket_price_override !== undefined
        && data.ticket_price_override !== null
        && !Number.isNaN(Number(data.ticket_price_override));
      const baseTicketPrice = hasSubmittedOverride ? Number(data.ticket_price_override) : SEAT_PRICES[data.seat_class];
      const certificateIncluded = hasSubmittedOverride ? !!data.certificate_included : true;
      const fullNameEnFinal = String(data.full_name_en || '').trim() || transliterateArabicToEnglish(data.full_name);
      const normalizedPaymentAmount = data.status === 'registered'
        ? (data.payment_type === 'full' ? baseTicketPrice : Number(data.payment_amount || 0))
        : 0;
      
      let finalSeatNumber = data.status === 'registered' && data.seat_number ? Number(data.seat_number) : null;
      let finalBarcode: string | null = null;
      if (data.status === 'registered') {
        const tempBarcode = String((window as any)._tempSelectedBarcodeEdit || '').trim();
        const pickedBarcode = (tempBarcode || selectedBarcode || '').replace(' (مقعدك الحالي)', '').trim();
        if (pickedBarcode) {
          finalBarcode = pickedBarcode;
          const seatByCode = availableSeatsList.find((s) => String(s.seat_code || '').replace(' (مقعدك الحالي)', '').trim() === pickedBarcode);
          if (seatByCode?.seat_number) finalSeatNumber = Number(seatByCode.seat_number);
        } else if (finalSeatNumber) {
          const byNumber = availableSeatsList.filter((s) => Number(s.seat_number) === Number(finalSeatNumber));
          if (byNumber.length === 1) {
            finalBarcode = String(byNumber[0].seat_code || '').replace(' (مقعدك الحالي)', '').trim() || null;
          } else {
            // Ambiguous seat number across tables; don't guess barcode client-side.
            finalBarcode = null;
          }
        }
      }
      
      // Seat number is now optional
      const updatedAttendee = {
          ...data,
          full_name_en: fullNameEnFinal,
          payment_type: data.status === 'registered' ? data.payment_type : 'deposit',
          payment_amount: normalizedPaymentAmount,
          sales_channel: data.sales_channel,
          seat_number: finalSeatNumber,
          barcode: finalBarcode || null,
          base_ticket_price: baseTicketPrice,
          certificate_included: certificateIncluded,
          preferred_neighbor_ids: Array.isArray(data.preferred_neighbor_ids) ? data.preferred_neighbor_ids : [],
          preferred_neighbor_name: attendeesOptions
            .filter((attendee) => (data.preferred_neighbor_ids || []).includes(attendee.id))
            .map((attendee) => attendee.full_name)
            .join('، ') || null,
          sales_source_name: data.sales_source_name || null,
          commission_amount: data.status === 'registered'
            ? Math.max(0, Math.min(Number(data.commission_amount || 0), normalizedPaymentAmount))
            : 0,
          commission_notes: data.commission_notes || null,
          phone_secondary: data.phone_secondary || null,
          profile_photo_url: data.profile_photo_url || null,
          email_primary: data.email_primary || null,
          email_secondary: data.email_secondary || null,
          facebook_link: data.facebook_link || null,
          
          remaining_amount: (data.status === 'registered') 
            ? Math.max(0, baseTicketPrice - normalizedPaymentAmount)
            : baseTicketPrice,
          
          updated_at: new Date().toISOString(),
      };

      updatedAttendee.barcode = data.status === 'registered' ? (finalBarcode || null) : null;
      
      // Validation: Check if the selected barcode is taken by another user
      const normalizedNewBarcode = String(updatedAttendee.barcode || '').trim();
      const normalizedOriginalBarcode = String((window as any)._originalBarcode || '').trim();
      if (normalizedNewBarcode && normalizedNewBarcode !== normalizedOriginalBarcode) {
         const seatOwner = await api
           .get(`/seating/owner-by-barcode?governorate=${encodeURIComponent(String(data.governorate || ''))}&barcode=${encodeURIComponent(normalizedNewBarcode)}`)
           .catch(() => null);
         const seatOwnerId = String(seatOwner?.attendee_id || '').trim();
         if (seatOwnerId && seatOwnerId !== String(id || '')) {
           const ownerRecord = await api.get(`/attendees/${seatOwnerId}`).catch(() => null);
           const ownerName = String(ownerRecord?.full_name || '').trim();
           throw new Error(`المقعد محجوز مسبقاً لمشترك آخر${ownerName ? ` (${ownerName})` : ''}. يرجى اختيار مقعد مختلف.`);
         }
      }
      
      delete (window as any)._tempSelectedBarcodeEdit;

      await api.put(`/attendees/${id}`, updatedAttendee);

      alert('تم تحديث البيانات بنجاح!');
      navigate('/attendees');
    } catch (error) {
      console.error('Update error:', error);
      setSubmitError((error as Error).message || 'فشل تحديث البيانات');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin h-8 w-8 text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto bg-white shadow sm:rounded-lg" dir="rtl">
      <div className="px-4 py-5 sm:p-6">
        <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold leading-6 text-gray-900">تعديل بيانات المشترك</h3>
            <button 
                onClick={() => navigate('/attendees')}
                className="text-gray-500 hover:text-gray-700 flex items-center gap-1 text-sm"
            >
                <ArrowRight className="h-4 w-4" />
                رجوع للقائمة
            </button>
        </div>
        
        {submitError && (
          <div className="mt-4 bg-red-50 text-red-600 p-3 rounded text-sm mb-6 border border-red-200">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
            <div className="sm:col-span-6">
              <label className="block text-sm font-medium text-gray-700">الاسم الثلاثي *</label>
              <input
                type="text"
                {...register('full_name')}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
              />
              {errors.full_name && <p className="mt-1 text-sm text-red-600">{errors.full_name.message}</p>}
            </div>

            <div className="sm:col-span-6">
              <label className="block text-sm font-medium text-gray-700">الاسم بالإنجليزي</label>
              <input
                type="text"
                {...register('full_name_en')}
                onChange={(e) => {
                  setEnglishNameEdited(true);
                  setValue('full_name_en', e.target.value);
                }}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
              />
              {errors.full_name_en && <p className="mt-1 text-sm text-red-600">{errors.full_name_en.message}</p>}
            </div>

            <div className="sm:col-span-6">
              <input type="hidden" {...register('profile_photo_url')} />
              <label className="block text-sm font-medium text-gray-700">الصورة الشخصية</label>
              <div className="mt-2 flex flex-col gap-3 rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-4">
                  <div className="h-28 w-28 overflow-hidden rounded-2xl border border-gray-300 bg-gray-100">
                    {profilePhotoUrl ? (
                      <img src={profilePhotoUrl} alt="profile-preview" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-gray-500">
                        لا توجد صورة
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex cursor-pointer items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
                      {photoProcessing ? 'جاري تجهيز الصورة...' : 'رفع صورة'}
                      <input type="file" accept="image/*" className="hidden" onChange={handleProfilePhotoChange} disabled={photoProcessing} />
                    </label>
                    {profilePhotoUrl ? (
                      <button
                        type="button"
                        onClick={() => setValue('profile_photo_url', '', { shouldDirty: true, shouldValidate: true })}
                        className="inline-flex items-center rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100"
                      >
                        حذف الصورة
                      </button>
                    ) : null}
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  يتم قص الصورة تلقائياً بشكل مربع وتجهيزها لتظهر مباشرة في التيكت.
                </p>
              </div>
            </div>

            <div className="sm:col-span-3">
              <label className="block text-sm font-medium text-gray-700">صفة العميل</label>
              <select
                {...register('occupation_type')}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
              >
                <option value="student">طالب</option>
                <option value="employee">موظف</option>
                <option value="business_owner">صاحب عمل</option>
                <option value="executive">تنفيذي</option>
              </select>
            </div>

            {occupationType === 'student' ? (
              <>
                <div className="sm:col-span-3">
                  <label className="block text-sm font-medium text-gray-700">الجامعة</label>
                  <input
                    type="text"
                    {...register('university')}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-sm font-medium text-gray-700">الكلية</label>
                  <input
                    type="text"
                    {...register('faculty')}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-sm font-medium text-gray-700">السنة الدراسية</label>
                  <input
                    type="text"
                    {...register('year')}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="sm:col-span-3">
                  <label className="block text-sm font-medium text-gray-700">جهة العمل</label>
                  <input
                    type="text"
                    {...register('organization_name')}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
                    placeholder="اسم الشركة أو المؤسسة"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-sm font-medium text-gray-700">المسمى الوظيفي</label>
                  <input
                    type="text"
                    {...register('job_title')}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
                    placeholder="مهندس / مدير / CEO"
                  />
                </div>
              </>
            )}

            <div className="sm:col-span-6">
              <label className="block text-sm font-medium text-gray-700">ملاحظات إضافية</label>
              <textarea
                {...register('notes')}
                rows={3}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block text-sm font-medium text-gray-700">رقم الهاتف الأساسي</label>
              <input
                type="text"
                {...register('phone_primary')}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border font-mono"
              />
              {errors.phone_primary && <p className="mt-1 text-sm text-red-600">{errors.phone_primary.message}</p>}
            </div>

            <div className="sm:col-span-3">
               {!showSecondaryPhone ? (
                 <button
                   type="button"
                   onClick={() => setShowSecondaryPhone(true)}
                   className="mt-6 inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                 >
                   <Plus className="h-4 w-4 ml-2" />
                   إضافة هاتف ثانوي
                 </button>
               ) : (
                 <div>
                   <label className="block text-sm font-medium text-gray-700 flex justify-between">
                     <span>هاتف ثانوي</span>
                     <button type="button" onClick={() => { setShowSecondaryPhone(false); setValue('phone_secondary', ''); }} className="text-red-500">
                       <Minus className="h-4 w-4" />
                     </button>
                   </label>
                   <input
                     type="text"
                     {...register('phone_secondary')}
                     className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border font-mono"
                   />
                 </div>
               )}
            </div>

            <div className="sm:col-span-3">
              <label className="block text-sm font-medium text-gray-700">المحافظة *</label>
              <select
                {...register('governorate')}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
              >
                <option value="Minya">المنيا</option>
                <option value="Asyut">أسيوط</option>
                <option value="Sohag">سوهاج</option>
                <option value="Qena">قنا</option>
              </select>
            </div>

            <div className="sm:col-span-3">
              <label className="block text-sm font-medium text-gray-700">فئة التذكرة *</label>
              <select
                {...register('seat_class')}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
              >
                <option value="A">فئة A (2000 ج.م)</option>
                <option value="B">فئة B (1700 ج.م)</option>
                <option value="C">فئة C (1500 ج.م)</option>
              </select>
            </div>

            <div className="sm:col-span-6 border-t pt-6">
              <h4 className="text-md font-bold text-gray-900 mb-4 text-indigo-700">بيانات الحجز والمالية</h4>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">حالة العميل *</label>
                  <select
                    {...register('status')}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
                  >
                    <option value="registered">مسجل (دفع مسبق)</option>
                    <option value="interested">مهتم (لم يدفع بعد)</option>
                  </select>
                </div>

                {status === 'registered' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">نوع الدفع</label>
                      <select
                        {...register('payment_type')}
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
                      >
                        <option value="deposit">عربون</option>
                        <option value="full">دفع كامل</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-700">المبلغ المدفوع (ج.م)</label>
                      <div className="mt-1 relative rounded-md shadow-sm">
                        <input
                          type="number"
                          {...register('payment_amount', { valueAsNumber: true })}
                          className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border text-lg font-bold text-green-700"
                        />
                      </div>
                      <p className="mt-2 text-sm text-gray-500 flex justify-between">
                        <span>إجمالي سعر الفئة {seatClass}: {seatClass ? effectiveSeatPrice : 0} ج.م</span>
                        <span className="font-bold text-red-600">
                            المتبقي: {seatClass ? Math.max(0, effectiveSeatPrice - (watch('payment_amount') || 0)) : 0} ج.م
                        </span>
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">مصدر التسجيل</label>
                      <select
                        {...register('sales_channel')}
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
                      >
                        <option value="direct">مباشر</option>
                        <option value="sales_team">تيم سيلز</option>
                        <option value="external_partner">شريك خارجي</option>
                        <option value="sponsor_referral">ترشيح راعي</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">اسم المصدر / المندوب</label>
                      <input
                        type="text"
                        {...register('sales_source_name')}
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
                        placeholder="اسم المندوب أو الجهة"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">العمولة (ج.م)</label>
                      <input
                        type="number"
                        {...register('commission_amount', { valueAsNumber: true })}
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
                      />
                    </div>

                    {availableSeatsList.length > 0 && (
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-gray-700">رقم المقعد ({governorate})</label>
                        <select
                          id="seat_barcode_select"
                          value={selectedBarcode || ''}
                          onChange={(e) => {
                             const val = e.target.value;
                             setSelectedBarcode(val || null);
                             const selectedSeat = availableSeatsList.find(s => s.seat_code === val);
                             setValue('seat_number', selectedSeat ? selectedSeat.seat_number : undefined);
                             (window as any)._tempSelectedBarcodeEdit = val;
                          }}
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
                        >
                          <option value="">بدون مقعد (يتم التسكين لاحقاً)</option>
                          {availableSeatsList.map((seat) => (
                            <option key={seat.id} value={seat.seat_code}>{seat.seat_code}</option>
                          ))}
                        </select>
                        <p className="mt-1 text-xs text-gray-500">
                          المتاح: {availableSeatsList.length} مقعد
                        </p>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700">ملاحظات العمولة</label>
                      <input
                        type="text"
                        {...register('commission_notes')}
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
                      />
                    </div>

                    {user?.role === 'owner' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">سعر مخصص للتذكرة (اختياري)</label>
                        <input
                          type="number"
                          {...register('ticket_price_override', {
                            setValueAs: (v) => {
                              if (v === '' || v === null || v === undefined) return undefined;
                              const n = Number(v);
                              return Number.isNaN(n) ? undefined : n;
                            }
                          })}
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
                          placeholder={`الأساسي: ${SEAT_PRICES[seatClass as keyof typeof SEAT_PRICES]} ج.م`}
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          يظهر هذا الحقل للمالك فقط. سيتم اعتماد السعر المخصص في الحسابات والمتبقي.
                        </p>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700">الشهادة</label>
                      {isCustomPrice ? (
                        <select
                          {...register('certificate_included', { setValueAs: (v) => String(v) === 'true' })}
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
                        >
                          <option value="true">بشهادة</option>
                          <option value="false">بدون شهادة</option>
                        </select>
                      ) : (
                        <div className="mt-1 p-2 rounded-md border border-green-200 bg-green-50 text-green-700 text-sm">
                          إجباري بشهادة للفئات الأساسية A / B / C
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">يريد الجلوس بجانب</label>
                      <div className="mt-1">
                        <NeighborSelector
                          attendees={attendeesOptions}
                          currentAttendeeId={id}
                          selectedIds={preferredNeighborIds}
                          onChange={(ids) => {
                            setValue('preferred_neighbor_ids', ids, { shouldDirty: true, shouldValidate: true });
                            const selectedNames = attendeesOptions
                              .filter((attendee) => ids.includes(attendee.id))
                              .map((attendee) => attendee.full_name)
                              .join('، ');
                            setValue('preferred_neighbor_name', selectedNames, { shouldDirty: true });
                          }}
                        />
                      </div>
                    </div>

                    <div className="sm:col-span-2 bg-indigo-50 border border-indigo-100 rounded-md p-3 text-sm">
                      صافي دخل التذكرة بعد العمولة: <span className="font-bold text-indigo-700">{netTicketAmount.toLocaleString()} ج.م</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="pt-5 border-t">
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => navigate('/attendees')}
                className="bg-white py-2 px-6 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex justify-center py-2 px-8 border border-transparent shadow-sm text-sm font-bold rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
                    جاري الحفظ...
                  </>
                ) : (
                  <>
                    <Save className="ml-2 h-4 w-4" />
                    حفظ التعديلات
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditAttendee;
