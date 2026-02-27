import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';
import { CheckCircle, AlertTriangle, Loader2, Database } from 'lucide-react';

const Setup: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const createTablesAndAdmin = async () => {
    setStatus('loading');
    try {
      // 1. Create Users Table (using RPC or direct SQL if possible, but client-side creation is limited)
      // Since we can't run DDL from client easily without extensions, we will try a different approach.
      // We'll rely on the fact that if 'full_name' is missing, the table might be wrong.
      
      // Attempt to create Admin directly. If it fails due to missing column, we can't fix it from here 
      // without SQL Editor access in Supabase Dashboard.
      // BUT, we can try to insert a dummy record to force error or check.
      
      const { error: insertError } = await supabase
        .from('users')
        .insert([
          {
            id: '00000000-0000-0000-0000-000000000000',
            email: 'admin@event.com',
            full_name: 'System Owner',
            role: 'owner',
            password: 'admin123',
            created_at: new Date().toISOString()
          }
        ]);

      if (insertError) {
          // If error is about duplicate key, it means admin exists -> Success
          if (insertError.code === '23505') {
              setStatus('success');
              setMessage('المستخدم المسؤول (Admin) موجود بالفعل! يمكنك تسجيل الدخول.');
              return;
          }
          throw insertError;
      }

      setStatus('success');
      setMessage('تم إنشاء حساب المدير بنجاح!');
    } catch (e: any) {
      setStatus('error');
      console.error(e);
      if (e.message?.includes('full_name')) {
          setMessage('خطأ: قاعدة البيانات غير مهيأة (الجداول ناقصة). يجب عليك تشغيل كود SQL في لوحة تحكم Supabase.');
      } else {
          setMessage(e.message || 'حدث خطأ غير متوقع');
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8" dir="rtl">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          إعداد النظام الأولي
        </h2>
        
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mt-4">
            <div className="flex">
                <div className="flex-shrink-0">
                    <AlertTriangle className="h-5 w-5 text-yellow-400" aria-hidden="true" />
                </div>
                <div className="ml-3">
                    <p className="text-sm text-yellow-700">
                        تنبيه: إذا ظهر لك خطأ "full_name not found"، فهذا يعني أنك لم تنشئ الجداول في Supabase.
                        <br/>
                        <strong>الحل:</strong> افتح Supabase &gt; SQL Editor والصق الكود الموجود في الملف <code>supabase/migrations/...</code>
                    </p>
                </div>
            </div>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {status === 'idle' && (
            <button
              onClick={createTablesAndAdmin}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none"
            >
              محاولة إنشاء المدير (Admin)
            </button>
          )}

          {status === 'loading' && (
            <div className="flex justify-center py-4">
              <Loader2 className="animate-spin h-8 w-8 text-indigo-600" />
            </div>
          )}

          {status === 'success' && (
            <div className="rounded-md bg-green-50 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                    <CheckCircle className="h-5 w-5 text-green-400" />
                </div>
                <div className="mr-3">
                  <h3 className="text-sm font-medium text-green-800">تم بنجاح</h3>
                  <div className="mt-2 text-sm text-green-700">
                    <p>{message}</p>
                    <p className="font-bold mt-2">Email: admin@event.com</p>
                    <p className="font-bold">Pass: admin123</p>
                  </div>
                  <div className="mt-4">
                    <Link to="/login" className="text-indigo-600 hover:text-indigo-500 font-medium">
                        الذهاب لصفحة الدخول &larr;
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <AlertTriangle className="h-5 w-5 text-red-400" />
                </div>
                <div className="mr-3">
                  <h3 className="text-sm font-medium text-red-800">فشل الإعداد</h3>
                  <div className="mt-2 text-sm text-red-700">
                    <p>{message}</p>
                  </div>
                  <button onClick={() => setStatus('idle')} className="mt-2 text-red-600 hover:text-red-500 font-medium">
                      المحاولة مرة أخرى
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Setup;
