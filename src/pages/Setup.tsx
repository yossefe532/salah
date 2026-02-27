import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';
import { CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';

const Setup: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const createAdmin = async () => {
    setStatus('loading');
    try {
      // 1. Check if admin exists
      const { data: existing } = await supabase
        .from('users')
        .select('*')
        .eq('email', 'admin@event.com')
        .single();

      if (existing) {
        setStatus('success');
        setMessage('المستخدم المسؤول (Admin) موجود بالفعل! يمكنك تسجيل الدخول الآن.');
        return;
      }

      // 2. Create Admin
      const { error } = await supabase
        .from('users')
        .insert([
          {
            id: '00000000-0000-0000-0000-000000000000',
            email: 'admin@event.com',
            full_name: 'System Owner',
            role: 'owner',
            password: 'admin123', // In production, hash this!
            created_at: new Date().toISOString()
          }
        ]);

      if (error) throw error;

      setStatus('success');
      setMessage('تم إنشاء حساب المدير بنجاح!');
    } catch (e: any) {
      setStatus('error');
      setMessage(e.message || 'حدث خطأ أثناء الإنشاء');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8" dir="rtl">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          إعداد النظام الأولي
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          استخدم هذه الصفحة لإنشاء حساب المدير الأول في قاعدة البيانات السحابية.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {status === 'idle' && (
            <button
              onClick={createAdmin}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              إنشاء حساب المدير (Admin)
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
                  <CheckCircle className="h-5 w-5 text-green-400" aria-hidden="true" />
                </div>
                <div className="mr-3">
                  <h3 className="text-sm font-medium text-green-800">نجاح</h3>
                  <div className="mt-2 text-sm text-green-700">
                    <p>{message}</p>
                    <p className="mt-2 font-bold">البريد: admin@event.com</p>
                    <p className="font-bold">كلمة السر: admin123</p>
                  </div>
                  <div className="mt-4">
                    <div className="-mx-2 -my-1.5 flex">
                      <Link
                        to="/login"
                        className="bg-green-50 px-2 py-1.5 rounded-md text-sm font-medium text-green-800 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-green-50 focus:ring-green-600"
                      >
                        الذهاب لصفحة الدخول &larr;
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <AlertTriangle className="h-5 w-5 text-red-400" aria-hidden="true" />
                </div>
                <div className="mr-3">
                  <h3 className="text-sm font-medium text-red-800">خطأ</h3>
                  <div className="mt-2 text-sm text-red-700">
                    <p>{message}</p>
                  </div>
                  <button
                    onClick={() => setStatus('idle')}
                    className="mt-4 text-sm font-medium text-red-600 hover:text-red-500"
                  >
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