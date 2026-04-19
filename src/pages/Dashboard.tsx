import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, supabase } from '../lib/api';
import { Attendee } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Users, CheckCircle, DollarSign, AlertTriangle, Zap } from 'lucide-react';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalAttendees: 0,
    checkedIn: 0,
    totalRevenue: 0,
    remainingRevenue: 0,
    confirmedReceivable: 0,
    unconfirmedReceivable: 0,
    commissionTotal: 0,
    netTicketRevenue: 0,
    expenseTotal: 0,
    sponsorPaidTotal: 0,
    currentBalance: 0,
    totalRights: 0,
    byClass: [] as { name: string; value: number }[],
    byGovernorate: [] as { name: string; value: number }[],
    activityLogs: [] as any[], // New Activity Logs
    salesAnalysis: [] as any[],
    crossAnalysis: [] as any[], // New Cross Analysis
    companyDaily: [] as any[],
  });
  const [loading, setLoading] = useState(true);
  const [isRealtime, setIsRealtime] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const attendees: Attendee[] = await api.get('/attendees?lite=1').catch(() => []);
      const companyDaily = await api.get('/company-daily-report').catch(() => []);
      // Fetch Activity Logs
      const { data: logs } = await supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(10);
      const { data: expensesData } = await supabase.from('expenses').select('amount');
      const { data: sponsorContractsData } = await supabase.from('sponsor_contracts').select('contract_amount, paid_amount');

      if (attendees) {
        const isCustomZeroPrice = (a: Attendee) => {
          if (a.ticket_price_override === undefined || a.ticket_price_override === null) return false;
          const v = Number(a.ticket_price_override);
          return !Number.isNaN(v) && v === 0;
        };
        const totalAttendees = attendees.length;
        const checkedIn = attendees.filter(a => a.attendance_status).length;
        const totalRevenue = attendees.reduce((sum, a) => sum + (Number(a.payment_amount) || 0), 0);
        const remainingRevenue = attendees.reduce((sum, a) => sum + (Number(a.remaining_amount) || 0), 0);
        const confirmedReceivable = attendees
          .filter((a) => (Number(a.payment_amount || 0) > 0) || isCustomZeroPrice(a))
          .reduce((sum, a) => sum + (Number(a.remaining_amount) || 0), 0);
        const unconfirmedReceivable = attendees
          .filter((a) => Number(a.payment_amount || 0) <= 0 && !isCustomZeroPrice(a))
          .reduce((sum, a) => sum + (Number(a.remaining_amount) || 0), 0);
        const commissionTotal = attendees.reduce((sum, a) => sum + (Number(a.commission_amount) || 0), 0);
        const netTicketRevenue = Math.max(0, totalRevenue - commissionTotal);
        const expenseTotal = (expensesData || []).reduce((sum, row: any) => sum + (Number(row.amount) || 0), 0);
        const sponsorPaidTotal = (sponsorContractsData || []).reduce((sum, row: any) => sum + (Number(row.paid_amount) || 0), 0);
        const sponsorReceivable = (sponsorContractsData || []).reduce((sum, row: any) => sum + Math.max(0, (Number(row.contract_amount) || 0) - (Number(row.paid_amount) || 0)), 0);
        const currentBalance = (netTicketRevenue + sponsorPaidTotal) - expenseTotal;
        const totalRights = currentBalance + remainingRevenue + sponsorReceivable;

        // Group by Class
        const classCounts = attendees.reduce((acc, a) => {
          acc[a.seat_class] = (acc[a.seat_class] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        const byClass = Object.keys(classCounts).map(key => ({ name: `فئة ${key}`, value: classCounts[key] }));

        // Group by Governorate
        const govCounts = attendees.reduce((acc, a) => {
          const govName = a.governorate === 'Minya' ? 'المنيا' : 
                          a.governorate === 'Asyut' ? 'أسيوط' : 
                          a.governorate === 'Sohag' ? 'سوهاج' : 'قنا';
          acc[govName] = (acc[govName] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        const byGovernorate = Object.keys(govCounts).map(key => ({ name: key, value: govCounts[key] }));

        // Cross Analysis (Governorate x Class)
        const govs = ['Minya', 'Asyut', 'Sohag', 'Qena'];
        const crossAnalysisData = govs.map(gov => {
            const govName = gov === 'Minya' ? 'المنيا' : gov === 'Asyut' ? 'أسيوط' : gov === 'Sohag' ? 'سوهاج' : 'قنا';
            const inGov = attendees.filter(a => a.governorate === gov);
            return {
                name: govName,
                A: inGov.filter(a => a.seat_class === 'A').length,
                B: inGov.filter(a => a.seat_class === 'B').length,
                C: inGov.filter(a => a.seat_class === 'C').length,
                total: inGov.length
            };
        });

        // Sales Analysis by Class
        const salesAnalysisData = ['A', 'B', 'C'].map(cls => {
            const classAttendees = attendees.filter(a => a.seat_class === cls);
            const count = classAttendees.length;
            const revenue = classAttendees.reduce((sum, a) => sum + (Number(a.payment_amount) || 0), 0);
            const remaining = classAttendees.reduce((sum, a) => sum + (Number(a.remaining_amount) || 0), 0);
            return { class: cls, count, revenue, remaining };
        });

        setStats({
          totalAttendees,
          checkedIn,
          totalRevenue,
          remainingRevenue,
          confirmedReceivable,
          unconfirmedReceivable,
          commissionTotal,
          netTicketRevenue,
          expenseTotal,
          sponsorPaidTotal,
          currentBalance,
          totalRights,
          byClass,
          byGovernorate,
          activityLogs: logs || [],
          salesAnalysis: salesAnalysisData,
          crossAnalysis: crossAnalysisData,
          companyDaily: Array.isArray(companyDaily) ? companyDaily : []
        });
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'owner') {
      fetchStats();

      // Real-time Subscription for Dashboard
      const channel = supabase
        .channel('dashboard_stats_changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'attendees' },
          () => {
            console.log('Stats update received');
            setIsRealtime(true);
            fetchStats(); // Re-fetch stats on any change
            setTimeout(() => setIsRealtime(false), 2000);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } else {
      setLoading(false);
    }
  }, [user, fetchStats]);

  if (loading) return <div className="p-8 text-center dark:text-white">جاري تحميل لوحة التحكم...</div>;

  if (user?.role !== 'owner') {
    return (
      <div className="text-center py-10">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">مرحباً، {user?.email}</h2>
        <p className="mt-2 text-gray-600 dark:text-gray-400">استخدم القائمة الجانبية للوصول إلى الأدوات.</p>
      </div>
    );
  }

  const collectionRate = stats.totalRevenue > 0 
    ? Math.round((stats.totalRevenue / (stats.totalRevenue + stats.remainingRevenue)) * 100) 
    : 0;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">لوحة تحكم الفعالية</h1>
        {isRealtime && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 animate-pulse">
                <Zap className="w-3 h-3 mr-1" />
                تحديث حي
            </span>
        )}
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg transition-colors">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Users className="h-6 w-6 text-gray-400 dark:text-gray-500" />
              </div>
              <div className="mr-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">إجمالي الحضور</dt>
                  <dd className="text-lg font-medium text-gray-900 dark:text-white">{stats.totalAttendees}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg transition-colors">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckCircle className="h-6 w-6 text-green-400" />
              </div>
              <div className="mr-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">تم التحضير</dt>
                  <dd className="text-lg font-medium text-gray-900 dark:text-white">
                    {stats.checkedIn} <span className="text-xs text-gray-400">({Math.round((stats.checkedIn / (stats.totalAttendees || 1)) * 100)}%)</span>
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg transition-colors">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <DollarSign className="h-6 w-6 text-indigo-400" />
              </div>
              <div className="mr-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">إجمالي الإيرادات</dt>
                  <dd className="text-lg font-medium text-gray-900 dark:text-white">{stats.totalRevenue.toLocaleString()} ج.م</dd>
                  <dd className="text-xs text-green-500">نسبة التحصيل: {collectionRate}%</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg transition-colors">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-6 w-6 text-emerald-500" />
              </div>
              <div className="mr-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">مستحقات مؤكدة (دافعين)</dt>
                  <dd className="text-lg font-medium text-gray-900 dark:text-white">{stats.confirmedReceivable.toLocaleString()} ج.م</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg transition-colors">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-6 w-6 text-amber-500" />
              </div>
              <div className="mr-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">مستحقات غير مؤكدة (غير دافعين)</dt>
                  <dd className="text-lg font-medium text-gray-900 dark:text-white">{stats.unconfirmedReceivable.toLocaleString()} ج.م</dd>
                  <dd className="text-xs text-gray-500">إجمالي المتبقي: {stats.remainingRevenue.toLocaleString()} ج.م</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg transition-colors">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <DollarSign className="h-6 w-6 text-amber-500" />
              </div>
              <div className="mr-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">إجمالي العمولات</dt>
                  <dd className="text-lg font-medium text-gray-900 dark:text-white">{stats.commissionTotal.toLocaleString()} ج.م</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg transition-colors">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <DollarSign className="h-6 w-6 text-green-500" />
              </div>
              <div className="mr-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">صافي التذاكر بعد العمولة</dt>
                  <dd className="text-lg font-medium text-gray-900 dark:text-white">{stats.netTicketRevenue.toLocaleString()} ج.م</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg transition-colors">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-6 w-6 text-rose-500" />
              </div>
              <div className="mr-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">مصروفات الفعالية</dt>
                  <dd className="text-lg font-medium text-gray-900 dark:text-white">{stats.expenseTotal.toLocaleString()} ج.م</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg transition-colors">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <DollarSign className="h-6 w-6 text-emerald-600" />
              </div>
              <div className="mr-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">محصل الرعاة</dt>
                  <dd className="text-lg font-medium text-gray-900 dark:text-white">{stats.sponsorPaidTotal.toLocaleString()} ج.م</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg transition-colors">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <DollarSign className="h-6 w-6 text-blue-600" />
              </div>
              <div className="mr-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">الرصيد الحالي</dt>
                  <dd className="text-lg font-medium text-gray-900 dark:text-white">{stats.currentBalance.toLocaleString()} ج.م</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg transition-colors">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <DollarSign className="h-6 w-6 text-indigo-600" />
              </div>
              <div className="mr-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">إجمالي حقوقنا</dt>
                  <dd className="text-lg font-medium text-gray-900 dark:text-white">{stats.totalRights.toLocaleString()} ج.م</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 transition-colors">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">متابعة يومية للشركات الفرعية</h2>
        {stats.companyDaily.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">لا توجد بيانات شركات فرعية اليوم.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b dark:border-gray-700 text-right">
                  <th className="py-2">الشركة</th>
                  <th className="py-2">عدد المسجلين اليوم</th>
                  <th className="py-2">إيراد اليوم</th>
                  <th className="py-2">آخر الأسماء المضافة</th>
                </tr>
              </thead>
              <tbody>
                {stats.companyDaily.map((row: any) => (
                  <tr key={row.company_id} className="border-b dark:border-gray-700">
                    <td className="py-2 font-medium text-gray-900 dark:text-white">{row.company_name}</td>
                    <td className="py-2">{Number(row.today_count || 0)}</td>
                    <td className="py-2">{Number(row.today_revenue || 0).toLocaleString()} ج.م</td>
                    <td className="py-2 text-xs text-gray-600 dark:text-gray-300">
                      {(row.today_people || []).slice(0, 5).map((p: any) => p.full_name).join('، ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Seat Class Distribution */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 transition-colors">
          <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white mb-4">توزيع الفئات</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.byClass}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis dataKey="name" stroke="#9CA3AF" />
                <YAxis stroke="#9CA3AF" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#fff' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Legend />
                <Bar dataKey="value" fill="#8884d8" name="عدد الحضور" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Governorate Distribution */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 transition-colors">
          <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white mb-4">توزيع المحافظات</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.byGovernorate}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {stats.byGovernorate.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#fff' }}
                  itemStyle={{ color: '#fff' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Cross Analysis (Gov x Class) */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 transition-colors">
          <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white mb-4">تحليل الفئات لكل محافظة</h3>
          <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.crossAnalysis}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                      <XAxis dataKey="name" stroke="#9CA3AF" />
                      <YAxis stroke="#9CA3AF" />
                      <Tooltip 
                          contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#fff' }}
                          itemStyle={{ color: '#fff' }}
                      />
                      <Legend />
                      <Bar dataKey="A" stackId="a" fill="#8884d8" name="فئة A" />
                      <Bar dataKey="B" stackId="a" fill="#82ca9d" name="فئة B" />
                      <Bar dataKey="C" stackId="a" fill="#ffc658" name="فئة C" />
                  </BarChart>
              </ResponsiveContainer>
          </div>
      </div>

      {/* Advanced Financial Tables */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Sales Analysis */}
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 transition-colors overflow-hidden">
              <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white mb-4">تحليل المبيعات</h3>
              <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead>
                          <tr>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">الفئة</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">العدد</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">الإيراد</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">المتبقي</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                          {stats.salesAnalysis.map((row) => (
                              <tr key={row.class}>
                                  <td className="px-4 py-2 text-sm text-gray-900 dark:text-white font-bold">{row.class}</td>
                                  <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-300">{row.count}</td>
                                  <td className="px-4 py-2 text-sm text-green-600 font-medium">{row.revenue.toLocaleString()} ج.م</td>
                                  <td className="px-4 py-2 text-sm text-red-500 font-medium">{row.remaining.toLocaleString()} ج.م</td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>

          {/* Activity Logs (Detailed) */}
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 transition-colors overflow-hidden">
              <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white mb-4">سجل النشاطات (Live)</h3>
              <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead>
                          <tr>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">النشاط</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">التفاصيل</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">التاريخ</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                          {stats.activityLogs.map((log) => (
                              <tr key={log.id}>
                                  <td className="px-4 py-2 text-sm text-gray-900 dark:text-white font-medium">
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                          log.action_type === 'payment' ? 'bg-green-100 text-green-800' :
                                          log.action_type === 'status' ? 'bg-blue-100 text-blue-800' :
                                          log.action_type === 'check_in' ? 'bg-purple-100 text-purple-800' :
                                          'bg-gray-100 text-gray-800'
                                      }`}>
                                          {log.action_type === 'payment' ? 'دفع' :
                                           log.action_type === 'status' ? 'حالة' :
                                           log.action_type === 'check_in' ? 'حضور' : 'تسجيل'}
                                      </span>
                                  </td>
                                  <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">
                                      <div className="font-bold">{log.attendee_name}</div>
                                      <div className="text-xs text-gray-500 dark:text-gray-400">{log.details}</div>
                                  </td>
                                  <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 text-xs">
                                      {new Date(log.created_at).toLocaleTimeString('ar-EG', {hour: '2-digit', minute:'2-digit'})}
                                      <br/>
                                      {new Date(log.created_at).toLocaleDateString('ar-EG')}
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
      </div>
    </div>
  );
};

export default Dashboard;
