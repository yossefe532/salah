import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Sparkles } from 'lucide-react';

type LogicIssue = {
  key: string;
  attendee_ids: string[];
  attendee_names: string[];
  seat_codes: string[];
  seat_class: string;
  reason: string;
};

type LogicReport = {
  success: boolean;
  event_id: string;
  governorate: string;
  count: number;
  updated_at: string;
  issues: LogicIssue[];
};

type AttendeeOption = {
  id: string;
  full_name: string;
  seat_class: 'A' | 'B' | 'C';
  barcode?: string | null;
};

const SeatingLogic: React.FC = () => {
  const [governorate, setGovernorate] = useState<'Minya' | 'Asyut' | 'Sohag' | 'Qena'>('Minya');
  const [report, setReport] = useState<LogicReport | null>(null);
  const [attendees, setAttendees] = useState<AttendeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [solvingKey, setSolvingKey] = useState<string>('');
  const [selectedPerson, setSelectedPerson] = useState('');
  const [selectedNeighbor, setSelectedNeighbor] = useState('');
  const [message, setMessage] = useState<string>('');

  const eventId = `${governorate.toUpperCase()}-2026-MAIN`;

  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const [reportData, attendeesData] = await Promise.all([
        api.get(`/seating/logic/report?eventId=${eventId}`),
        api.get(`/seating/attendees?eventId=${eventId}`)
      ]);
      setReport(reportData as LogicReport);
      setAttendees((Array.isArray(attendeesData) ? attendeesData : []) as AttendeeOption[]);
    } catch (error: any) {
      setMessage(error?.message || 'تعذر تحميل شاشة المنطقيات');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  const solvePair = async (attendeeIds: string[], keyForLoading: string) => {
    if (!Array.isArray(attendeeIds) || attendeeIds.length < 2) return;
    setSolvingKey(keyForLoading);
    setMessage('');
    try {
      await api.post('/seating/logic/solve', { event_id: eventId, attendee_ids: attendeeIds });
      setMessage('تم تطبيق حل منطقي ناجح');
      await load();
    } catch (error: any) {
      setMessage(error?.message || 'فشل الحل المنطقي');
    } finally {
      setSolvingKey('');
    }
  };

  const solveAll = async () => {
    if (!report?.issues?.length) return;
    setSolvingKey('__all__');
    setMessage('');
    let solved = 0;
    let failed = 0;
    for (const issue of report.issues) {
      try {
        await api.post('/seating/logic/solve', { event_id: eventId, attendee_ids: issue.attendee_ids });
        solved += 1;
      } catch {
        failed += 1;
      }
    }
    await load();
    setSolvingKey('');
    setMessage(`حلّ: ${solved} | تعذر: ${failed}`);
  };

  const neighborsForSelected = useMemo(() => {
    const person = attendees.find((a) => a.id === selectedPerson);
    if (!person) return [];
    return attendees.filter((a) => a.id !== person.id && a.seat_class === person.seat_class);
  }, [attendees, selectedPerson]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">منطقيات التسكين</h1>
            <p className="text-sm text-gray-500">اكتشاف العلاقات غير المتجاورة + حل ذكي تلقائي</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={governorate}
              onChange={(e) => setGovernorate(e.target.value as 'Minya' | 'Asyut' | 'Sohag' | 'Qena')}
              className="rounded-md px-3 py-2 border border-gray-300 text-sm"
            >
              <option value="Minya">المنيا</option>
              <option value="Asyut">أسيوط</option>
              <option value="Sohag">سوهاج</option>
              <option value="Qena">قنا</option>
            </select>
            <button onClick={load} className="inline-flex items-center px-3 py-2 rounded-md border border-gray-300 text-sm hover:bg-gray-50">
              <RefreshCw className="w-4 h-4 ml-1" /> تحديث
            </button>
            <button
              onClick={solveAll}
              disabled={!report?.issues?.length || solvingKey === '__all__'}
              className="inline-flex items-center px-3 py-2 rounded-md bg-indigo-600 text-white text-sm disabled:opacity-50"
            >
              {solvingKey === '__all__' ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <Sparkles className="w-4 h-4 ml-1" />}
              حل الكل
            </button>
          </div>
        </div>
        {message && (
          <div className="mt-3 text-sm rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 px-3 py-2">{message}</div>
        )}
      </div>

      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
        <h2 className="font-bold text-gray-900 mb-3">بحث منطقي مباشر</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <select value={selectedPerson} onChange={(e) => setSelectedPerson(e.target.value)} className="rounded-md px-3 py-2 border border-gray-300 text-sm">
            <option value="">اختر الشخص</option>
            {attendees.map((a) => (
              <option key={a.id} value={a.id}>{a.full_name} ({a.seat_class})</option>
            ))}
          </select>
          <select value={selectedNeighbor} onChange={(e) => setSelectedNeighbor(e.target.value)} className="rounded-md px-3 py-2 border border-gray-300 text-sm">
            <option value="">اجعله يجلس بجانب...</option>
            {neighborsForSelected.map((a) => (
              <option key={a.id} value={a.id}>{a.full_name}</option>
            ))}
          </select>
          <button
            onClick={() => solvePair([selectedPerson, selectedNeighbor], '__manual__')}
            disabled={!selectedPerson || !selectedNeighbor || solvingKey === '__manual__'}
            className="rounded-md bg-emerald-600 text-white text-sm px-3 py-2 disabled:opacity-50"
          >
            {solvingKey === '__manual__' ? 'جاري الحل...' : 'تنفيذ الحل المقترح'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 text-sm font-bold text-gray-700">
          التعارضات الحالية: {report?.count || 0}
        </div>
        {!report?.issues?.length ? (
          <div className="p-10 text-center text-emerald-700">
            <CheckCircle2 className="mx-auto w-10 h-10 mb-2" />
            لا توجد تعارضات حالياً
          </div>
        ) : (
          <div className="divide-y">
            {report.issues.map((issue) => (
              <div key={issue.key} className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    {issue.attendee_names.join(' + ')}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    المقاعد الحالية: {issue.seat_codes.join(' | ')} | الفئة: {issue.seat_class}
                  </div>
                </div>
                <button
                  onClick={() => solvePair(issue.attendee_ids, issue.key)}
                  disabled={solvingKey === issue.key}
                  className="px-3 py-2 rounded-md bg-indigo-600 text-white text-sm disabled:opacity-50"
                >
                  {solvingKey === issue.key ? 'جاري الحل...' : 'حل'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SeatingLogic;
