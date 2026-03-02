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
    byClass: [] as { name: string; value: number }[],
    byGovernorate: [] as { name: string; value: number }[],
    recentTransactions: [] as Attendee[],
    salesAnalysis: [] as any[],
  });
  const [loading, setLoading] = useState(true);
  const [isRealtime, setIsRealtime] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const attendees: Attendee[] = await api.get('/attendees');

      if (attendees) {
        const totalAttendees = attendees.length;
        const checkedIn = attendees.filter(a => a.attendance_status).length;
        const totalRevenue = attendees.reduce((sum, a) => sum + (Number(a.payment_amount) || 0), 0);
        const remainingRevenue = attendees.reduce((sum, a) => sum + (Number(a.remaining_amount) || 0), 0);

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

        // Recent Transactions (Last 5 registered)
        const recentTransactions = [...attendees].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5);

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
          byClass,
          byGovernorate,
          recentTransactions,
          salesAnalysis: salesAnalysisData,
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
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
                <AlertTriangle className="h-6 w-6 text-red-400" />
              </div>
              <div className="mr-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">المبالغ المتبقية</dt>
                  <dd className="text-lg font-medium text-gray-900 dark:text-white">{stats.remainingRevenue.toLocaleString()} ج.م</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
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

          {/* Recent Transactions */}
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 transition-colors overflow-hidden">
              <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white mb-4">آخر العمليات</h3>
              <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead>
                          <tr>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">الاسم</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">المبلغ</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">التاريخ</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                          {stats.recentTransactions.map((t) => (
                              <tr key={t.id}>
                                  <td className="px-4 py-2 text-sm text-gray-900 dark:text-white truncate max-w-[150px]">{t.full_name}</td>
                                  <td className="px-4 py-2 text-sm text-gray-900 dark:text-white font-medium">
                                      {t.payment_amount} ج.م
                                      {Number(t.payment_amount) === 0 && <span className="mr-1 text-xs text-yellow-500">(0)</span>}
                                  </td>
                                  <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 text-xs">
                                      {new Date(t.created_at).toLocaleDateString('ar-EG')}
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
