import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Loader2, Save, ArrowRight, Plus, Minus } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Attendee, Governorate, SeatClass, PaymentType } from '../types';

const schema = z.object({
  full_name: z.string().min(3, 'الاسم يجب أن يكون 3 أحرف على الأقل'),
  phone_primary: z.string().min(10, 'رقم الهاتف غير صالح'),
  phone_secondary: z.string().optional().or(z.literal('')),
  email_primary: z.string().email('بريد إلكتروني غير صالح').optional().or(z.literal('')),
  email_secondary: z.string().email('بريد إلكتروني غير صالح').optional().or(z.literal('')),
  facebook_link: z.string().url('رابط غير صالح').optional().or(z.literal('')),
  governorate: z.enum(['Minya', 'Asyut', 'Sohag', 'Qena']),
  seat_class: z.enum(['A', 'B', 'C']),
  status: z.enum(['interested', 'registered']),
  payment_type: z.enum(['deposit', 'full']).optional(),
  payment_amount: z.number().min(0).optional(),
});

type FormData = z.infer<typeof schema>;

const SEAT_PRICES = {
  A: 2000,
  B: 1700,
  C: 1500,
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

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
        governorate: 'Minya',
        seat_class: 'B',
        status: 'registered',
        payment_type: 'deposit',
        payment_amount: 0,
    }
  });

  const status = watch('status');
  const seatClass = watch('seat_class');
  const paymentType = watch('payment_type');

  useEffect(() => {
    const fetchAttendee = async () => {
      try {
        const data: Attendee = await api.get(`/attendees/${id}`);
        reset({
          full_name: data.full_name,
          phone_primary: data.phone_primary,
          phone_secondary: data.phone_secondary || '',
          email_primary: data.email_primary || '',
          email_secondary: data.email_secondary || '',
          facebook_link: data.facebook_link || '',
          governorate: data.governorate,
          seat_class: data.seat_class,
          status: data.status,
          payment_type: data.payment_type || 'deposit',
          payment_amount: data.payment_amount || 0,
        });
        if (data.phone_secondary) setShowSecondaryPhone(true);
        if (data.email_secondary) setShowSecondaryEmail(true);
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
      setValue('payment_amount', SEAT_PRICES[seatClass]);
    }
  }, [status, seatClass, paymentType, setValue]);

  const onSubmit = async (data: FormData) => {
    if (!user || !id) return;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const updatedAttendee = {
          ...data,
          payment_type: data.status === 'registered' ? data.payment_type : 'deposit',
          payment_amount: data.status === 'registered' ? Number(data.payment_amount) : 0,
          phone_secondary: data.phone_secondary || null,
          email_primary: data.email_primary || null,
          email_secondary: data.email_secondary || null,
          facebook_link: data.facebook_link || null,
          
          remaining_amount: (data.status === 'registered') 
            ? Math.max(0, SEAT_PRICES[data.seat_class] - (Number(data.payment_amount) || 0))
            : SEAT_PRICES[data.seat_class],
          
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
                        <span>إجمالي سعر الفئة {seatClass}: {seatClass ? SEAT_PRICES[seatClass as keyof typeof SEAT_PRICES] : 0} ج.م</span>
                        <span className="font-bold text-red-600">
                            المتبقي: {seatClass ? Math.max(0, SEAT_PRICES[seatClass as keyof typeof SEAT_PRICES] - (watch('payment_amount') || 0)) : 0} ج.م
                        </span>
                      </p>
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