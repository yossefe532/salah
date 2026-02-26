import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import { Attendee } from '../types';
import { Search, Eye, QrCode, CheckCircle, XCircle, UserCheck, UserX, Trash2, RefreshCcw, AlertTriangle, MessageCircle, Phone, Upload, Edit2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Attendees: React.FC = () => {
  const { user } = useAuth();
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'active' | 'trash'>('active');
  const [filters, setFilters] = useState({
    governorate: '',
    seat_class: '',
    status: '',
    payment_type: '',
    attendance: '', 
  });

  const fetchAttendees = useCallback(async () => {
    setLoading(true);
    try {
      // Pass trash=true if viewMode is trash
      const endpoint = viewMode === 'trash' ? '/attendees?trash=true' : '/attendees';
      let data: Attendee[] = await api.get(endpoint);

      // Sort by newest
      data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // Client-side Filtering
      if (filters.governorate) data = data.filter(a => a.governorate === filters.governorate);
      if (filters.seat_class) data = data.filter(a => a.seat_class === filters.seat_class);
      if (filters.status) data = data.filter(a => a.status === filters.status);
      if (filters.payment_type) data = data.filter(a => a.payment_type === filters.payment_type);
      if (filters.attendance === 'present') data = data.filter(a => a.attendance_status);
      if (filters.attendance === 'absent') data = data.filter(a => !a.attendance_status);

      setAttendees(data);
    } catch (error) {
      console.error('Error fetching attendees:', error);
    } finally {
      setLoading(false);
    }
  }, [filters, viewMode]);

  useEffect(() => {
    fetchAttendees();
  }, [fetchAttendees]);

  const handleToggleAttendance = async (attendeeId: string, currentStatus: boolean) => {
    const action = currentStatus ? 'إلغاء حضور' : 'تسجيل حضور';
    if (!window.confirm(`هل أنت متأكد من ${action} هذا الشخص؟`)) return;
    
    try {
        const updatedAttendee = await api.patch(`/attendees/${attendeeId}/toggle-attendance`);
        setAttendees(prev => prev.map(a => a.id === attendeeId ? updatedAttendee : a));
    } catch (e) {
        alert('حدث خطأ أثناء تحديث الحالة');
        console.error(e);
    }
  };

  const handleSoftDelete = async (attendeeId: string) => {
    if (!window.confirm('هل أنت متأكد من نقل هذا العميل إلى سلة المهملات؟')) return;
    try {
      await api.delete(`/attendees/${attendeeId}`);
      setAttendees(prev => prev.filter(a => a.id !== attendeeId));
    } catch (e) {
      alert('فشل الحذف');
    }
  };

  const handleRestore = async (attendeeId: string) => {
    if (!window.confirm('هل تريد استعادة هذا العميل؟')) return;
    try {
      await api.patch(`/attendees/${attendeeId}/restore`);
      setAttendees(prev => prev.filter(a => a.id !== attendeeId)); // Remove from trash view
    } catch (e) {
      alert('فشل الاستعادة');
    }
  };

  const handlePermanentDelete = async (attendeeId: string) => {
    if (!window.confirm('تحذير: سيتم حذف العميل نهائياً ولا يمكن استرجاعه! هل أنت متأكد؟')) return;
    try {
      await api.delete(`/attendees/${attendeeId}/permanent`);
      setAttendees(prev => prev.filter(a => a.id !== attendeeId));
    } catch (e) {
      alert('فشل الحذف النهائي');
    }
  };

  // Client-side search
  const filteredAttendees = attendees.filter((attendee) => {
    const term = searchTerm.toLowerCase();
    return (
      attendee.full_name.toLowerCase().includes(term) ||
      attendee.phone_primary.includes(term) ||
      (attendee.email_primary && attendee.email_primary.toLowerCase().includes(term)) ||
      (attendee.qr_code && attendee.qr_code.includes(term)) ||
      (attendee.id && attendee.id.toLowerCase().includes(term))
    );
  });

  const stats = {
    total: filteredAttendees.length,
    present: filteredAttendees.filter(a => a.attendance_status).length,
    absent: filteredAttendees.filter(a => !a.attendance_status).length
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="sm:flex sm:items-center sm:justify-between bg-white p-4 rounded-lg shadow-sm border border-gray-100">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">
              {viewMode === 'active' ? 'إدارة الحضور' : 'سلة المهملات'}
            </h1>
            {user?.role === 'owner' && (
              <button
                onClick={() => setViewMode(viewMode === 'active' ? 'trash' : 'active')}
                className={`p-2 rounded-full transition-colors ${viewMode === 'trash' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                title={viewMode === 'active' ? "عرض المحذوفات" : "العودة للرئيسية"}
              >
                {viewMode === 'active' ? <Trash2 className="h-5 w-5" /> : <RefreshCcw className="h-5 w-5" />}
              </button>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            إجمالي: {stats.total} | <span className="text-green-600 font-bold">حضور: {stats.present}</span> | <span className="text-red-500 font-bold">غياب: {stats.absent}</span>
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex gap-2">
           {viewMode === 'active' && (
            <>
               <Link
                to="/import"
                className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none transition-colors"
              >
                <Upload className="h-4 w-4 ml-2" />
                استيراد بيانات
              </Link>
              <Link
                to="/register"
                className="inline-flex items-center justify-center px-6 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none transition-colors"
              >
                + تسجيل مشارك جديد
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Filters and Search */}
      <div className={`bg-white shadow-md rounded-lg p-5 border ${viewMode === 'trash' ? 'border-red-200 bg-red-50' : 'border-gray-100'}`}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
          <div className="md:col-span-2 relative">
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pr-10 py-2 border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm border shadow-sm"
              placeholder="بحث بالاسم، الهاتف، أو الكود..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <select
            className="block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            value={filters.governorate}
            onChange={(e) => setFilters({ ...filters, governorate: e.target.value })}
          >
            <option value="">كل المحافظات</option>
            <option value="Minya">المنيا</option>
            <option value="Asyut">أسيوط</option>
            <option value="Sohag">سوهاج</option>
            <option value="Qena">قنا</option>
          </select>

          <select
            className="block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            value={filters.seat_class}
            onChange={(e) => setFilters({ ...filters, seat_class: e.target.value })}
          >
            <option value="">كل الفئات (Class)</option>
            <option value="A">فئة A</option>
            <option value="B">فئة B</option>
            <option value="C">فئة C</option>
          </select>

          <select
            className="block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            value={filters.payment_type}
            onChange={(e) => setFilters({ ...filters, payment_type: e.target.value })}
          >
            <option value="">حالة الدفع</option>
            <option value="full">دفع كامل</option>
            <option value="deposit">عربون فقط</option>
          </select>
          
          <select
            className="block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            value={filters.attendance}
            onChange={(e) => setFilters({ ...filters, attendance: e.target.value })}
          >
            <option value="">حالة الحضور</option>
            <option value="present">الحاضرون فقط</option>
            <option value="absent">الغائبون فقط</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white shadow-lg rounded-lg overflow-hidden border border-gray-100">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent"></div>
            <p className="mt-4 text-gray-600 font-medium">جاري تحميل البيانات...</p>
          </div>
        ) : filteredAttendees.length === 0 ? (
          <div className="text-center py-16 bg-gray-50">
            <UserX className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-2 text-lg text-gray-500">لا توجد نتائج مطابقة للبحث.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-right">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    الاسم / معلومات الاتصال
                  </th>
                  <th scope="col" className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    التذكرة
                  </th>
                  <th scope="col" className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    المدفوعات
                  </th>
                  <th scope="col" className="px-6 py-4 text-xs font-bold text-center text-gray-500 uppercase tracking-wider">
                    حالة الحضور
                  </th>
                  <th scope="col" className="px-6 py-4 text-xs font-bold text-center text-gray-500 uppercase tracking-wider">
                    إجراءات
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredAttendees.map((attendee) => (
                  <tr key={attendee.id} className={`hover:bg-gray-50 transition-colors ${attendee.attendance_status ? 'bg-green-50/30' : ''}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div>
                          <div className="text-base font-bold text-gray-900">{attendee.full_name}</div>
                          <div className="text-sm text-gray-500 mt-1 font-mono flex items-center gap-2">
                             {attendee.phone_primary}
                             {/* Communication Buttons */}
                             <div className="flex gap-1 mr-2">
                                <a 
                                    href={`https://wa.me/20${attendee.phone_primary}`} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="p-1 bg-green-100 text-green-600 rounded-full hover:bg-green-200"
                                    title="WhatsApp"
                                >
                                    <MessageCircle className="h-3 w-3" />
                                </a>
                                <a 
                                    href={`tel:${attendee.phone_primary}`}
                                    className="p-1 bg-blue-100 text-blue-600 rounded-full hover:bg-blue-200"
                                    title="اتصال"
                                >
                                    <Phone className="h-3 w-3" />
                                </a>
                             </div>
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">{attendee.governorate}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                       <span className={`px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full shadow-sm
                        ${attendee.seat_class === 'A' ? 'bg-purple-100 text-purple-800 border border-purple-200' : 
                          attendee.seat_class === 'B' ? 'bg-blue-100 text-blue-800 border border-blue-200' : 
                          'bg-teal-100 text-teal-800 border border-teal-200'}`}>
                        فئة {attendee.seat_class}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{attendee.payment_amount} ج.م</div>
                      <div className={`text-xs font-bold mt-1 ${attendee.remaining_amount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {attendee.remaining_amount > 0 ? `متبقي: ${attendee.remaining_amount}` : 'خالص'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {attendee.attendance_status ? (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-green-100 text-green-800 border border-green-200 shadow-sm">
                          <CheckCircle className="w-4 h-4 ml-2" />
                          حاضر
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-600 border border-gray-200">
                          <XCircle className="w-4 h-4 ml-2" />
                          لم يحضر
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                      <div className="flex items-center justify-center space-x-2 space-x-reverse">
                        {viewMode === 'active' ? (
                          <>
                            <button
                              onClick={() => handleToggleAttendance(attendee.id, !!attendee.attendance_status)}
                              className={`p-2 rounded-full transition-colors shadow-sm ${
                                attendee.attendance_status 
                                  ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200' 
                                  : 'bg-green-50 text-green-600 hover:bg-green-100 border border-green-200'
                              }`}
                              title={attendee.attendance_status ? "إلغاء الحضور" : "تسجيل حضور"}
                            >
                              {attendee.attendance_status ? <UserX className="h-5 w-5" /> : <UserCheck className="h-5 w-5" />}
                            </button>
                            
                            <Link 
                              to={`/attendees/${attendee.id}/id-card`} 
                              className="p-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-full border border-indigo-200 transition-colors shadow-sm"
                              title="عرض التفاصيل"
                            >
                              <Eye className="h-5 w-5" />
                            </Link>

                            <Link 
                              to={`/attendees/${attendee.id}/edit`} 
                              className="p-2 bg-yellow-50 text-yellow-600 hover:bg-yellow-100 rounded-full border border-yellow-200 transition-colors shadow-sm"
                              title="تعديل"
                            >
                              <Edit2 className="h-5 w-5" />
                            </Link>

                            {/* Only Owner can delete */}
                            {user?.role === 'owner' && (
                              <button
                                onClick={() => handleSoftDelete(attendee.id)}
                                className="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-full border border-red-200 transition-colors shadow-sm"
                                title="نقل للمهملات"
                              >
                                <Trash2 className="h-5 w-5" />
                              </button>
                            )}
                          </>
                        ) : (
                          // Trash Mode Actions
                          <>
                            <button
                              onClick={() => handleRestore(attendee.id)}
                              className="p-2 bg-green-50 text-green-600 hover:bg-green-100 rounded-full border border-green-200 transition-colors shadow-sm"
                              title="استعادة"
                            >
                              <RefreshCcw className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => handlePermanentDelete(attendee.id)}
                              className="p-2 bg-red-600 text-white hover:bg-red-700 rounded-full border border-red-700 transition-colors shadow-sm"
                              title="حذف نهائي"
                            >
                              <XCircle className="h-5 w-5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Attendees;