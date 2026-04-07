import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { api, GOVERNORATE_CAPACITIES } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Plus, Minus, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const schema = z.object({
  full_name: z.string().min(3, 'Full name must be at least 3 characters'),
  full_name_en: z.string().optional(),
  occupation_type: z.enum(['student', 'employee', 'business_owner', 'executive']),
  organization_name: z.string().optional(),
  job_title: z.string().optional(),
  university: z.string().optional(),
  faculty: z.string().optional(),
  year: z.string().optional(),
  notes: z.string().optional(),
  phone_primary: z.string().min(10, 'Phone number must be valid'),
  phone_secondary: z.string().optional(),
  email_primary: z.string().email('Invalid email address').optional().or(z.literal('')),
  email_secondary: z.string().email('Invalid email address').optional().or(z.literal('')),
  facebook_link: z.string().url('Invalid URL').optional().or(z.literal('')),
  governorate: z.enum(['Minya', 'Asyut', 'Sohag', 'Qena']),
  seat_class: z.enum(['A', 'B', 'C']),
  seat_number: z.number().int().positive().optional(),
  ticket_price_override: z.number().min(0).optional(),
  certificate_included: z.boolean().optional(),
  preferred_neighbor_name: z.string().optional(),
  status: z.enum(['interested', 'registered']),
  payment_type: z.enum(['deposit', 'full']).optional(),
  payment_amount: z.number().min(0).optional(),
  sales_channel: z.enum(['direct', 'sales_team', 'external_partner', 'sponsor_referral']),
  sales_source_name: z.string().optional(),
  commission_amount: z.number().min(0).optional(),
  commission_notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const SEAT_PRICES = {
  A: 2000,
  B: 1700,
  C: 1500,
};

// Smart Input Helpers
const smartFormatPhone = (value: string) => {
  if (!value) return '';
  // Convert Arabic/Persian digits to English
  const englishDigits = value.replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]);
  // Remove non-digits
  return englishDigits.replace(/\D/g, '');
};

const transliterateArabicToEnglish = (input?: string | null) => {
  const value = String(input || '').trim();
  if (!value) return '';
  const dictionary: Record<string, string> = {
    'محمد': 'Mohamed', 'أحمد': 'Ahmed', 'محمود': 'Mahmoud', 'مصطفى': 'Mostafa',
    'حاتم': 'Hatem', 'علي': 'Ali', 'عبدالله': 'Abdullah', 'عبد': 'Abdel',
    'الرحمن': 'Rahman', 'عبدالرحمن': 'Abdelrahman', 'ربيع': 'Rabie',
    'حسن': 'Hassan', 'حسين': 'Hussein', 'عمر': 'Omar', 'عمرو': 'Amr',
    'يوسف': 'Youssef', 'خالد': 'Khaled', 'إبراهيم': 'Ibrahim', 'صلاح': 'Salah'
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
  const words = value.replace(/\s+/g, ' ').trim().split(' ');
  return words.map((word) => {
    if (dictionary[word]) return dictionary[word];
    const raw = word.split('').map((ch) => map[ch] ?? ch).join('').trim();
    return raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : '';
  }).filter(Boolean).join(' ');
};

const Register: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showSecondaryPhone, setShowSecondaryPhone] = useState(false);
  const [showSecondaryEmail, setShowSecondaryEmail] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [occupiedSeats, setOccupiedSeats] = useState<number[]>([]);
  const [englishNameEdited, setEnglishNameEdited] = useState(false);

  const { register, handleSubmit, watch, setValue, formState: { errors }, trigger } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      governorate: 'Minya',
      seat_class: 'B',
      seat_number: undefined,
      status: 'registered',
      payment_type: 'deposit',
      payment_amount: 0,
      occupation_type: 'employee',
      sales_channel: 'direct',
      commission_amount: 0,
      certificate_included: true,
      full_name_en: '',
    },
  });

  // Smart Navigation Handler
  const handleKeyDown = async (e: React.KeyboardEvent, fieldName: keyof FormData, nextFieldId?: string) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // Prevent form submission
      
      // Validate current field before moving
      const isValid = await trigger(fieldName);
      
      if (isValid) {
        if (nextFieldId) {
          const nextElement = document.getElementById(nextFieldId);
          nextElement?.focus();
        } else {
          // If no next field, maybe submit? Or just blur.
          (e.target as HTMLElement).blur();
        }
      }
    }
  };

  const status = watch('status');
  const fullName = watch('full_name');
  const fullNameEn = watch('full_name_en');
  const governorate = watch('governorate');
  const seatClass = watch('seat_class');
  const paymentType = watch('payment_type');
  const occupationType = watch('occupation_type');
  const salesChannel = watch('sales_channel');
  const paymentAmount = Number(watch('payment_amount') || 0);
  const commissionAmount = Number(watch('commission_amount') || 0);
  const netTicketAmount = Math.max(0, paymentAmount - commissionAmount);
  const selectedSeatNumber = watch('seat_number');
  const ticketPriceOverride = watch('ticket_price_override') as number | undefined;
  const isCustomPrice = !!(ticketPriceOverride && user?.role === 'owner' && Number(ticketPriceOverride) > 0);
  const currentGovCapacity = (GOVERNORATE_CAPACITIES[governorate] as any)?.[seatClass] || 0;
  const effectiveSeatPrice = isCustomPrice ? Number(ticketPriceOverride) : SEAT_PRICES[seatClass];
  const availableSeatNumbers = useMemo(() => {
    if (status !== 'registered' || currentGovCapacity <= 0) return [];
    const occupied = new Set(occupiedSeats);
    const result: number[] = [];
    for (let i = 1; i <= currentGovCapacity; i += 1) {
      if (!occupied.has(i)) result.push(i);
    }
    return result;
  }, [currentGovCapacity, occupiedSeats, status]);

  useEffect(() => {
    if (!fullName) {
      if (!englishNameEdited) setValue('full_name_en', '');
      return;
    }
    if (!englishNameEdited || !fullNameEn) {
      setValue('full_name_en', transliterateArabicToEnglish(fullName));
    }
  }, [fullName, fullNameEn, englishNameEdited, setValue]);

  // Auto-fill full payment amount
  useEffect(() => {
    if (status === 'registered' && paymentType === 'full') {
      setValue('payment_amount', effectiveSeatPrice);
    }
  }, [status, seatClass, paymentType, setValue, effectiveSeatPrice]);

  useEffect(() => {
    const loadSeats = async () => {
      if (status !== 'registered') {
        setOccupiedSeats([]);
        setValue('seat_number', undefined);
        return;
      }

      const response = await api.get('/attendees');
      const attendees = Array.isArray(response) ? response : [];
      const seats = attendees
        .filter((a: any) => a.governorate === governorate && a.seat_class === seatClass && a.status === 'registered' && !a.is_deleted)
        .map((a: any) => Number(a.seat_number))
        .filter((n: number) => Number.isInteger(n) && n > 0);
      setOccupiedSeats(seats);
      if (selectedSeatNumber && seats.includes(Number(selectedSeatNumber))) {
        setValue('seat_number', undefined);
      }
    };
    loadSeats();
  }, [governorate, seatClass, selectedSeatNumber, setValue, status]);

  const onSubmit = async (data: FormData) => {
    if (!user) return;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Check for duplicate name (Exact Match)
      // Ensure we have an array, even if API returns null/undefined
      const response = await api.get('/attendees');
      const existingAttendees = Array.isArray(response) ? response : [];
      
      const isDuplicateName = existingAttendees.some((a: any) => 
        a.full_name && a.full_name.trim().toLowerCase() === data.full_name.trim().toLowerCase() && !a.is_deleted
      );
      
      if (isDuplicateName) {
        throw new Error('هذا الاسم مسجل بالفعل! يرجى التأكد من البيانات أو إضافة اسم مميز (مثل اسم الجد).');
      }

      // Check for duplicate phone
      const isDuplicatePhone = existingAttendees.some((a: any) => 
        a.phone_primary === data.phone_primary && !a.is_deleted
      );

      if (isDuplicatePhone) {
         throw new Error('رقم الهاتف هذا مسجل بالفعل لمشارك آخر.');
      }

      const capacity = (GOVERNORATE_CAPACITIES[data.governorate] as any)?.[data.seat_class] || 0;
      // Seat number is now optional, resolveSeat will pick a random one if not provided
      
      const newAttendeeId = crypto.randomUUID();
      const safeCommission = Math.max(0, Math.min(Number(data.commission_amount || 0), Number(data.payment_amount || 0)));
      const baseTicketPrice = isCustomPrice ? Number(data.ticket_price_override) : SEAT_PRICES[data.seat_class];
      const certificateIncluded = isCustomPrice ? !!data.certificate_included : true;
      const fullNameEnFinal = String(data.full_name_en || '').trim() || transliterateArabicToEnglish(data.full_name);
      
      // We will let the API handle seat resolution if not provided
      const newAttendee = {
          id: newAttendeeId,
          created_at: new Date().toISOString(),
          ...data,
          full_name_en: fullNameEnFinal,
          created_by: user.id,
          // Handle optional/nulls
          payment_type: data.status === 'registered' ? data.payment_type : 'deposit',
          payment_amount: data.status === 'registered' ? Number(data.payment_amount) : 0,
          occupation_type: data.occupation_type,
          organization_name: data.occupation_type === 'student' ? null : (data.organization_name || null),
          job_title: data.occupation_type === 'student' ? null : (data.job_title || null),
          university: data.occupation_type === 'student' ? (data.university || null) : null,
          faculty: data.occupation_type === 'student' ? (data.faculty || null) : null,
          year: data.occupation_type === 'student' ? (data.year || null) : null,
          sales_channel: data.sales_channel,
          seat_number: data.status === 'registered' && capacity > 0 && data.seat_number ? Number(data.seat_number) : null,
          base_ticket_price: baseTicketPrice,
          certificate_included: certificateIncluded,
          preferred_neighbor_name: data.preferred_neighbor_name || null,
          sales_source_name: data.sales_source_name || null,
          commission_amount: data.status === 'registered' ? safeCommission : 0,
          commission_notes: data.commission_notes || null,
          phone_secondary: data.phone_secondary || null,
          email_primary: data.email_primary || null,
          email_secondary: data.email_secondary || null,
          facebook_link: data.facebook_link || null,
          
          // Calculated fields for display
          remaining_amount: (data.status === 'registered') 
            ? Math.max(0, baseTicketPrice - (Number(data.payment_amount) || 0))
            : baseTicketPrice,
            
          attendance_status: false,
          qr_code: newAttendeeId, // Use ID as QR content
          barcode: newAttendeeId.substring(0, 8), // Simple barcode
      };

      await api.post('/attendees', newAttendee);

      alert('تم تسجيل المشترك بنجاح!');
      navigate('/attendees');
    } catch (error) {
      console.error('Registration error:', error);
      const errorMsg = (error as Error).message || 'فشل تسجيل المشترك';
      setSubmitError(errorMsg);
      // Ensure error is visible by scrolling to it
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto bg-white dark:bg-gray-800 shadow sm:rounded-lg transition-colors duration-200" dir="rtl">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white">تسجيل مشترك جديد</h3>
        <div className="mt-2 max-w-xl text-sm text-gray-500 dark:text-gray-400">
          <p>يرجى ملء البيانات بدقة لتسجيل الحضور.</p>
        </div>
        
        {submitError && (
          <div className="mt-4 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-3 rounded text-sm">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-6">
          {/* Personal Info */}
          <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
            <div className="sm:col-span-6">
              <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                الاسم بالكامل (ثلاثي) *
              </label>
              <div className="mt-1">
                <input
                  id="full_name"
                  type="text"
                  autoFocus
                  {...register('full_name')}
                  onKeyDown={(e) => handleKeyDown(e, 'full_name', 'occupation_type')}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md p-2 border"
                  placeholder="مثال: أحمد محمد علي"
                />
                {errors.full_name && <p className="mt-1 text-sm text-red-600">{errors.full_name.message}</p>}
              </div>
            </div>

            <div className="sm:col-span-6">
              <label htmlFor="full_name_en" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                الاسم بالإنجليزي
              </label>
              <div className="mt-1">
                <input
                  id="full_name_en"
                  type="text"
                  {...register('full_name_en')}
                  onChange={(e) => {
                    setEnglishNameEdited(true);
                    setValue('full_name_en', e.target.value);
                  }}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md p-2 border"
                  placeholder="Automatic English name (editable)"
                />
              </div>
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="occupation_type" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                صفة العميل
              </label>
              <div className="mt-1">
                <select
                  id="occupation_type"
                  {...register('occupation_type')}
                  onKeyDown={(e) => handleKeyDown(e, 'occupation_type', occupationType === 'student' ? 'university' : 'organization_name')}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md p-2 border"
                >
                  <option value="student">طالب</option>
                  <option value="employee">موظف</option>
                  <option value="business_owner">صاحب عمل</option>
                  <option value="executive">تنفيذي</option>
                </select>
              </div>
            </div>

            {occupationType === 'student' ? (
              <>
                <div className="sm:col-span-3">
                  <label htmlFor="university" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    الجامعة
                  </label>
                  <div className="mt-1">
                    <input
                      id="university"
                      type="text"
                      {...register('university')}
                      onKeyDown={(e) => handleKeyDown(e, 'university', 'faculty')}
                      className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md p-2 border"
                    />
                  </div>
                </div>

                <div className="sm:col-span-3">
                  <label htmlFor="faculty" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    الكلية
                  </label>
                  <div className="mt-1">
                    <input
                      id="faculty"
                      type="text"
                      {...register('faculty')}
                      onKeyDown={(e) => handleKeyDown(e, 'faculty', 'year')}
                      className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md p-2 border"
                    />
                  </div>
                </div>

                <div className="sm:col-span-3">
                  <label htmlFor="year" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    السنة الدراسية
                  </label>
                  <div className="mt-1">
                    <input
                      id="year"
                      type="text"
                      {...register('year')}
                      onKeyDown={(e) => handleKeyDown(e, 'year', 'notes')}
                      className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md p-2 border"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="sm:col-span-3">
                  <label htmlFor="organization_name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    جهة العمل
                  </label>
                  <div className="mt-1">
                    <input
                      id="organization_name"
                      type="text"
                      {...register('organization_name')}
                      onKeyDown={(e) => handleKeyDown(e, 'organization_name', 'job_title')}
                      className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md p-2 border"
                      placeholder="اسم الشركة أو المؤسسة"
                    />
                  </div>
                </div>
                <div className="sm:col-span-3">
                  <label htmlFor="job_title" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    المسمى الوظيفي
                  </label>
                  <div className="mt-1">
                    <input
                      id="job_title"
                      type="text"
                      {...register('job_title')}
                      onKeyDown={(e) => handleKeyDown(e, 'job_title', 'notes')}
                      className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md p-2 border"
                      placeholder="مثال: مهندس / مدير / CEO"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="sm:col-span-6">
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                ملاحظات إضافية
              </label>
              <div className="mt-1">
                <textarea
                  id="notes"
                  {...register('notes')}
                  // Textarea needs shift+enter for new line, enter moves next
                  onKeyDown={(e) => {
                      if(!e.shiftKey) handleKeyDown(e, 'notes', 'phone_primary');
                  }}
                  rows={3}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md p-2 border"
                />
              </div>
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="phone_primary" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                رقم الهاتف *
              </label>
              <div className="mt-1">
                <input
                  id="phone_primary"
                  type="tel"
                  inputMode="tel"
                  pattern="[0-9]*"
                  {...register('phone_primary')}
                  onKeyDown={(e) => handleKeyDown(e, 'phone_primary', showSecondaryPhone ? 'phone_secondary' : 'email_primary')}
                  onBlur={(e) => {
                      const formatted = smartFormatPhone(e.target.value);
                      setValue('phone_primary', formatted);
                      trigger('phone_primary');
                  }}
                  onChange={(e) => {
                      // Real-time correction for better UX (optional)
                      const val = e.target.value;
                      if (val.match(/[٠-٩]/)) {
                          e.target.value = smartFormatPhone(val);
                      }
                  }}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md p-2 border"
                  dir="ltr"
                />
                {errors.phone_primary && <p className="mt-1 text-sm text-red-600">{errors.phone_primary.message}</p>}
              </div>
            </div>

            <div className="sm:col-span-3">
               {!showSecondaryPhone ? (
                 <button
                   type="button"
                   onClick={() => setShowSecondaryPhone(true)}
                   className="mt-6 inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                 >
                   <Plus className="h-4 w-4 ml-2" />
                   إضافة هاتف آخر
                 </button>
               ) : (
                 <div>
                   <label htmlFor="phone_secondary" className="block text-sm font-medium text-gray-700 dark:text-gray-300 flex justify-between">
                     <span>هاتف ثانوي</span>
                     <button type="button" onClick={() => { setShowSecondaryPhone(false); setValue('phone_secondary', ''); }} className="text-red-500 hover:text-red-700">
                       <Minus className="h-4 w-4" />
                     </button>
                   </label>
                   <div className="mt-1">
                     <input
                       id="phone_secondary"
                       type="tel"
                       inputMode="tel"
                       pattern="[0-9]*"
                       {...register('phone_secondary')}
                       onKeyDown={(e) => handleKeyDown(e, 'phone_secondary', 'email_primary')}
                       onBlur={(e) => setValue('phone_secondary', smartFormatPhone(e.target.value))}
                       className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md p-2 border"
                       dir="ltr"
                     />
                   </div>
                 </div>
               )}
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="email_primary" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                البريد الإلكتروني
              </label>
              <div className="mt-1">
                <input
                  id="email_primary"
                  type="email"
                  {...register('email_primary')}
                  onKeyDown={(e) => handleKeyDown(e, 'email_primary', showSecondaryEmail ? 'email_secondary' : 'facebook_link')}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md p-2 border"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="sm:col-span-3">
               {!showSecondaryEmail ? (
                 <button
                   type="button"
                   onClick={() => setShowSecondaryEmail(true)}
                   className="mt-6 inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                 >
                   <Plus className="h-4 w-4 mr-2" />
                   Add Secondary Email
                 </button>
               ) : (
                 <div>
                   <label htmlFor="email_secondary" className="block text-sm font-medium text-gray-700 flex justify-between">
                     <span>Secondary Email</span>
                     <button type="button" onClick={() => { setShowSecondaryEmail(false); setValue('email_secondary', ''); }} className="text-red-500 hover:text-red-700">
                       <Minus className="h-4 w-4" />
                     </button>
                   </label>
                   <div className="mt-1">
                     <input
                       id="email_secondary"
                       type="email"
                       {...register('email_secondary')}
                       onKeyDown={(e) => handleKeyDown(e, 'email_secondary', 'facebook_link')}
                       className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                     />
                     {errors.email_secondary && <p className="mt-1 text-sm text-red-600">{errors.email_secondary.message}</p>}
                   </div>
                 </div>
               )}
            </div>

            <div className="sm:col-span-6">
              <label htmlFor="facebook_link" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                رابط فيسبوك
              </label>
              <div className="mt-1">
                <input
                  id="facebook_link"
                  type="url"
                  {...register('facebook_link')}
                  onKeyDown={(e) => handleKeyDown(e, 'facebook_link', 'governorate')}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md p-2 border"
                  placeholder="https://facebook.com/..."
                  dir="ltr"
                />
              </div>
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="governorate" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                المحافظة *
              </label>
              <div className="mt-1">
                <select
                  id="governorate"
                  {...register('governorate')}
                  onKeyDown={(e) => handleKeyDown(e, 'governorate', 'seat_class')}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md p-2 border"
                >
                  <option value="Minya">المنيا</option>
                  <option value="Asyut">أسيوط</option>
                  <option value="Sohag">سوهاج</option>
                  <option value="Qena">قنا</option>
                </select>
              </div>
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="seat_class" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                فئة المقعد *
              </label>
              <div className="mt-1">
                <select
                  id="seat_class"
                  {...register('seat_class')}
                  onKeyDown={(e) => handleKeyDown(e, 'seat_class', 'status')}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md p-2 border"
                >
                  <option value="A">فئة A (2000 ج.م)</option>
                  <option value="B">فئة B (1700 ج.م)</option>
                  <option value="C">فئة C (1500 ج.م)</option>
                </select>
              </div>
            </div>

            <div className="sm:col-span-6 border-t dark:border-gray-700 pt-6 mt-2">
              <h4 className="text-md font-medium text-gray-900 dark:text-white mb-4">حالة التسجيل</h4>
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    حالة العميل *
                  </label>
                  <div className="mt-1">
                    <select
                      id="status"
                      {...register('status')}
                      onKeyDown={(e) => handleKeyDown(e, 'status', status === 'registered' ? 'payment_type' : undefined)}
                      className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md p-2 border"
                    >
                      <option value="registered">مسجل (مطلوب دفع)</option>
                      <option value="interested">مهتم (لم يدفع بعد)</option>
                    </select>
                  </div>
                </div>

                {status === 'registered' && (
                  <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6 bg-gray-50 dark:bg-gray-700/50 p-4 rounded-md">
                    <div className="sm:col-span-3">
                      <label htmlFor="payment_type" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        نوع الدفع
                      </label>
                      <div className="mt-1">
                        <select
                          id="payment_type"
                          {...register('payment_type')}
                          onKeyDown={(e) => handleKeyDown(e, 'payment_type', 'payment_amount')}
                          className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md p-2 border"
                        >
                          <option value="deposit">عربون</option>
                          <option value="full">دفع كامل</option>
                        </select>
                      </div>
                    </div>

                    <div className="sm:col-span-3">
                      <label htmlFor="payment_amount" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        المبلغ المدفوع (ج.م)
                      </label>
                      <div className="mt-1">
                        <input
                          id="payment_amount"
                          type="number"
                          inputMode="decimal"
                          {...register('payment_amount', { valueAsNumber: true })}
                          onKeyDown={(e) => handleKeyDown(e, 'payment_amount', undefined)}
                          onWheel={(e) => e.currentTarget.blur()}
                          className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md p-2 border"
                        />
                      </div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        الإجمالي لفئة {seatClass}: {effectiveSeatPrice} ج.م
                      </p>
                    </div>
                    
                    {user?.role === 'owner' && (
                      <div className="sm:col-span-3">
                        <label htmlFor="ticket_price_override" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          سعر مخصص للتذكرة (اختياري)
                        </label>
                        <div className="mt-1">
                          <input
                            id="ticket_price_override"
                            type="number"
                            inputMode="decimal"
                            {...register('ticket_price_override', { valueAsNumber: true })}
                            onWheel={(e) => e.currentTarget.blur()}
                            className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md p-2 border"
                            placeholder={`الأساسي: ${SEAT_PRICES[seatClass]} ج.م`}
                          />
                        </div>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          يظهر هذا الحقل للمالك فقط. سيتم اعتماد السعر المخصص في الحسابات والمتبقي.
                        </p>
                      </div>
                    )}

                    <div className="sm:col-span-3">
                      <label htmlFor="certificate_included" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        الشهادة
                      </label>
                      {isCustomPrice ? (
                        <div className="mt-1">
                          <select
                            id="certificate_included"
                            {...register('certificate_included', { setValueAs: (v) => String(v) === 'true' })}
                            className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md p-2 border"
                          >
                            <option value="true">بشهادة</option>
                            <option value="false">بدون شهادة</option>
                          </select>
                        </div>
                      ) : (
                        <div className="mt-1 p-2 rounded-md border border-green-200 bg-green-50 text-green-700 text-sm">
                          إجباري بشهادة للفئات الأساسية A / B / C
                        </div>
                      )}
                    </div>

                    <div className="sm:col-span-3">
                      <label htmlFor="preferred_neighbor_name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        يريد الجلوس بجانب
                      </label>
                      <div className="mt-1">
                        <input
                          id="preferred_neighbor_name"
                          type="text"
                          {...register('preferred_neighbor_name')}
                          className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md p-2 border"
                          placeholder="اكتب اسم شخص من الحاضرين"
                        />
                      </div>
                    </div>

                    {currentGovCapacity > 0 && (
                      <div className="sm:col-span-3">
                        <label htmlFor="seat_number" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          رقم المقعد ({governorate})
                        </label>
                        <div className="mt-1">
                          <select
                            id="seat_number"
                            {...register('seat_number', { setValueAs: (v) => (v === '' ? undefined : Number(v)) })}
                            className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md p-2 border"
                          >
                            <option value="">اختر المقعد</option>
                            {availableSeatNumbers.map((seatNo) => (
                              <option key={seatNo} value={seatNo}>{seatClass}-{String(seatNo).padStart(3, '0')}</option>
                            ))}
                          </select>
                        </div>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          المتاح: {availableSeatNumbers.length} / {currentGovCapacity}
                        </p>
                      </div>
                    )}

                    <div className="sm:col-span-3">
                      <label htmlFor="sales_channel" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        مصدر التسجيل
                      </label>
                      <div className="mt-1">
                        <select
                          id="sales_channel"
                          {...register('sales_channel')}
                          className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md p-2 border"
                        >
                          <option value="direct">مباشر</option>
                          <option value="sales_team">تيم سيلز</option>
                          <option value="external_partner">شريك خارجي</option>
                          <option value="sponsor_referral">ترشيح راعي</option>
                        </select>
                      </div>
                    </div>

                    <div className="sm:col-span-3">
                      <label htmlFor="sales_source_name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        اسم المصدر / المندوب
                      </label>
                      <div className="mt-1">
                        <input
                          id="sales_source_name"
                          type="text"
                          {...register('sales_source_name')}
                          className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md p-2 border"
                          placeholder="اسم المندوب أو الشركة"
                        />
                      </div>
                    </div>

                    <div className="sm:col-span-3">
                      <label htmlFor="commission_amount" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        عمولة المصدر (ج.م)
                      </label>
                      <div className="mt-1">
                        <input
                          id="commission_amount"
                          type="number"
                          inputMode="decimal"
                          {...register('commission_amount', { valueAsNumber: true })}
                          onWheel={(e) => e.currentTarget.blur()}
                          className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md p-2 border"
                          placeholder={salesChannel === 'direct' ? '0' : '150 أو 200'}
                        />
                      </div>
                    </div>

                    <div className="sm:col-span-3">
                      <label htmlFor="commission_notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        ملاحظات العمولة
                      </label>
                      <div className="mt-1">
                        <input
                          id="commission_notes"
                          type="text"
                          {...register('commission_notes')}
                          className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md p-2 border"
                          placeholder="سبب أو مرجعية العمولة"
                        />
                      </div>
                    </div>

                    <div className="sm:col-span-6 bg-white dark:bg-gray-800 border border-indigo-100 dark:border-indigo-900 rounded-md p-3">
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        صافي دخل التذكرة بعد العمولة: <span className="font-bold text-indigo-600 dark:text-indigo-400">{netTicketAmount.toLocaleString()} ج.م</span>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="pt-5">
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="bg-white dark:bg-gray-700 py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="animate-spin ml-2 h-4 w-4" />
                    جاري الحفظ...
                  </>
                ) : (
                  'تسجيل المشترك'
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Register;
