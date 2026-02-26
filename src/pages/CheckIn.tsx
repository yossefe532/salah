import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { api } from '../lib/api';
import { Attendee } from '../types';
import { useAuth } from '../context/AuthContext';
import { Check, X, AlertTriangle, Scan, Search, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

const CheckIn: React.FC = () => {
  const { user } = useAuth();
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [attendee, setAttendee] = useState<Attendee | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning', text: string } | null>(null);
  const [manualInput, setManualInput] = useState('');
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  const handleCheckIn = useCallback(async (code: string) => {
    if (!code || !user) return;
    
    // Avoid re-scanning same code immediately if success
    if (scanResult === code && message?.type === 'success') return;

    setScanResult(code);
    setMessage(null);
    setAttendee(null);

    try {
      const result = await api.post('/checkin', { code, userId: user.id });
      setAttendee(result.attendee);
      setMessage({ type: 'success', text: 'تم تسجيل الحضور بنجاح!' });
    } catch (error: any) {
      console.error('Check-in error:', error);
      
      if (error.attendee) {
          // Already checked in case
          setAttendee(error.attendee);
          const time = new Date(error.attendee.checked_in_at).toLocaleTimeString('ar-EG');
          setMessage({ type: 'warning', text: `تم تسجيل الحضور مسبقاً في الساعة ${time}` });
      } else {
          setMessage({ type: 'error', text: error.message || error.error || 'فشل تسجيل الحضور.' });
      }
    }
  }, [user, scanResult, message]);

  useEffect(() => {
    // Initialize Scanner
    try {
        const scanner = new Html5QrcodeScanner(
        "reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        /* verbose= */ false
        );
        scannerRef.current = scanner;

        const onScanSuccess = (decodedText: string) => {
        // Handle the scanned code
        handleCheckIn(decodedText);
        };
    
        const onScanFailure = () => {
        // handle scan failure, usually better to ignore and keep scanning.
        };

        scanner.render(onScanSuccess, onScanFailure);

        return () => {
             scanner.clear().catch(error => {
                console.error("Failed to clear html5QrcodeScanner. ", error);
             });
        };
    } catch (e) {
        console.error("Scanner init error", e);
    }
  }, [handleCheckIn]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleCheckIn(manualInput);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6" dir="rtl">
      <h1 className="text-2xl font-bold text-gray-900">ماسح الحضور (QR Scanner)</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Scanner Section */}
        <div className="bg-white p-4 rounded-lg shadow border border-gray-100">
          <div id="reader" className="w-full"></div>
          
          <div className="mt-4 border-t pt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">إدخال يدوي (باركود / كود)</p>
            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="امسح أو اكتب الكود..."
                className="flex-1 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                autoFocus
              />
              <button
                type="submit"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                تحقق
              </button>
            </form>
          </div>
        </div>

        {/* Result Section */}
        <div className="bg-white p-6 rounded-lg shadow border border-gray-100 flex flex-col justify-center min-h-[300px]">
          {!message && !attendee && (
            <div className="text-center text-gray-500">
              <Scan className="h-16 w-16 mx-auto mb-4 text-gray-300 animate-pulse" />
              <p className="text-lg">جاهز للمسح...</p>
              <p className="text-sm mt-2">استخدم الكاميرا أو جهاز الباركود</p>
            </div>
          )}

          {message && (
            <div className={`mb-6 p-4 rounded-lg flex items-start ${
              message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 
              message.type === 'warning' ? 'bg-yellow-50 text-yellow-800 border border-yellow-200' : 
              'bg-red-50 text-red-800 border border-red-200'
            }`}>
              <div className="flex-shrink-0 ml-3">
                {message.type === 'success' ? <CheckCircle className="h-8 w-8" /> : 
                 message.type === 'warning' ? <AlertCircle className="h-8 w-8" /> : 
                 <XCircle className="h-8 w-8" />}
              </div>
              <div className="text-xl font-bold">
                {message.text}
              </div>
            </div>
          )}

          {attendee && (
            <div className="border-t border-gray-200 pt-6 mt-2">
              <div className="flex items-center justify-between mb-6">
                <div className="h-20 w-20 bg-indigo-100 rounded-full flex items-center justify-center text-3xl font-bold text-indigo-600 shadow-sm">
                  {attendee.full_name?.charAt(0) || '?'}
                </div>
                <div className={`text-2xl font-bold px-4 py-2 rounded-lg ${attendee.seat_class === 'A' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                  فئة {attendee.seat_class}
                </div>
              </div>
              
              <h2 className="text-3xl font-bold text-gray-900 mb-4">{attendee.full_name}</h2>
              
              <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-right">
                <div className="sm:col-span-1">
                  <dt className="text-sm font-medium text-gray-500">المحافظة</dt>
                  <dd className="mt-1 text-lg font-medium text-gray-900">{attendee.governorate === 'Minya' ? 'المنيا' : attendee.governorate}</dd>
                </div>
                <div className="sm:col-span-1">
                  <dt className="text-sm font-medium text-gray-500">الحالة</dt>
                  <dd className="mt-1 text-lg font-medium text-gray-900 capitalize">
                    {attendee.status === 'registered' ? 'مسجل' : 'مهتم'}
                  </dd>
                </div>
                <div className="sm:col-span-1">
                  <dt className="text-sm font-medium text-gray-500">المدفوع</dt>
                  <dd className="mt-1 text-lg font-medium text-gray-900">{attendee.payment_amount} ج.م ({attendee.payment_type === 'full' ? 'كامل' : 'عربون'})</dd>
                </div>
                 <div className="sm:col-span-1">
                  <dt className="text-sm font-medium text-gray-500">المتبقي</dt>
                  <dd className={`mt-1 text-xl font-bold ${attendee.remaining_amount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {attendee.remaining_amount} ج.م
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CheckIn;