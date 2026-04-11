import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Attendee } from '../types';
import { Download, FileBadge2, Image as ImageIcon, Ticket, Loader2, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

const PrintReady: React.FC = () => {
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetchReadyAttendees();
  }, []);

  const fetchReadyAttendees = async () => {
    try {
      const data: Attendee[] = await api.get('/attendees');
      // Filter those who are registered, have a photo, and haven't printed BOTH ticket and certificate yet
      const ready = data.filter(a => 
        a.status === 'registered' && 
        !a.is_deleted && 
        a.profile_photo_url && 
        !(a.ticket_printed && a.certificate_printed)
      );
      setAttendees(ready);
    } catch (error) {
      console.error('Error fetching print ready attendees:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAllAsPrinted = async () => {
    if (!window.confirm(`سيتم تحديد ${attendees.length} عميل كـ (تمت الطباعة) للتيكت والشهادة. هل تريد الاستمرار؟`)) return;
    
    setIsProcessing(true);
    try {
       // Using a loop to avoid hitting rate limits for large lists
       for (const a of attendees) {
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
            العملاء الذين تم إضافة صورة شخصية لهم ولم يتم طباعة تذاكرهم أو شهاداتهم بعد. ({attendees.length} عميل)
          </p>
        </div>
        {attendees.length > 0 && (
          <button
            onClick={markAllAsPrinted}
            disabled={isProcessing}
            className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-bold rounded-md shadow-sm text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none disabled:opacity-50"
          >
            {isProcessing ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <CheckCircle className="h-4 w-4 ml-2" />}
            تحديد الكل كـ (مطبوع)
          </button>
        )}
      </div>

      <div className="bg-white shadow-lg rounded-lg overflow-hidden border border-gray-100">
        {attendees.length === 0 ? (
          <div className="text-center py-16 bg-gray-50">
            <CheckCircle className="mx-auto h-12 w-12 text-emerald-400" />
            <p className="mt-2 text-lg text-gray-500 font-bold">لا يوجد عملاء في الانتظار!</p>
            <p className="text-sm text-gray-400">جميع العملاء الذين يمتلكون صورة شخصية تم طباعة مستنداتهم.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
             {attendees.map(a => (
                <div key={a.id} className="flex items-start gap-4 p-4 border border-gray-200 rounded-lg hover:border-indigo-300 transition-colors bg-gray-50">
                   <div className="w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-gray-200 border border-gray-300">
                      <img src={a.profile_photo_url || ''} alt="Profile" className="w-full h-full object-cover" />
                   </div>
                   <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-gray-900 truncate" title={a.full_name}>{a.full_name}</h3>
                      <p className="text-xs text-gray-500">{a.phone_primary}</p>
                      <div className="mt-2 flex items-center gap-2">
                         <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold border border-indigo-200">
                            {a.seat_class}-{a.seat_number}
                         </span>
                         <span className="text-[10px] px-2 py-0.5 rounded bg-slate-200 text-slate-700 border border-slate-300">
                            {a.governorate}
                         </span>
                      </div>
                      <div className="mt-3 flex gap-2">
                         <Link 
                           to={`/attendees/${a.id}/id-card`} 
                           target="_blank"
                           className="flex-1 flex justify-center items-center gap-1 p-1.5 bg-white border border-gray-300 rounded text-xs hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                         >
                           <Ticket className="w-3 h-3" /> التيكت
                         </Link>
                         <Link 
                           to={`/attendees/${a.id}/id-card?template=certificate`} 
                           target="_blank"
                           className="flex-1 flex justify-center items-center gap-1 p-1.5 bg-white border border-gray-300 rounded text-xs hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
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