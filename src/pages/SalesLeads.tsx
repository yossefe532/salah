import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, GOVERNORATE_CAPACITIES } from '../lib/api';
import { Attendee } from '../types';
import { Loader2 } from 'lucide-react';

type SalesResponse = {
  underReview: Attendee[];
  completedMine: Attendee[];
};

const maskPhone = (phone?: string) => {
  const value = String(phone || '');
  if (value.length <= 4) return '****';
  return `${value.slice(0, 2)}******${value.slice(-2)}`;
};

const SalesLeads: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SalesResponse>({ underReview: [], completedMine: [] });
  const [occupiedSeatsByClass, setOccupiedSeatsByClass] = useState<Record<'A' | 'B' | 'C', number[]>>({ A: [], B: [], C: [] });
  const [selectedLeadId, setSelectedLeadId] = useState<string>('');
  const [form, setForm] = useState({
    payment_type: 'deposit',
    payment_amount: '',
    seat_number: '',
    phone_secondary: '',
    email_secondary: '',
    job_title: '',
    profile_photo_url: '',
    sales_verified_full_name: false,
    sales_verified_phone: false,
    sales_verified_photo: false,
    sales_verified_job: false,
  });

  const selectedLead = useMemo(
    () => data.underReview.find(lead => lead.id === selectedLeadId) || null,
    [data.underReview, selectedLeadId]
  );

  const fetchLeads = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);
      const [response, attendeesResponse] = await Promise.all([
        api.get(`/leads/sales?userId=${user.id}`),
        api.get('/attendees'),
      ]);
      setData(response as SalesResponse);
      const attendees = Array.isArray(attendeesResponse) ? attendeesResponse : [];
      
      const currentGov = selectedLead?.governorate || 'Minya';
      setOccupiedSeatsByClass({
        A: attendees.filter((a: any) => a.governorate === currentGov && a.seat_class === 'A' && a.status === 'registered' && !a.is_deleted).map((a: any) => Number(a.seat_number)).filter((n: number) => Number.isInteger(n) && n > 0),
        B: attendees.filter((a: any) => a.governorate === currentGov && a.seat_class === 'B' && a.status === 'registered' && !a.is_deleted).map((a: any) => Number(a.seat_number)).filter((n: number) => Number.isInteger(n) && n > 0),
        C: attendees.filter((a: any) => a.governorate === currentGov && a.seat_class === 'C' && a.status === 'registered' && !a.is_deleted).map((a: any) => Number(a.seat_number)).filter((n: number) => Number.isInteger(n) && n > 0),
      });
      if ((response as SalesResponse).underReview?.length > 0 && !selectedLeadId) {
        setSelectedLeadId((response as SalesResponse).underReview[0].id);
      }
    } catch (e: any) {
      setError(e.message || 'فشل تحميل بيانات السالز');
    } finally {
      setLoading(false);
    }
  }, [selectedLeadId, user, selectedLead?.governorate]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const availableSeats = useMemo(() => {
    if (!selectedLead) return [];
    const capacity = (GOVERNORATE_CAPACITIES[selectedLead.governorate] as any)?.[selectedLead.seat_class] || 0;
    if (capacity <= 0) return [];
    const occupied = new Set(occupiedSeatsByClass[selectedLead.seat_class] || []);
    const list: number[] = [];
    for (let i = 1; i <= capacity; i += 1) {
      if (!occupied.has(i)) list.push(i);
    }
    return list;
  }, [occupiedSeatsByClass, selectedLead]);

  const capacity = useMemo(() => {
    if (!selectedLead) return 0;
    return (GOVERNORATE_CAPACITIES[selectedLead.governorate] as any)?.[selectedLead.seat_class] || 0;
  }, [selectedLead]);

  const canSubmit = form.sales_verified_full_name
    && form.sales_verified_phone
    && form.sales_verified_photo
    && form.sales_verified_job
    && Number(form.payment_amount) > 0;
    // Seat number is now optional, resolveSeat will handle random assignment if not provided

  const submitConversion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedLead) return;
    try {
      setSubmitting(true);
      setError(null);
      if (!canSubmit) throw new Error('يجب تأكيد كل عناصر checklist وتسجيل دفعة');

      await api.post('/sales-convert', {
        attendee_id: selectedLead.id,
        sales_user_id: user.id,
        payment_type: form.payment_type,
        payment_amount: Number(form.payment_amount || 0),
        seat_number: capacity > 0 ? Number(form.seat_number || 0) : null,
        phone_secondary: form.phone_secondary || null,
        email_secondary: form.email_secondary || null,
        job_title: form.job_title || null,
        profile_photo_url: form.profile_photo_url || null,
        sales_verified_full_name: form.sales_verified_full_name,
        sales_verified_phone: form.sales_verified_phone,
        sales_verified_photo: form.sales_verified_photo,
        sales_verified_job: form.sales_verified_job,
      });

      setForm({
        payment_type: 'deposit',
        payment_amount: '',
        seat_number: '',
        phone_secondary: '',
        email_secondary: '',
        job_title: '',
        profile_photo_url: '',
        sales_verified_full_name: false,
        sales_verified_phone: false,
        sales_verified_photo: false,
        sales_verified_job: false,
      });
      setSelectedLeadId('');
      await fetchLeads();
    } catch (e: any) {
      setError(e.message || 'فشل تحويل العميل');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Leads السالز</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">تراجع بيانات العميل، تؤكد checklist، ثم تسجل الدفع لتحويله لعميل فعلي.</p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 border border-red-200 rounded-md p-3 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-3">العملاء تحت المراجعة</h2>
              <div className="space-y-2 max-h-[420px] overflow-auto">
                {data.underReview.map(lead => (
                  <button
                    key={lead.id}
                    onClick={() => setSelectedLeadId(lead.id)}
                    className={`w-full text-right p-3 rounded-md border transition-colors ${
                      selectedLeadId === lead.id
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div className="font-semibold text-gray-900">{lead.full_name}</div>
                    <div className="text-xs text-gray-500 mt-1">{lead.phone_primary} • {lead.governorate} • {lead.seat_class}</div>
                    <div className="text-xs text-amber-600 mt-1">تحت المراجعة</div>
                  </button>
                ))}
                {data.underReview.length === 0 && (
                  <p className="text-sm text-gray-500">لا يوجد عملاء تحت المراجعة حاليًا.</p>
                )}
              </div>
            </div>

            <form onSubmit={submitConversion} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-4">
              <h2 className="font-semibold text-gray-900 dark:text-white">إتمام دورة العميل</h2>
              {selectedLead ? (
                <>
                  <div className="bg-gray-50 rounded-md p-3 text-sm">
                    <p className="font-bold text-gray-900">{selectedLead.full_name}</p>
                    <p className="text-gray-600">{selectedLead.phone_primary} • {selectedLead.governorate} • Class {selectedLead.seat_class}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <select value={form.payment_type} onChange={(e) => setForm(prev => ({ ...prev, payment_type: e.target.value }))} className="border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white">
                      <option value="deposit">عربون</option>
                      <option value="full">دفع كامل</option>
                    </select>
                    <input value={form.payment_amount} onChange={(e) => setForm(prev => ({ ...prev, payment_amount: e.target.value }))} type="number" className="border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white" placeholder="المبلغ المدفوع" />
                    {capacity > 0 && (
                      <select value={form.seat_number} onChange={(e) => setForm(prev => ({ ...prev, seat_number: e.target.value }))} className="border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white">
                        <option value="">اختر المقعد</option>
                        {availableSeats.map((seatNo) => (
                          <option key={seatNo} value={seatNo}>{selectedLead.seat_class}-{String(seatNo).padStart(3, '0')}</option>
                        ))}
                      </select>
                    )}
                    <input value={form.phone_secondary} onChange={(e) => setForm(prev => ({ ...prev, phone_secondary: e.target.value }))} className="border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white" placeholder="رقم إضافي (اختياري)" />
                    <input value={form.email_secondary} onChange={(e) => setForm(prev => ({ ...prev, email_secondary: e.target.value }))} className="border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white" placeholder="إيميل إضافي (اختياري)" />
                    <input value={form.job_title} onChange={(e) => setForm(prev => ({ ...prev, job_title: e.target.value }))} className="border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white" placeholder="الوظيفة" />
                    <input value={form.profile_photo_url} onChange={(e) => setForm(prev => ({ ...prev, profile_photo_url: e.target.value }))} className="border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white" placeholder="رابط الصورة الشخصية" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={form.sales_verified_full_name} onChange={(e) => setForm(prev => ({ ...prev, sales_verified_full_name: e.target.checked }))} /> تم تأكيد الاسم الثلاثي</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={form.sales_verified_phone} onChange={(e) => setForm(prev => ({ ...prev, sales_verified_phone: e.target.checked }))} /> تم تأكيد رقم الهاتف</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={form.sales_verified_photo} onChange={(e) => setForm(prev => ({ ...prev, sales_verified_photo: e.target.checked }))} /> تم أخذ صورة شخصية</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={form.sales_verified_job} onChange={(e) => setForm(prev => ({ ...prev, sales_verified_job: e.target.checked }))} /> تم تسجيل الوظيفة</label>
                  </div>

                  <div className="bg-indigo-50 border border-indigo-100 rounded-md p-3 text-sm">
                    عمولة الدورة ثابتة تلقائيًا: 100 ج.م (50 سوشيال + 50 سالز)
                  </div>
                  {capacity > 0 && (
                    <div className="text-xs text-gray-500">
                      المقاعد المتاحة لفئة {selectedLead.seat_class} في {selectedLead.governorate}: {availableSeats.length} / {capacity}
                    </div>
                  )}

                  <button disabled={submitting || !canSubmit} className="w-full bg-indigo-600 text-white rounded-md p-2 disabled:opacity-50">
                    {submitting ? 'جاري التحويل...' : 'تحويل لعميل فعلي وتوزيع العمولة'}
                  </button>
                </>
              ) : (
                <p className="text-sm text-gray-500">اختر عميلًا من قائمة تحت المراجعة.</p>
              )}
            </form>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-3">العملاء المنتهين بمعرفتك (بيانات محجوبة)</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-right border-b dark:border-gray-700">
                    <th className="py-2">الاسم</th>
                    <th className="py-2">الهاتف</th>
                    <th className="py-2">المحافظة</th>
                    <th className="py-2">حالة الدفع</th>
                    <th className="py-2">عمولة السالز</th>
                  </tr>
                </thead>
                <tbody>
                  {data.completedMine.map(lead => (
                    <tr key={lead.id} className="border-b dark:border-gray-700">
                      <td className="py-2 text-gray-900 dark:text-white">{lead.full_name}</td>
                      <td className="py-2 text-gray-600 dark:text-gray-300">{maskPhone(lead.phone_primary)}</td>
                      <td className="py-2 text-gray-600 dark:text-gray-300">{lead.governorate}</td>
                      <td className="py-2 text-emerald-600 font-medium">تم الدفع</td>
                      <td className="py-2 text-indigo-600 font-medium">{Number(lead.sales_commission_amount || 0).toLocaleString()} ج.م</td>
                    </tr>
                  ))}
                  {data.completedMine.length === 0 && (
                    <tr>
                      <td className="py-3 text-gray-500" colSpan={5}>لا توجد حالات مكتملة بعد.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SalesLeads;
