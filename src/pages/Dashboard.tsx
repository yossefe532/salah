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

  if (loading) return <div className="p-8 text-center">جاري تحميل لوحة التحكم...</div>;

  if (user?.role !== 'owner') {
    return (
      <div className="text-center py-10">
        <h2 className="text-2xl font-bold text-gray-900">مرحباً، {user?.email}</h2>
        <p className="mt-2 text-gray-600">استخدم القائمة الجانبية للوصول إلى الأدوات.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">لوحة تحكم الفعالية</h1>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Users className="h-6 w-6 text-gray-400" />
              </div>
              <div className="mr-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">إجمالي الحضور</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.totalAttendees}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckCircle className="h-6 w-6 text-green-400" />
              </div>
              <div className="mr-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">تم التحضير</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.checkedIn}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <DollarSign className="h-6 w-6 text-indigo-400" />
              </div>
              <div className="mr-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">إجمالي الإيرادات</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.totalRevenue.toLocaleString()} ج.م</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-6 w-6 text-red-400" />
              </div>
              <div className="mr-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">المبالغ المتبقية</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.remainingRevenue.toLocaleString()} ج.م</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Seat Class Distribution */}
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">توزيع الفئات</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.byClass}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="value" fill="#8884d8" name="عدد الحضور" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Governorate Distribution */}
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">توزيع المحافظات</h3>
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
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
