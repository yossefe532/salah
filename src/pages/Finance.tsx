import React, { useCallback, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/api';
import { Attendee, Expense, ExpenseCategory, Sponsor, SponsorContract, SponsorPayment, User } from '../types';
import { Loader2 } from 'lucide-react';

const toNumber = (value: any) => Number(value || 0);
const isMissingTableError = (err: any) => {
  const msg = String(err?.message || '');
  return msg.includes("Could not find the table") || msg.includes("schema cache");
};

const Finance: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [contracts, setContracts] = useState<SponsorContract[]>([]);
  const [payments, setPayments] = useState<SponsorPayment[]>([]);
  const [commissionUsers, setCommissionUsers] = useState<User[]>([]);
  const [expenseForm, setExpenseForm] = useState({
    title: '',
    amount: '',
    category_id: '',
    expense_date: new Date().toISOString().slice(0, 16),
    notes: '',
  });
  const [sponsorForm, setSponsorForm] = useState({
    company_name: '',
    contact_name: '',
    phone: '',
    email: '',
  });
  const [contractForm, setContractForm] = useState({
    sponsor_id: '',
    contract_title: '',
    contract_amount: '',
    paid_amount: '',
    due_date: '',
    notes: '',
  });
  const [paymentForm, setPaymentForm] = useState({
    sponsor_contract_id: '',
    amount: '',
    paid_at: new Date().toISOString().slice(0, 16),
    notes: '',
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: attendeesData, error: attendeesErr } = await supabase.from('attendees').select('*').eq('is_deleted', false);
      if (attendeesErr) throw attendeesErr;
      setAttendees((attendeesData || []) as Attendee[]);

      const { data: expensesData, error: expensesErr } = await supabase.from('expenses').select('*, expense_categories(*)').order('expense_date', { ascending: false });
      setExpenses(isMissingTableError(expensesErr) ? [] : ((expensesData || []) as Expense[]));

      const { data: categoriesData, error: categoriesErr } = await supabase.from('expense_categories').select('*').eq('is_active', true).order('name');
      setCategories(isMissingTableError(categoriesErr) ? [] : ((categoriesData || []) as ExpenseCategory[]));

      const { data: sponsorsData, error: sponsorsErr } = await supabase.from('sponsors').select('*').order('created_at', { ascending: false });
      setSponsors(isMissingTableError(sponsorsErr) ? [] : ((sponsorsData || []) as Sponsor[]));

      const { data: contractsData, error: contractsErr } = await supabase.from('sponsor_contracts').select('*, sponsors(*)').order('created_at', { ascending: false });
      setContracts(isMissingTableError(contractsErr) ? [] : ((contractsData || []) as SponsorContract[]));

      const { data: paymentsData, error: paymentsErr } = await supabase.from('sponsor_payments').select('*').order('paid_at', { ascending: false });
      setPayments(isMissingTableError(paymentsErr) ? [] : ((paymentsData || []) as SponsorPayment[]));

      const { data: usersData, error: usersErr } = await supabase
        .from('users')
        .select('id, full_name, email, role, commission_balance, created_at')
        .in('role', ['social_media', 'sales']);
      setCommissionUsers(usersErr ? [] : ((usersData || []) as User[]));
    } catch (e: any) {
      setError(e.message || 'فشل تحميل بيانات الحسابات');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const metrics = useMemo(() => {
    const ticketCollected = attendees.reduce((sum, attendee) => sum + toNumber(attendee.payment_amount), 0);
    const ticketCommission = attendees.reduce((sum, attendee) => sum + toNumber(attendee.commission_amount), 0);
    const ticketNet = Math.max(0, ticketCollected - ticketCommission);
    const ticketReceivable = attendees.reduce((sum, attendee) => sum + toNumber(attendee.remaining_amount), 0);
    const sponsorContractTotal = contracts.reduce((sum, contract) => sum + toNumber(contract.contract_amount), 0);
    const sponsorPaid = contracts.reduce((sum, contract) => sum + toNumber(contract.paid_amount), 0);
    const sponsorReceivable = Math.max(0, sponsorContractTotal - sponsorPaid);
    const expenseTotal = expenses.reduce((sum, expense) => sum + toNumber(expense.amount), 0);
    const totalInflows = ticketNet + sponsorPaid;
    const currentBalance = totalInflows - expenseTotal;
    const totalReceivable = ticketReceivable + sponsorReceivable;
    const totalRights = currentBalance + totalReceivable;
    const socialWallet = commissionUsers
      .filter(userItem => userItem.role === 'social_media')
      .reduce((sum, userItem) => sum + toNumber(userItem.commission_balance), 0);
    const salesWallet = commissionUsers
      .filter(userItem => userItem.role === 'sales')
      .reduce((sum, userItem) => sum + toNumber(userItem.commission_balance), 0);

    return {
      ticketCollected,
      ticketCommission,
      ticketNet,
      ticketReceivable,
      sponsorContractTotal,
      sponsorPaid,
      sponsorReceivable,
      expenseTotal,
      totalInflows,
      currentBalance,
      totalReceivable,
      totalRights,
      socialWallet,
      salesWallet,
    };
  }, [attendees, commissionUsers, contracts, expenses]);

  const submitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      setSubmitting(true);
      setError(null);
      const amount = toNumber(expenseForm.amount);
      if (amount <= 0) throw new Error('قيمة المصروف يجب أن تكون أكبر من صفر');

      const payload = {
        title: expenseForm.title.trim(),
        amount,
        category_id: expenseForm.category_id || null,
        expense_date: expenseForm.expense_date,
        notes: expenseForm.notes.trim() || null,
        created_by: user.id,
      };

      if (!payload.title) throw new Error('أدخل عنوان المصروف');

      const { error: insertError } = await supabase.from('expenses').insert([payload]);
      if (insertError) throw insertError;

      setExpenseForm({
        title: '',
        amount: '',
        category_id: '',
        expense_date: new Date().toISOString().slice(0, 16),
        notes: '',
      });
      await loadData();
    } catch (e: any) {
      setError(e.message || 'فشل إضافة المصروف');
    } finally {
      setSubmitting(false);
    }
  };

  const submitSponsor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError(null);
      if (!sponsorForm.company_name.trim()) throw new Error('اسم الشركة مطلوب');

      const { error: insertError } = await supabase.from('sponsors').insert([{
        company_name: sponsorForm.company_name.trim(),
        contact_name: sponsorForm.contact_name.trim() || null,
        phone: sponsorForm.phone.trim() || null,
        email: sponsorForm.email.trim() || null,
      }]);
      if (insertError) throw insertError;

      setSponsorForm({
        company_name: '',
        contact_name: '',
        phone: '',
        email: '',
      });
      await loadData();
    } catch (e: any) {
      setError(e.message || 'فشل إضافة الراعي');
    } finally {
      setSubmitting(false);
    }
  };

  const submitContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      setSubmitting(true);
      setError(null);
      const contractAmount = toNumber(contractForm.contract_amount);
      const paidAmount = toNumber(contractForm.paid_amount);
      if (!contractForm.sponsor_id) throw new Error('اختر شركة راعية');
      if (!contractForm.contract_title.trim()) throw new Error('أدخل عنوان العقد');
      if (contractAmount <= 0) throw new Error('قيمة العقد يجب أن تكون أكبر من صفر');
      if (paidAmount < 0) throw new Error('المدفوع لا يمكن أن يكون سالب');
      if (paidAmount > contractAmount) throw new Error('المدفوع لا يمكن أن يتجاوز قيمة العقد');

      const { data: insertedContract, error: contractError } = await supabase
        .from('sponsor_contracts')
        .insert([{
          sponsor_id: contractForm.sponsor_id,
          contract_title: contractForm.contract_title.trim(),
          contract_amount: contractAmount,
          paid_amount: paidAmount,
          due_date: contractForm.due_date || null,
          notes: contractForm.notes.trim() || null,
          created_by: user.id,
          signed_at: new Date().toISOString(),
        }])
        .select()
        .single();

      if (contractError) throw contractError;

      if (paidAmount > 0 && insertedContract) {
        const { error: paymentError } = await supabase.from('sponsor_payments').insert([{
          sponsor_contract_id: insertedContract.id,
          amount: paidAmount,
          paid_at: new Date().toISOString(),
          notes: 'دفعة أولى مع إنشاء العقد',
          recorded_by: user.id,
        }]);
        if (paymentError) throw paymentError;
      }

      setContractForm({
        sponsor_id: '',
        contract_title: '',
        contract_amount: '',
        paid_amount: '',
        due_date: '',
        notes: '',
      });
      await loadData();
    } catch (e: any) {
      setError(e.message || 'فشل إضافة العقد');
    } finally {
      setSubmitting(false);
    }
  };

  const submitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      setSubmitting(true);
      setError(null);
      const amount = toNumber(paymentForm.amount);
      if (!paymentForm.sponsor_contract_id) throw new Error('اختر العقد');
      if (amount <= 0) throw new Error('قيمة الدفعة يجب أن تكون أكبر من صفر');

      const selectedContract = contracts.find(contract => contract.id === paymentForm.sponsor_contract_id);
      if (!selectedContract) throw new Error('العقد غير موجود');

      const remainingBefore = toNumber(selectedContract.contract_amount) - toNumber(selectedContract.paid_amount);
      if (amount > remainingBefore) throw new Error(`الدفعة أكبر من المتبقي (${remainingBefore.toLocaleString()} ج.م)`);

      const { error: paymentError } = await supabase.from('sponsor_payments').insert([{
        sponsor_contract_id: paymentForm.sponsor_contract_id,
        amount,
        paid_at: paymentForm.paid_at,
        notes: paymentForm.notes.trim() || null,
        recorded_by: user.id,
      }]);
      if (paymentError) throw paymentError;

      const newPaidAmount = toNumber(selectedContract.paid_amount) + amount;
      const { error: updateError } = await supabase
        .from('sponsor_contracts')
        .update({ paid_amount: newPaidAmount })
        .eq('id', paymentForm.sponsor_contract_id);
      if (updateError) throw updateError;

      setPaymentForm({
        sponsor_contract_id: '',
        amount: '',
        paid_at: new Date().toISOString().slice(0, 16),
        notes: '',
      });
      await loadData();
    } catch (e: any) {
      setError(e.message || 'فشل تسجيل الدفعة');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">الحسابات المتقدمة</h1>

      {error && (
        <div className="bg-red-50 text-red-700 border border-red-200 rounded-md p-3 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">إجمالي محصل التذاكر</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{metrics.ticketCollected.toLocaleString()} ج.م</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">عمولات التذاكر</p>
          <p className="text-xl font-bold text-amber-600">{metrics.ticketCommission.toLocaleString()} ج.م</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">صافي دخل التذاكر</p>
          <p className="text-xl font-bold text-indigo-600">{metrics.ticketNet.toLocaleString()} ج.م</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">محصل الرعاة</p>
          <p className="text-xl font-bold text-emerald-600">{metrics.sponsorPaid.toLocaleString()} ج.م</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">إجمالي المصروفات</p>
          <p className="text-xl font-bold text-rose-600">{metrics.expenseTotal.toLocaleString()} ج.م</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">الرصيد الحالي</p>
          <p className={`text-xl font-bold ${metrics.currentBalance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{metrics.currentBalance.toLocaleString()} ج.م</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">إجمالي المديونيات لنا</p>
          <p className="text-xl font-bold text-orange-600">{metrics.totalReceivable.toLocaleString()} ج.م</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">إجمالي حقوقنا</p>
          <p className="text-xl font-bold text-blue-600">{metrics.totalRights.toLocaleString()} ج.م</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">رصيد عمولات السوشيال</p>
          <p className="text-xl font-bold text-pink-600">{metrics.socialWallet.toLocaleString()} ج.م</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">رصيد عمولات السالز</p>
          <p className="text-xl font-bold text-orange-600">{metrics.salesWallet.toLocaleString()} ج.م</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <form onSubmit={submitExpense} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-3">
          <h2 className="font-semibold text-gray-900 dark:text-white">إضافة مصروف</h2>
          <input value={expenseForm.title} onChange={(e) => setExpenseForm(prev => ({ ...prev, title: e.target.value }))} className="w-full border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white" placeholder="عنوان المصروف" />
          <input value={expenseForm.amount} onChange={(e) => setExpenseForm(prev => ({ ...prev, amount: e.target.value }))} type="number" className="w-full border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white" placeholder="القيمة" />
          <select value={expenseForm.category_id} onChange={(e) => setExpenseForm(prev => ({ ...prev, category_id: e.target.value }))} className="w-full border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white">
            <option value="">بدون تصنيف</option>
            {categories.map(category => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
          <input value={expenseForm.expense_date} onChange={(e) => setExpenseForm(prev => ({ ...prev, expense_date: e.target.value }))} type="datetime-local" className="w-full border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white" />
          <input value={expenseForm.notes} onChange={(e) => setExpenseForm(prev => ({ ...prev, notes: e.target.value }))} className="w-full border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white" placeholder="ملاحظات" />
          <button disabled={submitting} className="w-full bg-indigo-600 text-white rounded-md p-2 disabled:opacity-50">حفظ المصروف</button>
        </form>

        <form onSubmit={submitSponsor} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-3">
          <h2 className="font-semibold text-gray-900 dark:text-white">إضافة شركة راعية</h2>
          <input value={sponsorForm.company_name} onChange={(e) => setSponsorForm(prev => ({ ...prev, company_name: e.target.value }))} className="w-full border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white" placeholder="اسم الشركة" />
          <input value={sponsorForm.contact_name} onChange={(e) => setSponsorForm(prev => ({ ...prev, contact_name: e.target.value }))} className="w-full border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white" placeholder="اسم المسؤول" />
          <input value={sponsorForm.phone} onChange={(e) => setSponsorForm(prev => ({ ...prev, phone: e.target.value }))} className="w-full border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white" placeholder="الهاتف" />
          <input value={sponsorForm.email} onChange={(e) => setSponsorForm(prev => ({ ...prev, email: e.target.value }))} className="w-full border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white" placeholder="الإيميل" />
          <button disabled={submitting} className="w-full bg-indigo-600 text-white rounded-md p-2 disabled:opacity-50">حفظ الراعي</button>
        </form>

        <form onSubmit={submitContract} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-3">
          <h2 className="font-semibold text-gray-900 dark:text-white">إضافة عقد رعاية</h2>
          <select value={contractForm.sponsor_id} onChange={(e) => setContractForm(prev => ({ ...prev, sponsor_id: e.target.value }))} className="w-full border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white">
            <option value="">اختر الشركة</option>
            {sponsors.map(sponsor => (
              <option key={sponsor.id} value={sponsor.id}>{sponsor.company_name}</option>
            ))}
          </select>
          <input value={contractForm.contract_title} onChange={(e) => setContractForm(prev => ({ ...prev, contract_title: e.target.value }))} className="w-full border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white" placeholder="عنوان العقد" />
          <input value={contractForm.contract_amount} onChange={(e) => setContractForm(prev => ({ ...prev, contract_amount: e.target.value }))} type="number" className="w-full border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white" placeholder="قيمة العقد" />
          <input value={contractForm.paid_amount} onChange={(e) => setContractForm(prev => ({ ...prev, paid_amount: e.target.value }))} type="number" className="w-full border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white" placeholder="المدفوع حاليًا" />
          <input value={contractForm.due_date} onChange={(e) => setContractForm(prev => ({ ...prev, due_date: e.target.value }))} type="datetime-local" className="w-full border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white" />
          <input value={contractForm.notes} onChange={(e) => setContractForm(prev => ({ ...prev, notes: e.target.value }))} className="w-full border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white" placeholder="ملاحظات" />
          <button disabled={submitting} className="w-full bg-indigo-600 text-white rounded-md p-2 disabled:opacity-50">حفظ العقد</button>
        </form>

        <form onSubmit={submitPayment} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-3">
          <h2 className="font-semibold text-gray-900 dark:text-white">تسجيل دفعة راعي</h2>
          <select value={paymentForm.sponsor_contract_id} onChange={(e) => setPaymentForm(prev => ({ ...prev, sponsor_contract_id: e.target.value }))} className="w-full border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white">
            <option value="">اختر العقد</option>
            {contracts.map(contract => {
              const remaining = toNumber(contract.contract_amount) - toNumber(contract.paid_amount);
              return (
                <option key={contract.id} value={contract.id}>
                  {contract.contract_title} - {contract.sponsors?.company_name || 'بدون اسم'} - متبقي {remaining.toLocaleString()} ج.م
                </option>
              );
            })}
          </select>
          <input value={paymentForm.amount} onChange={(e) => setPaymentForm(prev => ({ ...prev, amount: e.target.value }))} type="number" className="w-full border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white" placeholder="قيمة الدفعة" />
          <input value={paymentForm.paid_at} onChange={(e) => setPaymentForm(prev => ({ ...prev, paid_at: e.target.value }))} type="datetime-local" className="w-full border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white" />
          <input value={paymentForm.notes} onChange={(e) => setPaymentForm(prev => ({ ...prev, notes: e.target.value }))} className="w-full border rounded-md p-2 bg-white dark:bg-gray-700 dark:text-white" placeholder="ملاحظات" />
          <button disabled={submitting} className="w-full bg-indigo-600 text-white rounded-md p-2 disabled:opacity-50">حفظ الدفعة</button>
        </form>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <h2 className="font-semibold mb-3 text-gray-900 dark:text-white">تفاصيل المصروفات</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-right border-b dark:border-gray-700">
                  <th className="py-2">التاريخ</th>
                  <th className="py-2">البند</th>
                  <th className="py-2">التصنيف</th>
                  <th className="py-2">القيمة</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map(expense => (
                  <tr key={expense.id} className="border-b dark:border-gray-700">
                    <td className="py-2 text-gray-600 dark:text-gray-300">{new Date(expense.expense_date).toLocaleDateString('ar-EG')}</td>
                    <td className="py-2 text-gray-800 dark:text-gray-100">{expense.title}</td>
                    <td className="py-2 text-gray-600 dark:text-gray-300">{expense.expense_categories?.name || '-'}</td>
                    <td className="py-2 font-medium text-rose-600">{toNumber(expense.amount).toLocaleString()} ج.م</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <h2 className="font-semibold mb-3 text-gray-900 dark:text-white">تفاصيل عقود الرعاة</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-right border-b dark:border-gray-700">
                  <th className="py-2">الشركة</th>
                  <th className="py-2">العقد</th>
                  <th className="py-2">القيمة</th>
                  <th className="py-2">المدفوع</th>
                  <th className="py-2">المتبقي</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map(contract => {
                  const remaining = Math.max(0, toNumber(contract.contract_amount) - toNumber(contract.paid_amount));
                  return (
                    <tr key={contract.id} className="border-b dark:border-gray-700">
                      <td className="py-2 text-gray-800 dark:text-gray-100">{contract.sponsors?.company_name || '-'}</td>
                      <td className="py-2 text-gray-600 dark:text-gray-300">{contract.contract_title}</td>
                      <td className="py-2 text-blue-700">{toNumber(contract.contract_amount).toLocaleString()} ج.م</td>
                      <td className="py-2 text-emerald-600">{toNumber(contract.paid_amount).toLocaleString()} ج.م</td>
                      <td className="py-2 text-orange-600 font-medium">{remaining.toLocaleString()} ج.م</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <h2 className="font-semibold mb-3 text-gray-900 dark:text-white">آخر دفعات الرعاة</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-right border-b dark:border-gray-700">
                <th className="py-2">تاريخ الدفع</th>
                <th className="py-2">المبلغ</th>
                <th className="py-2">ملاحظات</th>
              </tr>
            </thead>
            <tbody>
              {payments.slice(0, 20).map(payment => (
                <tr key={payment.id} className="border-b dark:border-gray-700">
                  <td className="py-2 text-gray-600 dark:text-gray-300">{new Date(payment.paid_at).toLocaleString('ar-EG')}</td>
                  <td className="py-2 text-emerald-600 font-medium">{toNumber(payment.amount).toLocaleString()} ج.م</td>
                  <td className="py-2 text-gray-600 dark:text-gray-300">{payment.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Finance;
