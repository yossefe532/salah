import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { Attendee } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Users, CheckCircle, DollarSign, AlertTriangle } from 'lucide-react';

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
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.role === 'owner') {
      fetchStats();
    } else {
      setLoading(false);
    }
  }, [user]);

  const fetchStats = async () => {
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

        setStats({
          totalAttendees,
          checkedIn,
          totalRevenue,
          remainingRevenue,
          byClass,
          byGovernorate,
        });
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

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
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">لوحة تحكم الفعالية</h1>
      
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
    </div>
  );
};

export default Dashboard;
