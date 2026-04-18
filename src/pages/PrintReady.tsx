import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../lib/api';
import { Attendee } from '../types';
import { AlertCircle, CheckCircle, FileBadge2, Image as ImageIcon, Loader2, Ticket } from 'lucide-react';
import { Link } from 'react-router-dom';

const PrintReady: React.FC = () => {
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [photoFilter, setPhotoFilter] = useState<'ready' | 'not_ready'>('ready');

  useEffect(() => {
    fetchReadyAttendees();
  }, []);

  const fetchReadyAttendees = async () => {
    try {
      const data: Attendee[] = await api.get('/attendees');
      const eligible = (data || []).filter((a) => a.status === 'registered' && !a.is_deleted);
      setAttendees(eligible);
    } catch (error) {
      console.error('Error fetching print ready attendees:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAllAsPrinted = async () => {
    const target = filteredAttendees.filter((a) => !(a.ticket_printed && a.certificate_printed));
    if (!target.length) return;
    if (!window.confirm(`سيتم تحديد ${target.length} عميل كـ (تمت الطباعة) للتيكت والشهادة. هل تريد الاستمرار؟`)) return;
    
    setIsProcessing(true);
    try {
       // Using a loop to avoid hitting rate limits for large lists
       for (const a of target) {
          if (!a.ticket_printed) await api.patch(`/attendees/${a.id}/mark-printed`, { document_type: 'ticket' });
          if (!a.certificate_printed) await api.patch(`/attendees/${a.id}/mark-printed`, { document_type: 'certificate' });
       }
       alert('تم تحديد الجميع كـ مطبوع بنجاح!');
       fetchReadyAttendees(); // Refresh list (should be empty now)
    } catch (error: any) {
       alert('حدث خطأ أثناء التحديث: ' + error.message);
    } finally {
       setIsProcessing(false);
    }
  };

  const filteredAttendees = useMemo(() => {
    const isReadyByPhoto = (a: Attendee) => Boolean(String(a.profile_photo_url || '').trim());
    const list = attendees.filter((a) => (photoFilter === 'ready' ? isReadyByPhoto(a) : !isReadyByPhoto(a)));

    // Raise seat-changed attendees to top.
    return [...list].sort((a, b) => {
      const aPending = a.seat_change_pending ? 1 : 0;
      const bPending = b.seat_change_pending ? 1 : 0;
      if (aPending !== bPending) return bPending - aPending;
      const aTime = new Date(String(a.seat_change_last_at || a.updated_at || a.created_at || 0)).getTime();
      const bTime = new Date(String(b.seat_change_last_at || b.updated_at || b.created_at || 0)).getTime();
      return bTime - aTime;
    });
  }, [attendees, photoFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between bg-white p-4 rounded-lg shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ImageIcon className="h-6 w-6 text-emerald-600" />
            الجاهزين للطباعة
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            متابعة جاهزية الصور + أولوية من تغيّر كرسيهم مع سجل زمني للتغييرات.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPhotoFilter('ready')}
            className={`px-3 py-2 rounded-md text-sm border ${photoFilter === 'ready' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-gray-300 text-gray-700'}`}
          >
            جاهز للطباعة
          </button>
          <button
            onClick={() => setPhotoFilter('not_ready')}
            className={`px-3 py-2 rounded-md text-sm border ${photoFilter === 'not_ready' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white border-gray-300 text-gray-700'}`}
          >
            غير جاهز للطباعة
          </button>
          {filteredAttendees.length > 0 && (
            <button
              onClick={markAllAsPrinted}
              disabled={isProcessing || photoFilter !== 'ready'}
              className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-bold rounded-md shadow-sm text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none disabled:opacity-50"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <CheckCircle className="h-4 w-4 ml-2" />}
              تحديد الكل كـ (مطبوع)
            </button>
          )}
        </div>
      </div>

      <div className="bg-white shadow-lg rounded-lg overflow-hidden border border-gray-100">
        {filteredAttendees.length === 0 ? (
          <div className="text-center py-16 bg-gray-50">
            {photoFilter === 'ready' ? <CheckCircle className="mx-auto h-12 w-12 text-emerald-400" /> : <AlertCircle className="mx-auto h-12 w-12 text-amber-400" />}
            <p className="mt-2 text-lg text-gray-500 font-bold">
              {photoFilter === 'ready' ? 'لا يوجد عملاء جاهزين للطباعة حالياً' : 'لا يوجد عملاء غير جاهزين حالياً'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
             {filteredAttendees.map(a => (
                <div key={a.id} className="flex items-start gap-4 p-4 border border-gray-200 rounded-lg hover:border-indigo-300 transition-colors bg-gray-50">
                   <div className="w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-gray-200 border border-gray-300 relative">
                      {a.profile_photo_url ? (
                        <img src={a.profile_photo_url || ''} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-500">بدون صورة</div>
                      )}
                   </div>
                   <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-gray-900 truncate flex items-center gap-2" title={a.full_name}>
                        {a.seat_change_pending && (
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.9)] animate-pulse"
                            title="تم تغيير الكرسي مؤخراً"
                          />
                        )}
                        <span>{a.full_name}</span>
                      </h3>
                      <p className="text-xs text-gray-500">{a.phone_primary}</p>
                      <div className="mt-2 flex items-center gap-2">
                         <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold border border-indigo-200">
                            {a.seat_class}-{a.seat_number}
                         </span>
                         <span className="text-[10px] px-2 py-0.5 rounded bg-slate-200 text-slate-700 border border-slate-300">
                            {a.governorate}
                         </span>
                      </div>
                      {Array.isArray(a.seat_change_history) && a.seat_change_history.length > 0 && (
                        <div className="mt-2 rounded-md bg-yellow-50 border border-yellow-200 p-2">
                          <div className="text-[11px] font-bold text-yellow-800 mb-1">تاريخ تغييرات الكرسي</div>
                          <div className="space-y-1 max-h-20 overflow-auto">
                            {[...a.seat_change_history].slice(-3).reverse().map((entry, idx) => (
                              <div key={`${a.id}-${idx}`} className="text-[10px] text-yellow-900">
                                {String(entry.from || '-')} ← {String(entry.to || '-')} | {new Date(entry.at).toLocaleString('ar-EG')}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="mt-3 flex gap-2">
                         <Link 
                           to={`/attendees/${a.id}/id-card`} 
                           target="_blank"
                           className={`flex-1 flex justify-center items-center gap-1 p-1.5 bg-white border rounded text-xs transition-colors ${a.profile_photo_url ? 'border-gray-300 hover:bg-indigo-50 hover:text-indigo-600' : 'border-gray-200 text-gray-400 pointer-events-none'}`}
                         >
                           <Ticket className="w-3 h-3" /> التيكت
                         </Link>
                         <Link 
                           to={`/attendees/${a.id}/id-card?template=certificate`} 
                           target="_blank"
                           className={`flex-1 flex justify-center items-center gap-1 p-1.5 bg-white border rounded text-xs transition-colors ${a.profile_photo_url ? 'border-gray-300 hover:bg-emerald-50 hover:text-emerald-600' : 'border-gray-200 text-gray-400 pointer-events-none'}`}
                         >
                           <FileBadge2 className="w-3 h-3" /> الشهادة
                         </Link>
                      </div>
                   </div>
                </div>
             ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PrintReady;
