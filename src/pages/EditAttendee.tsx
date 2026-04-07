import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { api, GOVERNORATE_CAPACITIES } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Loader2, Save, ArrowRight, Plus, Minus } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Attendee, Governorate, SeatClass, PaymentType } from '../types';

const schema = z.object({
  full_name: z.string().min(3, 'الاسم يجب أن يكون 3 أحرف على الأقل'),
  full_name_en: z.string().optional(),
  phone_primary: z.string().min(10, 'رقم الهاتف غير صالح'),
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

const EditAttendee: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showSecondaryPhone, setShowSecondaryPhone] = useState(false);
  const [showSecondaryEmail, setShowSecondaryEmail] = useState(false);
  const [occupiedSeats, setOccupiedSeats] = useState<number[]>([]);
  const [englishNameEdited, setEnglishNameEdited] = useState(false);

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
        governorate: 'Minya',
        seat_class: 'B',
        status: 'registered',
        payment_type: 'deposit',
        payment_amount: 0,
        sales_channel: 'direct',
        commission_amount: 0,
        certificate_included: true,
        full_name_en: '',
    }
  });

  const status = watch('status');
  const fullName = watch('full_name');
  const fullNameEn = watch('full_name_en');
  const governorate = watch('governorate');
  const seatClass = watch('seat_class');
  const paymentType = watch('payment_type');
  const selectedSeatNumber = watch('seat_number');
  const paymentAmount = Number(watch('payment_amount') || 0);
  const commissionAmount = Number(watch('commission_amount') || 0);
  const netTicketAmount = Math.max(0, paymentAmount - commissionAmount);
  const ticketPriceOverride = watch('ticket_price_override') as number | undefined;
  const isCustomPrice = !!(ticketPriceOverride && user?.role === 'owner' && Number(ticketPriceOverride) > 0);
  const currentGovCapacity = (GOVERNORATE_CAPACITIES[governorate] as any)?.[seatClass] || 0;
  const effectiveSeatPrice = isCustomPrice ? Number(ticketPriceOverride) : SEAT_PRICES[seatClass as keyof typeof SEAT_PRICES];
  const availableSeatNumbers = React.useMemo(() => {
    if (status !== 'registered' || currentGovCapacity <= 0) return [];
    const occupied = new Set(occupiedSeats);
    const result: number[] = [];
    for (let i = 1; i <= currentGovCapacity; i += 1) {
      if (!occupied.has(i) || i === Number(selectedSeatNumber)) result.push(i);
    }
    return result;
  }, [currentGovCapacity, occupiedSeats, selectedSeatNumber, status]);

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
          payment_type: data.payment_type || 'deposit',
          payment_amount: data.payment_amount || 0,
          sales_channel: data.sales_channel || 'direct',
          sales_source_name: data.sales_source_name || '',
          commission_amount: data.commission_amount || 0,
          commission_notes: data.commission_notes || '',
          ticket_price_override: data.ticket_price_override || undefined,
          certificate_included: data.certificate_included ?? true,
          preferred_neighbor_name: data.preferred_neighbor_name || '',
        });
        if (data.phone_secondary) setShowSecondaryPhone(true);
        if (data.email_secondary) setShowSecondaryEmail(true);
        setEnglishNameEdited(Boolean(data.full_name_en));
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
        setOccupiedSeats([]);
        setValue('seat_number', undefined);
        return;
      }
      const response = await api.get('/attendees');
      const attendees = Array.isArray(response) ? response : [];
      const seats = attendees
        .filter((a: any) => a.governorate === governorate && a.seat_class === seatClass && a.status === 'registered' && !a.is_deleted && a.id !== id)
        .map((a: any) => Number(a.seat_number))
        .filter((n: number) => Number.isInteger(n) && n > 0);
      setOccupiedSeats(seats);
      if (selectedSeatNumber && seats.includes(Number(selectedSeatNumber))) {
        setValue('seat_number', undefined);
      }
    };
    loadSeats();
  }, [governorate, id, seatClass, selectedSeatNumber, setValue, status]);

  const onSubmit = async (data: FormData) => {
    if (!user || !id) return;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const capacity = (GOVERNORATE_CAPACITIES[data.governorate] as any)?.[data.seat_class] || 0;
      const baseTicketPrice = isCustomPrice ? Number(data.ticket_price_override) : SEAT_PRICES[data.seat_class];
      const certificateIncluded = isCustomPrice ? !!data.certificate_included : true;
      const fullNameEnFinal = String(data.full_name_en || '').trim() || transliterateArabicToEnglish(data.full_name);
      // Seat number is now optional, resolveSeat will pick a random one if not provided
      const updatedAttendee = {
          ...data,
          full_name_en: fullNameEnFinal,
          payment_type: data.status === 'registered' ? data.payment_type : 'deposit',
          payment_amount: data.status === 'registered' ? Number(data.payment_amount) : 0,
          sales_channel: data.sales_channel,
          seat_number: data.status === 'registered' && capacity > 0 ? Number(data.seat_number) : null,
          base_ticket_price: baseTicketPrice,
          certificate_included: certificateIncluded,
          preferred_neighbor_name: data.preferred_neighbor_name || null,
          sales_source_name: data.sales_source_name || null,
          commission_amount: data.status === 'registered'
            ? Math.max(0, Math.min(Number(data.commission_amount || 0), Number(data.payment_amount || 0)))
            : 0,
          commission_notes: data.commission_notes || null,
          phone_secondary: data.phone_secondary || null,
          email_primary: data.email_primary || null,
          email_secondary: data.email_secondary || null,
          facebook_link: data.facebook_link || null,
          
          remaining_amount: (data.status === 'registered') 
            ? Math.max(0, baseTicketPrice - (Number(data.payment_amount) || 0))
            : baseTicketPrice,
          
          updated_at: new Date().toISOString(),
      };

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

            <div className="sm:col-span-3">
              <label className="block text-sm font-medium text-gray-700">رقم الهاتف الأساسي *</label>
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

                    {currentGovCapacity > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">رقم المقعد ({governorate})</label>
                        <select
                          {...register('seat_number', { setValueAs: (v) => (v === '' ? undefined : Number(v)) })}
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
                        >
                          <option value="">اختر المقعد</option>
                          {availableSeatNumbers.map((seatNo) => (
                            <option key={seatNo} value={seatNo}>{seatClass}-{String(seatNo).padStart(3, '0')}</option>
                          ))}
                        </select>
                        <p className="mt-1 text-xs text-gray-500">
                          المتاح: {availableSeatNumbers.length} / {currentGovCapacity}
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
                          {...register('ticket_price_override', { valueAsNumber: true })}
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
                      <input
                        type="text"
                        {...register('preferred_neighbor_name')}
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
                        placeholder="اكتب اسم شخص من الحاضرين"
                      />
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
