import React, { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Save, Phone, MessageCircle, AlertTriangle, CheckCircle, Trash2, Edit2, X, Check, Plus, Upload } from 'lucide-react';
import { Governorate, SeatClass, AttendeeStatus, PaymentType } from '../types';
import * as XLSX from 'xlsx';

type ParsedAttendee = {
  full_name: string;
  governorate: Governorate;
  phone_primary: string;
  status: AttendeeStatus;
  seat_class: SeatClass;
  payment_type: PaymentType;
  payment_amount: number;
  remaining_amount: number;
  id: string;
  created_at: string;
  created_by: string;
  qr_code: string;
  warnings?: string[];
};

type SkippedItem = {
  index?: string;
  reason: string;
  raw: string[];
};

const GOV_SYNONYMS: Record<Governorate, string[]> = {
  Minya: ['المنيا', 'منيا'],
  Asyut: ['اسيوط', 'أسيوط', 'أسيـوط', 'أسيوط'],
  Sohag: ['سوهاج', 'سوهـاج'],
  Qena: ['قنا'],
};

const parsePayment = (line: string): { payment_type: PaymentType; payment_amount: number } => {
  const cleanLine = line.replace(/01[0125]\d{8}/g, '').replace(/^\d+$/, '').trim();
  const nums = cleanLine.match(/\d+/g);
  if (nums && nums.length) {
    const amount = parseInt(nums[nums.length - 1] || '0', 10);
    if (amount > 0 && amount < 5000) {
       return { payment_type: 'deposit', payment_amount: amount };
    }
  }
  if (line.includes('كامل')) return { payment_type: 'full', payment_amount: 1700 };
  return { payment_type: 'deposit', payment_amount: 0 };
};

const ImportData: React.FC = () => {
  const [rawText, setRawText] = useState('');
  const [parsed, setParsed] = useState<ParsedAttendee[]>([]);
  const [skipped, setSkipped] = useState<SkippedItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const navigate = useNavigate();
  const [excelLoading, setExcelLoading] = useState(false);

  const headerMap: Record<string, keyof ParsedAttendee | 'paid' | 'gov'> = {
    'الاسم': 'full_name',
    'اسم': 'full_name',
    'name': 'full_name',
    'المحافظة': 'gov',
    'محافظة': 'gov',
    'governorate': 'gov',
    'رقم': 'phone_primary',
    'الموبايل': 'phone_primary',
    'الهاتف': 'phone_primary',
    'phone': 'phone_primary',
    'الفئة': 'seat_class',
    'class': 'seat_class',
    'الحالة': 'status',
    'status': 'status',
    'نوع الدفع': 'payment_type',
    'مدفوع': 'paid',
    'المدفوع': 'paid',
    'deposit': 'paid'
  };

  const normalizePhoneExcel = (s: any) => {
    const str = String(s ?? '').replace(/[^\d]/g, '');
    if (str.startsWith('10') && str.length === 10) return `0${str}`;
    if (str.length >= 11) return str.slice(0, 11);
    return str;
  };

  const toGovernorate = (val: any): Governorate | null => {
    const t = String(val ?? '').trim();
    for (const [g, syns] of Object.entries(GOV_SYNONYMS) as [Governorate, string[]][]) {
      if (syns.some(s => t.includes(s))) return g;
    }
    return null;
  };

  const onExcelFile = async (f: File) => {
    setExcelLoading(true);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
      if (!rows.length) {
        alert('ملف فارغ');
        setExcelLoading(false);
        return;
      }
      const headerRow: string[] = (rows[0] as string[]).map(h => String(h || '').toLowerCase().trim());
      const indices: Record<string, number> = {};
      headerRow.forEach((h, idx) => {
        const key = headerMap[h] || headerMap[h.replace(/\s+/g, '')] || null;
        if (key) indices[key] = idx;
      });

      const results: ParsedAttendee[] = [];
      const skippedItems: SkippedItem[] = [];

      for (let r = 1; r < rows.length; r++) {
        const row = rows[r] as any[];
        const nameVal = row[indices['full_name']] ?? row[0];
        const govVal = row[indices['gov']];
        const phoneVal = row[indices['phone_primary']];
        const classVal = row[indices['seat_class']];
        const statusVal = row[indices['status']];
        const typeVal = row[indices['payment_type']];
        const paidVal = row[indices['paid']];

        const name = String(nameVal || '').trim();
        const gov = toGovernorate(govVal);
        const phone = normalizePhoneExcel(phoneVal);
        if (!name || !gov || !phone) {
          skippedItems.push({ reason: 'بيانات ناقصة', raw: (row || []).map(x => String(x || '')) });
          continue;
        }

        let seat_class: SeatClass = 'A';
        const cls = String(classVal || '').toUpperCase();
        if (cls === 'B') seat_class = 'B';
        else if (cls === 'C') seat_class = 'C';

        let status: AttendeeStatus = 'interested';
        const st = String(statusVal || '').toLowerCase();
        if (st.includes('مسجل') || st.includes('registered')) status = 'registered';

        let payment_type: PaymentType = 'deposit';
        let payment_amount = 0;
        const t = String(typeVal || '').toLowerCase();
        if (t.includes('كامل') || t.includes('full')) {
          payment_type = 'full';
        }
        const paidNum = Number(String(paidVal || '0').replace(/[^\d]/g, '')) || 0;
        if (paidNum > 0) {
          payment_type = payment_type === 'full' ? 'full' : 'deposit';
          payment_amount = paidNum;
        }
        const price = seat_class === 'A' ? 2000 : seat_class === 'B' ? 1700 : 1500;
        const remaining_amount = payment_type === 'full' ? 0 : Math.max(0, price - payment_amount);

        results.push({
          full_name: name,
          governorate: gov,
          phone_primary: phone,
          status,
          seat_class,
          payment_type,
          payment_amount,
          remaining_amount,
          qr_code: crypto.randomUUID(),
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          created_by: 'import-agent',
          warnings: []
        });
      }

      setParsed(results);
      setSkipped(skippedItems);
    } catch (e) {
      alert('تعذر قراءة ملف Excel');
    } finally {
      setExcelLoading(false);
    }
  };
  const handleParse = () => {
    setIsProcessing(true);
    const text = rawText;
    const result: ParsedAttendee[] = [];
    const skippedItems: SkippedItem[] = [];

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    let currentRecord: string[] = [];
    let currentIdx: string = '';

    const processCurrent = (recordLines: string[], idx: string) => {
      if (recordLines.length === 0) return;
      const fullText = recordLines.join(' ');
      
      let gov: Governorate | null = null;
      let govMatchStr = '';
      for (const [g, syns] of Object.entries(GOV_SYNONYMS) as [Governorate, string[]][]) {
        for (const s of syns) {
          if (fullText.includes(s)) {
            gov = g;
            govMatchStr = s;
            break;
          }
        }
        if (gov) break;
      }

      const allDigits = fullText.replace(/[^\d]/g, '');
      const phoneMatch = allDigits.match(/01[0125]\d{8}/);
      const phone = phoneMatch ? phoneMatch[0] : '';

      let name = '';
      if (govMatchStr) {
        name = fullText.split(govMatchStr)[0].trim();
      } else if (phone) {
        const firstDigit = phone[0];
        const phoneStartIdx = fullText.indexOf(firstDigit);
        name = fullText.slice(0, phoneStartIdx).trim();
      } else {
        name = recordLines[0]; 
      }
      
      name = name.replace(/^(?:\d+|-|م\/|م\\|م\.|د\.|م )\s*/g, '').trim();

      if (!name || !gov || !phone) {
        let reason = 'بيانات ناقصة: ';
        const missing = [];
        if (!name) missing.push('الاسم');
        if (!gov) missing.push('المحافظة');
        if (!phone) missing.push('الهاتف');
        reason += missing.join('، ');
        skippedItems.push({ index: idx, reason, raw: recordLines });
        return;
      }

      let status: AttendeeStatus = 'interested';
      if (/مسجل/.test(fullText)) status = 'registered';
      
      const { payment_type, payment_amount } = parsePayment(fullText);
      const remaining_amount = payment_type === 'full' ? 0 : Math.max(0, 1700 - payment_amount);

      result.push({
        full_name: name,
        governorate: gov,
        phone_primary: phone,
        status,
        seat_class: 'A',
        payment_type,
        payment_amount,
        remaining_amount,
        qr_code: crypto.randomUUID(),
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        created_by: 'import-agent',
        warnings: [],
      });
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\d+$/.test(line)) {
        if (currentRecord.length > 0) processCurrent(currentRecord, currentIdx);
        currentRecord = [];
        currentIdx = line;
      } else {
        currentRecord.push(line);
      }
    }
    if (currentRecord.length > 0) processCurrent(currentRecord, currentIdx);

    setParsed(result);
    setSkipped(skippedItems);
    setIsProcessing(false);
  };

  const handleUpdateAttendee = (id: string, updates: Partial<ParsedAttendee>) => {
    setParsed(prev => prev.map(a => {
        if (a.id === id) {
            const updated = { ...a, ...updates };
            // Recalculate remaining
            const price = updated.seat_class === 'A' ? 2000 : updated.seat_class === 'B' ? 1700 : 1500;
            updated.remaining_amount = updated.payment_type === 'full' ? 0 : Math.max(0, price - updated.payment_amount);
            return updated;
        }
        return a;
    }));
  };

  const handleDeleteAttendee = (id: string) => {
    setParsed(prev => prev.filter(a => a.id !== id));
  };

  const handleFixSkipped = (idx: number) => {
      const item = skipped[idx];
      const newId = crypto.randomUUID();
      const fixed: ParsedAttendee = {
          full_name: item.raw[0] || '',
          governorate: 'Minya',
          phone_primary: '',
          status: 'interested',
          seat_class: 'A',
          payment_type: 'deposit',
          payment_amount: 0,
          remaining_amount: 2000,
          id: newId,
          qr_code: newId,
          created_at: new Date().toISOString(),
          created_by: 'import-agent'
      };
      setParsed(prev => [fixed, ...prev]);
      setSkipped(prev => prev.filter((_, i) => i !== idx));
      setEditingId(newId);
  };

  const handleImport = async () => {
    setImporting(true);
    let successCount = 0;
    let failCount = 0;
    
    // Batch processing to avoid overwhelming the server/browser
    const BATCH_SIZE = 50;
    const batches = [];
    
    // Get existing phones once
    let existingPhones = new Set();
    try {
        const existing = await api.get('/attendees');
        existingPhones = new Set(existing.map((a: any) => a.phone_primary));
    } catch (e) {
        console.error('Failed to fetch existing attendees, proceeding with caution');
    }

    const uniqueNew = parsed.filter(a => !existingPhones.has(a.phone_primary));
    
    if (uniqueNew.length === 0) {
        alert('لا توجد بيانات جديدة للحفظ (الكل موجود مسبقاً)');
        setImporting(false);
        return;
    }

    for (let i = 0; i < uniqueNew.length; i += BATCH_SIZE) {
        batches.push(uniqueNew.slice(i, i + BATCH_SIZE));
    }

    try {
      for (let i = 0; i < batches.length; i++) {
          const batch = batches[i];
          // Process batch in parallel requests
          await Promise.all(batch.map(async (attendee) => {
              try {
                  const { id, ...data } = attendee;
                  
                  // Fix missing phone numbers (Generate dummy phone if missing)
                  // Database requires phone_primary NOT NULL
                  if (!data.phone_primary || data.phone_primary.trim() === '') {
                      data.phone_primary = `no-phone-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                  }

                  await api.post('/attendees', data);
                  successCount++;
              } catch (e: any) {
                  console.error('Failed to import:', attendee.full_name, e);
                  failCount++;
                  // Log error for the first failure to help debug
                  if (failCount === 1) console.log('First Error Detail:', e);
              }
          }));
          
          // Optional: slight delay between batches to be nice to the server
          if (i < batches.length - 1) await new Promise(r => setTimeout(r, 500));
      }

      let msg = `تم استيراد ${successCount} بنجاح.`;
      if (failCount > 0) msg += ` فشل ${failCount} (ربما مكرر أو بيانات غير صالحة).`;
      alert(msg);
      navigate('/attendees');
    } catch (e) {
      alert('حدث خطأ غير متوقع أثناء الاستيراد');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <h1 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-2">
            <Upload className="h-6 w-6 text-indigo-600" />
            الاستيراد الذكي للبيانات
        </h1>
        <p className="text-gray-500 mb-6">يمكنك إما لصق القائمة أو رفع ملف Excel مباشرة.</p>
        <div className="flex items-center gap-3 mb-4">
          <label className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 cursor-pointer">
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onExcelFile(f); }} />
            {excelLoading ? 'جاري قراءة الملف...' : 'رفع ملف Excel'}
          </label>
          <span className="text-xs text-gray-500">الأعمدة المقترحة: الاسم، المحافظة، الهاتف، الفئة، الحالة، المدفوع/نوع الدفع</span>
        </div>
        
        <textarea
          className="w-full h-48 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono text-sm mb-4"
          placeholder="ألصق القائمة هنا..."
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
        />

        <div className="flex justify-end">
          <button
            onClick={handleParse}
            disabled={!rawText || isProcessing}
            className="inline-flex items-center px-8 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 font-bold"
          >
            {isProcessing ? 'جاري التحليل...' : 'بدء التحليل الذكي'}
          </button>
        </div>
      </div>

      {(parsed.length > 0 || skipped.length > 0) && (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-6 pb-4 border-b">
             <div className="flex gap-4">
                <div className="bg-green-50 text-green-700 px-4 py-2 rounded-lg border border-green-200">
                    <span className="text-2xl font-bold">{parsed.length}</span>
                    <span className="mr-2">مفهوم</span>
                </div>
                <div className="bg-yellow-50 text-yellow-700 px-4 py-2 rounded-lg border border-yellow-200">
                    <span className="text-2xl font-bold">{skipped.length}</span>
                    <span className="mr-2">غير مفهوم</span>
                </div>
             </div>
             <button
                onClick={handleImport}
                disabled={importing || parsed.length === 0}
                className="inline-flex items-center px-8 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 font-bold shadow-lg"
             >
                <Save className="ml-2 h-5 w-5" />
                {importing ? 'جاري الحفظ...' : 'حفظ البيانات المفهومة'}
             </button>
          </div>

          {/* Parsed List */}
          {parsed.length > 0 && (
            <div className="overflow-x-auto mb-8">
              <h3 className="text-lg font-bold text-gray-800 mb-4">البيانات المكتشفة (يمكنك التعديل قبل الحفظ)</h3>
              <table className="min-w-full divide-y divide-gray-200 text-right text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3">الاسم</th>
                    <th className="px-4 py-3">المحافظة</th>
                    <th className="px-4 py-3">الهاتف</th>
                    <th className="px-4 py-3">الفئة</th>
                    <th className="px-4 py-3">المدفوع</th>
                    <th className="px-4 py-3">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {parsed.map((item) => (
                    <tr key={item.id} className={editingId === item.id ? 'bg-indigo-50' : ''}>
                      <td className="px-4 py-2">
                        {editingId === item.id ? (
                            <input 
                                className="border rounded p-1 w-full"
                                value={item.full_name}
                                onChange={(e) => handleUpdateAttendee(item.id, { full_name: e.target.value })}
                            />
                        ) : item.full_name}
                      </td>
                      <td className="px-4 py-2">
                        {editingId === item.id ? (
                            <select 
                                className="border rounded p-1 w-full"
                                value={item.governorate}
                                onChange={(e) => handleUpdateAttendee(item.id, { governorate: e.target.value as Governorate })}
                            >
                                <option value="Minya">المنيا</option>
                                <option value="Asyut">أسيوط</option>
                                <option value="Sohag">سوهاج</option>
                                <option value="Qena">قنا</option>
                            </select>
                        ) : item.governorate}
                      </td>
                      <td className="px-4 py-2 font-mono">
                        {editingId === item.id ? (
                            <input 
                                className="border rounded p-1 w-full"
                                value={item.phone_primary}
                                onChange={(e) => handleUpdateAttendee(item.id, { phone_primary: e.target.value })}
                            />
                        ) : item.phone_primary}
                      </td>
                      <td className="px-4 py-2">
                         {editingId === item.id ? (
                            <select 
                                className="border rounded p-1 w-full"
                                value={item.seat_class}
                                onChange={(e) => handleUpdateAttendee(item.id, { seat_class: e.target.value as SeatClass })}
                            >
                                <option value="A">A</option>
                                <option value="B">B</option>
                                <option value="C">C</option>
                            </select>
                        ) : item.seat_class}
                      </td>
                      <td className="px-4 py-2">
                        {editingId === item.id ? (
                            <div className="flex gap-1 items-center">
                                <input 
                                    type="number"
                                    className="border rounded p-1 w-20"
                                    value={item.payment_amount}
                                    onChange={(e) => handleUpdateAttendee(item.id, { payment_amount: Number(e.target.value) })}
                                />
                                <select 
                                    className="border rounded p-1"
                                    value={item.payment_type}
                                    onChange={(e) => handleUpdateAttendee(item.id, { payment_type: e.target.value as PaymentType })}
                                >
                                    <option value="deposit">عربون</option>
                                    <option value="full">كامل</option>
                                </select>
                            </div>
                        ) : (
                            <span className="font-bold text-green-700">{item.payment_amount} ج.م</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditingId(editingId === item.id ? null : item.id)}
                            className={`p-1 rounded ${editingId === item.id ? 'bg-green-600 text-white' : 'text-indigo-600 hover:bg-indigo-50'}`}
                          >
                            {editingId === item.id ? <Check className="h-4 w-4" /> : <Edit2 className="h-4 w-4" />}
                          </button>
                          <button
                            onClick={() => handleDeleteAttendee(item.id)}
                            className="text-red-500 p-1 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Skipped Items */}
          {skipped.length > 0 && (
            <div className="mt-8 border-t pt-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  بيانات لم يتم فهمها (تحتاج تدخل يدوي)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {skipped.map((s, i) => (
                  <div key={i} className="p-4 rounded-lg bg-yellow-50 border border-yellow-200 flex flex-col justify-between">
                    <div className="mb-3">
                        <div className="text-xs font-bold text-yellow-800 mb-1">{s.reason}</div>
                        <div className="text-sm font-mono text-gray-600 whitespace-pre-wrap">{s.raw.join('\n')}</div>
                    </div>
                    <button 
                        onClick={() => handleFixSkipped(i)}
                        className="self-end flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline"
                    >
                        <Plus className="h-3 w-3" />
                        تعديل وإضافة للقائمة
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ImportData;
