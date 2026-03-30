import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, GOVERNORATE_CAPACITIES } from '../lib/api';
import { Attendee, Governorate, OccupationType, SeatClass } from '../types';
import { Loader2, Plus } from 'lucide-react';

const SocialMediaLeads: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leads, setLeads] = useState<Attendee[]>([]);
  const [occupiedSeatsByClass, setOccupiedSeatsByClass] = useState<Record<'A' | 'B' | 'C', number[]>>({ A: [], B: [], C: [] });
  const [form, setForm] = useState({
    full_name: '',
    phone_primary: '',
    governorate: 'Minya' as Governorate,
    seat_class: 'B' as SeatClass,
    occupation_type: 'employee' as OccupationType,
    organization_name: '',
    job_title: '',
    university: '',
    faculty: '',
    year: '',
    notes: '',
  });
  const [selectedLeadId, setSelectedLeadId] = useState<string>('');

  const fetchLeads = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);
      const [data, attendeesData] = await Promise.all([
        api.get(`/leads/social?userId=${user.id}`),
        api.get('/attendees')
      ]);
      setLeads(Array.isArray(data) ? data : []);
      const all = Array.isArray(attendeesData) ? attendeesData : [];
      setOccupiedSeatsByClass({
        A: all.filter((a: any) => a.governorate === form.governorate && a.seat_class === 'A' && a.status === 'registered' && !a.is_deleted).map((a: any) => Number(a.seat_number)).filter((n: number) => Number.isInteger(n) && n > 0),
        B: all.filter((a: any) => a.governorate === form.governorate && a.seat_class === 'B' && a.status === 'registered' && !a.is_deleted).map((a: any) => Number(a.seat_number)).filter((n: number) => Number.isInteger(n) && n > 0),
        C: all.filter((a: any) => a.governorate === form.governorate && a.seat_class === 'C' && a.status === 'registered' && !a.is_deleted).map((a: any) => Number(a.seat_number)).filter((n: number) => Number.isInteger(n) && n > 0),
      });
    } catch (e: any) {
      setError(e.message || 'فشل تحميل العملاء');
    } finally {
      setLoading(false);
    }
  }, [user, form.governorate]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const stats = useMemo(() => {
    const total = leads.length;
    const underReview = leads.filter(lead => lead.lead_status === 'under_review').length;
    const completed = leads.filter(lead => lead.lead_status === 'sales_completed').length;
    return { total, underReview, completed };
  }, [leads]);
  const selectedLead = useMemo(() => leads.find(l => l.id === selectedLeadId) || null, [leads, selectedLeadId]);
  const selectedLeadSeatOptions = useMemo(() => {
    if (!selectedLead) return [];
    const cap = (GOVERNORATE_CAPACITIES[selectedLead.governorate] as any)?.[selectedLead.seat_class] || 0;
    if (cap <= 0) return [];
    const occupied = new Set(occupiedSeatsByClass[selectedLead.seat_class] || []);
    const seats: number[] = [];
    for (let i = 1; i <= cap; i += 1) {
      if (!occupied.has(i)) seats.push(i);
    }
    return seats;
  }, [occupiedSeatsByClass, selectedLead]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      setSubmitting(true);
      setError(null);
      if (!form.full_name.trim()) throw new Error('الاسم مطلوب');
      if (!form.phone_primary.trim()) throw new Error('رقم الهاتف مطلوب');

      await api.post('/social-leads', {
        ...form,
        created_by: user.id,
        social_agent_name: user.full_name || user.email,
      });

      setForm({
        full_name: '',
        phone_primary: '',
        governorate: 'Minya',
        seat_class: 'B',
        occupation_type: 'employee',
        organization_name: '',
        job_title: '',
        university: '',
        faculty: '',
        year: '',
        notes: '',
      });
      await fetchLeads();
    } catch (e: any) {
      setError(e.message || 'فشل إضافة العميل');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Leads السوشيال ميديا</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">تسجّل بيانات العميل أولًا، ويظهر لاحقًا للسالز تحت المراجعة.</p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 border border-red-200 rounded-md p-3 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">إجمالي عملائي</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">تحت المراجعة</p>
          <p className="text-xl font-bold text-amber-600">{stats.underReview}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">تم إنهاؤهم بواسطة السالز</p>
          <p className="text-xl font-bold text-emerald-600">{stats.completed}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Plus className="w-5 h-5 text-indigo-600" />
          <h2 className="font-semibold text-gray-900 dark:text-white">إضافة Lead جديد</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <input value={form.full_name} onChange={(e) => setForm(prev => ({ ...prev, full_name: e.target.value }))} className="border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white" placeholder="الاسم الثلاثي" />
          <input value={form.phone_primary} onChange={(e) => setForm(prev => ({ ...prev, phone_primary: e.target.value }))} className="border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white" placeholder="رقم الهاتف" />
          <select value={form.governorate} onChange={(e) => setForm(prev => ({ ...prev, governorate: e.target.value as Governorate }))} className="border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white">
            <option value="Minya">المنيا</option>
            <option value="Asyut">أسيوط</option>
            <option value="Sohag">سوهاج</option>
            <option value="Qena">قنا</option>
          </select>
          <select value={form.seat_class} onChange={(e) => setForm(prev => ({ ...prev, seat_class: e.target.value as SeatClass }))} className="border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white">
            <option value="A">Class A</option>
            <option value="B">Class B</option>
            <option value="C">Class C</option>
          </select>
          <select value={form.occupation_type} onChange={(e) => setForm(prev => ({ ...prev, occupation_type: e.target.value as OccupationType }))} className="border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white">
            <option value="student">طالب</option>
            <option value="employee">موظف</option>
            <option value="business_owner">صاحب عمل</option>
            <option value="executive">تنفيذي</option>
          </select>
          {form.occupation_type === 'student' ? (
            <>
              <input value={form.university} onChange={(e) => setForm(prev => ({ ...prev, university: e.target.value }))} className="border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white" placeholder="الجامعة" />
              <input value={form.faculty} onChange={(e) => setForm(prev => ({ ...prev, faculty: e.target.value }))} className="border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white" placeholder="الكلية" />
              <input value={form.year} onChange={(e) => setForm(prev => ({ ...prev, year: e.target.value }))} className="border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white" placeholder="السنة" />
            </>
          ) : (
            <>
              <input value={form.organization_name} onChange={(e) => setForm(prev => ({ ...prev, organization_name: e.target.value }))} className="border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white" placeholder="جهة العمل" />
              <input value={form.job_title} onChange={(e) => setForm(prev => ({ ...prev, job_title: e.target.value }))} className="border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white" placeholder="المسمى الوظيفي" />
            </>
          )}
          <input value={form.notes} onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))} className="border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white" placeholder="ملاحظات" />
        </div>
        <button disabled={submitting} className="bg-indigo-600 text-white px-4 py-2 rounded-md disabled:opacity-50">
          {submitting ? 'جاري الإضافة...' : 'حفظ Lead'}
        </button>
      </form>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-3">عملاؤك</h2>
        {loading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-right border-b dark:border-gray-700">
                  <th className="py-2">الاسم</th>
                  <th className="py-2">الهاتف</th>
                  <th className="py-2">المحافظة</th>
                  <th className="py-2">Class</th>
                  <th className="py-2">الحالة</th>
                  <th className="py-2">عمولة السوشيال</th>
                  <th className="py-2">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {leads.map(lead => (
                  <tr key={lead.id} className="border-b dark:border-gray-700">
                    <td className="py-2 text-gray-900 dark:text-white">{lead.full_name}</td>
                    <td className="py-2 text-gray-600 dark:text-gray-300">{lead.phone_primary}</td>
                    <td className="py-2 text-gray-600 dark:text-gray-300">{lead.governorate}</td>
                    <td className="py-2 text-gray-600 dark:text-gray-300">{lead.seat_class}</td>
                    <td className="py-2">
                      {lead.lead_status === 'sales_completed' ? (
                        <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-700">تم بواسطة السالز</span>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-xs bg-amber-100 text-amber-700">تحت المراجعة</span>
                      )}
                    </td>
                    <td className="py-2 text-indigo-600 font-medium">
                      {lead.commission_distributed ? `${Number(lead.social_commission_amount || 0).toLocaleString()} ج.م` : 'قيد الانتظار'}
                    </td>
                    <td className="py-2">
                      <button
                        className="text-sm px-3 py-1 rounded-md border border-indigo-500 text-indigo-600 hover:bg-indigo-50"
                        onClick={() => setSelectedLeadId(lead.id)}
                      >
                        تسجيل عربون
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {selectedLeadId && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const amountInput = (document.getElementById('social_deposit_amount') as HTMLInputElement);
            const seatInput = (document.getElementById('social_deposit_seat') as HTMLSelectElement);
            const amount = Number(amountInput?.value || 0);
            const seat = seatInput?.value ? Number(seatInput.value) : null;
            const lead = leads.find(l => l.id === selectedLeadId);
            if (!lead) return;
            if (amount <= 0) {
              alert('قيمة العربون يجب أن تكون أكبر من صفر');
              return;
            }
            const capacity = (GOVERNORATE_CAPACITIES[lead.governorate] as any)?.[lead.seat_class] || 0;
            // Seat number is optional, resolveSeat will handle random assignment if not provided
            setSubmitting(true);
            try {
              await api.post('/social-deposit', {
                attendee_id: lead.id,
                social_user_id: user?.id,
                payment_amount: amount,
                seat_number: capacity > 0 ? seat : null,
              });
              setSelectedLeadId('');
              await fetchLeads();
            } catch (err: any) {
              alert(err.message || 'فشل تسجيل العربون');
            } finally {
              setSubmitting(false);
            }
          }}
          className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-3"
        >
          <h2 className="font-semibold text-gray-900 dark:text-white">تسجيل دفعة عربون للسوشيال</h2>
          <input
            id="social_deposit_amount"
            type="number"
            className="w-full border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white"
            placeholder="قيمة العربون (ج.م)"
          />
          <select
            id="social_deposit_seat"
            className="w-full border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white"
          >
            <option value="">اختر المقعد (اختياري ما لم تكن هناك مقاعد محددة)</option>
            {selectedLeadSeatOptions.map((seatNo) => (
              <option key={seatNo} value={seatNo}>
                {selectedLead?.seat_class}-{String(seatNo).padStart(3, '0')}
              </option>
            ))}
          </select>
          <div className="text-xs text-gray-500">عمولة السوشيال ستكون 70 ج.م تلقائيًا.</div>
          <div className="flex gap-3">
            <button type="submit" disabled={submitting} className="bg-indigo-600 text-white px-4 py-2 rounded-md disabled:opacity-50">
              {submitting ? 'جاري التسجيل...' : 'حفظ دفعة العربون'}
            </button>
            <button type="button" onClick={() => setSelectedLeadId('')} className="px-4 py-2 rounded-md border">إلغاء</button>
          </div>
        </form>
      )}
    </div>
  );
};

export default SocialMediaLeads;
