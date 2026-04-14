import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api, supabase } from '../lib/api';
import { Attendee } from '../types';
import { Search, Eye, QrCode, CheckCircle, XCircle, UserCheck, UserX, Trash2, RefreshCcw, AlertTriangle, MessageCircle, Phone, Upload, Edit2, FileSpreadsheet, Copy, Zap, Ticket, FileBadge2, Image as ImageIcon, Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx';
import { QRCodeCanvas } from 'qrcode.react';
import { jsPDF } from 'jspdf';

const Attendees: React.FC = () => {
  const { user } = useAuth();
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRealtime, setIsRealtime] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'active' | 'trash'>('active');
  const [filters, setFilters] = useState({
    governorate: '',
    seat_class: '',
    status: '',
    payment_type: '',
    attendance: '', 
  });
  const [downloadingQr, setDownloadingQr] = useState<Attendee | null>(null);

  useEffect(() => {
    if (downloadingQr) {
      setTimeout(() => {
        const canvas = document.getElementById('hidden-qr-canvas') as HTMLCanvasElement;
        if (!canvas) {
          alert('QR Code غير متوفر للتحميل');
          setDownloadingQr(null);
          return;
        }

        const padding = 10;
        const paddedCanvas = document.createElement('canvas');
        paddedCanvas.width = canvas.width + (padding * 2);
        paddedCanvas.height = canvas.height + (padding * 2);
        const ctx = paddedCanvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, paddedCanvas.width, paddedCanvas.height);
          ctx.drawImage(canvas, padding, padding);
          
          const imgData = paddedCanvas.toDataURL('image/png');
          const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'px',
            format: [paddedCanvas.width, paddedCanvas.height]
          });
          pdf.addImage(imgData, 'PNG', 0, 0, paddedCanvas.width, paddedCanvas.height);
          
          const baseName = String(downloadingQr.full_name || downloadingQr.id || 'attendee').replace(/[\\/:*?"<>|]/g, '_');
          pdf.save(`qr-${baseName}.pdf`);
        }
        setDownloadingQr(null);
      }, 100);
    }
  }, [downloadingQr]);

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
      
      if (filters.payment_type) {
          if (filters.payment_type === 'zero_deposit') {
              data = data.filter(a => a.payment_type === 'deposit' && Number(a.payment_amount) === 0);
          } else {
              data = data.filter(a => a.payment_type === filters.payment_type);
          }
      }
      
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

    // Real-time Subscription
    const channel = supabase
      .channel('attendees_list_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendees' },
        (payload) => {
          console.log('Real-time change received:', payload);
          setIsRealtime(true);
          
          if (payload.eventType === 'INSERT') {
            const newRecord = payload.new as Attendee;
            setAttendees(prev => [newRecord, ...prev]);
          } 
          else if (payload.eventType === 'UPDATE') {
            const updatedRecord = payload.new as Attendee;
            setAttendees(prev => prev.map(a => a.id === updatedRecord.id ? updatedRecord : a));
          } 
          else if (payload.eventType === 'DELETE') {
            const deletedId = payload.old.id;
            setAttendees(prev => prev.filter(a => a.id !== deletedId));
          }
          
          // Flash realtime indicator
          setTimeout(() => setIsRealtime(false), 2000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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

  const formatDateTime = (value?: string | null) => {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString('ar-EG', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Export to Excel
  const handleExportExcel = () => {
    if (filteredAttendees.length === 0) return alert('لا توجد بيانات للتصدير');
    
    const dataToExport = filteredAttendees.map(a => ({
      'الاسم': a.full_name,
      'الهاتف': a.phone_primary,
      'المحافظة': a.governorate,
      'الفئة': a.seat_class,
      'مصدر التسجيل': a.sales_channel || 'direct',
      'اسم المصدر': a.sales_source_name || '',
      'حالة الدفع': a.payment_type === 'full' ? 'كامل' : (Number(a.payment_amount) === 0 ? 'عربون صفري' : 'عربون'),
      'المدفوع': a.payment_amount,
      'العمولة': Number(a.commission_amount || 0),
      'صافي التذكرة': Math.max(0, Number(a.payment_amount || 0) - Number(a.commission_amount || 0)),
      'المتبقي': a.remaining_amount,
      'حالة الحضور': a.attendance_status ? 'حاضر' : 'غائب',
      'تاريخ التسجيل': new Date(a.created_at).toLocaleDateString('ar-EG'),
      'ملاحظات': a.notes || ''
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendees");
    XLSX.writeFile(wb, "attendees_list.xlsx");
  };

  // Copy Phones
  const handleCopyPhones = () => {
    if (filteredAttendees.length === 0) return alert('لا توجد أرقام للنسخ');
    
    const phones = filteredAttendees
        .map(a => a.phone_primary)
        .filter(p => p && p.length > 5) // Basic validation
        .join('\n'); // New line separated for easy pasting into bulk SMS tools
    
    navigator.clipboard.writeText(phones).then(() => {
        alert(`تم نسخ ${filteredAttendees.length} رقم هاتف للحافظة بنجاح!`);
    }).catch(() => {
        alert('فشل النسخ. يرجى المحاولة يدوياً.');
    });
  };

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
            {isRealtime && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 animate-pulse">
                    <Zap className="w-3 h-3 mr-1" />
                    تحديث حي
                </span>
            )}
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
               <button
                onClick={handleExportExcel}
                className="inline-flex items-center justify-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none transition-colors"
                title="تصدير Excel"
              >
                <FileSpreadsheet className="h-4 w-4 ml-2 text-green-600" />
                Excel
              </button>
              <button
                onClick={handleCopyPhones}
                className="inline-flex items-center justify-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none transition-colors"
                title="نسخ الأرقام"
              >
                <Copy className="h-4 w-4 ml-2 text-blue-600" />
                نسخ
              </button>
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
              <Link
                to="/print-ready"
                className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none transition-colors"
              >
                <ImageIcon className="h-4 w-4 ml-2" />
                طباعة الجاهزين
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
            <option value="deposit">عربون</option>
            <option value="zero_deposit">عربون صفري (0 ج.م)</option>
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
                          <div className="text-base font-bold text-gray-900 flex flex-col gap-1">
                            <span className="flex flex-wrap items-center gap-2">
                              {attendee.full_name}
                              {attendee.preferred_neighbor_name && (
                                <span className="text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                                  يريد الجلوس بجوار: {attendee.preferred_neighbor_name}
                                </span>
                              )}
                            </span>
                            <span className="text-xs text-gray-500 font-mono" dir="ltr">{attendee.full_name_en}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className={`text-[11px] px-2 py-0.5 rounded border ${attendee.ticket_printed ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                              التيكت: {attendee.ticket_printed ? 'اتطبع' : 'لسه'}
                            </span>
                            <span className={`text-[11px] px-2 py-0.5 rounded border ${attendee.certificate_printed ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                              الشهادة: {attendee.certificate_printed ? 'اتطبعت' : 'لسه'}
                            </span>
                            {attendee.profile_photo_url && (
                                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border bg-indigo-50 text-indigo-700 border-indigo-200 font-bold" title="صورة العميل موجودة - جاهز للطباعة">
                                    <ImageIcon className="w-3 h-3" />
                                    جاهز للطباعة
                                </span>
                            )}
                          </div>
                          {attendee.full_name_en && (
                            <div className="text-xs text-gray-500 mt-0.5">{attendee.full_name_en}</div>
                          )}
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
                          <div className="mt-1.5 grid grid-cols-1 gap-1">
                            <div className="text-[11px] text-gray-500">
                              <span className="font-semibold text-gray-600">تاريخ الإنشاء:</span> {formatDateTime(attendee.created_at)}
                            </div>
                            <div className="text-[11px] text-gray-500">
                              <span className="font-semibold text-gray-600">آخر تعديل:</span> {formatDateTime(attendee.updated_at)}
                            </div>
                          </div>
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
                      <div className="text-sm font-medium text-gray-900">
                        {attendee.payment_amount} ج.م
                        {Number(attendee.payment_amount) === 0 && attendee.payment_type === 'deposit' && (
                            <span className="mr-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                                عربون صفري
                            </span>
                        )}
                      </div>
                      <div className="text-xs text-amber-600 mt-1">
                        عمولة: {Number(attendee.commission_amount || 0).toLocaleString()} ج.م
                      </div>
                      <div className="text-xs text-indigo-600 mt-1">
                        صافي: {Math.max(0, Number(attendee.payment_amount || 0) - Number(attendee.commission_amount || 0)).toLocaleString()} ج.م
                      </div>
                      <div className="text-xs text-blue-700 mt-1">
                        السعر الأساسي: {Number(attendee.base_ticket_price || attendee.ticket_price_override || (attendee.seat_class === 'A' ? 2000 : attendee.seat_class === 'B' ? 1700 : 1500)).toLocaleString()} ج.م
                      </div>
                      <div className="text-xs mt-1">
                        {attendee.certificate_included ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-green-100 text-green-700 border border-green-200">بشهادة</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">بدون شهادة</span>
                        )}
                      </div>
                          <div className="text-xs text-gray-500 mt-1">
                            المصدر: {attendee.sales_source_name || (attendee.sales_channel === 'direct' ? 'مباشر' : attendee.sales_channel === 'sales_team' ? 'تيم سيلز' : attendee.sales_channel === 'external_partner' ? 'شريك خارجي' : attendee.sales_channel === 'sponsor_referral' ? 'ترشيح راعي' : 'مباشر')}
                          </div>
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
                              title="معاينة التيكت"
                            >
                              <Ticket className="h-5 w-5" />
                            </Link>

                            <Link 
                              to={`/attendees/${attendee.id}/id-card?template=certificate`} 
                              className="p-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-full border border-emerald-200 transition-colors shadow-sm"
                              title="معاينة الشهادة"
                            >
                              <FileBadge2 className="h-5 w-5" />
                            </Link>

                            <Link 
                              to={`/attendees/${attendee.id}/id-card?template=back`} 
                              className="p-2 bg-slate-50 text-slate-600 hover:bg-slate-100 rounded-full border border-slate-200 transition-colors shadow-sm"
                              title="معاينة ظهر التيكت"
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

                            <button
                              onClick={() => setDownloadingQr(attendee)}
                              className="p-2 bg-purple-50 text-purple-600 hover:bg-purple-100 rounded-full border border-purple-200 transition-colors shadow-sm"
                              title="تحميل QR Code كـ PDF"
                            >
                              <QrCode className="h-5 w-5" />
                            </button>

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
                              disabled
                              className="p-2 bg-gray-300 text-gray-600 rounded-full border border-gray-300 cursor-not-allowed transition-colors shadow-sm"
                              title="الحذف النهائي معطل لحماية البيانات"
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

      {/* Hidden QR Code Canvas for downloading */}
      {downloadingQr && (
        <div style={{ display: 'none' }}>
          <QRCodeCanvas
            id="hidden-qr-canvas"
            value={downloadingQr.qr_code || downloadingQr.id}
            size={200}
            level="H"
          />
        </div>
      )}
    </div>
  );
};

export default Attendees;
