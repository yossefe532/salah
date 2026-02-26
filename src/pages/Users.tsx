import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { User, UserRole } from '../types';
import { useAuth } from '../context/AuthContext';
import { Trash2, Edit, Save, X, UserPlus, Shield } from 'lucide-react';

const UsersPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('organizer');
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // New User Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('data_entry');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await api.get('/users');
      setUsers(data);
    } catch (error) {
      console.error('Error fetching users:', error);
      setMessage({ type: 'error', text: 'فشل تحميل المستخدمين.' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRole = async (userId: string) => {
    try {
      const updatedUser = await api.put(`/users/${userId}`, { role: editRole });
      setUsers(users.map(u => u.id === userId ? updatedUser : u));
      setEditingId(null);
      setMessage({ type: 'success', text: 'تم تحديث دور المستخدم بنجاح.' });
    } catch (error) {
      console.error('Error updating role:', error);
      setMessage({ type: 'error', text: 'فشل تحديث الدور.' });
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا المستخدم؟')) return;

    try {
      await api.delete(`/users/${userId}`);
      setUsers(users.filter(u => u.id !== userId));
      setMessage({ type: 'success', text: 'تم حذف المستخدم بنجاح.' });
    } catch (error) {
      console.error('Error deleting user:', error);
      setMessage({ type: 'error', text: 'فشل حذف المستخدم.' });
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    
    try {
        const newUserId = crypto.randomUUID();
        const newUserPayload = {
            id: newUserId,
            email: newUserEmail,
            full_name: newUserName,
            role: newUserRole,
            password: newUserPassword || '123456',
            created_at: new Date().toISOString()
        };

        const createdUser = await api.post('/users', newUserPayload);
        setUsers(prev => [...prev, createdUser]);

        setMessage({ type: 'success', text: 'تمت إضافة المستخدم بنجاح!' });
        setShowAddForm(false);
        setNewUserEmail('');
        setNewUserName('');
        setNewUserPassword('');
        setNewUserRole('data_entry');
    } catch (error: any) {
        console.error('Error creating user:', error);
        setMessage({ type: 'error', text: error.message || 'فشل إنشاء المستخدم.' });
    } finally {
        setIsCreating(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">إدارة المستخدمين</h1>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
        >
          {showAddForm ? <X className="h-5 w-5 ml-2" /> : <UserPlus className="h-5 w-5 ml-2" />}
          {showAddForm ? 'إلغاء' : 'إضافة مستخدم جديد'}
        </button>
      </div>

      {showAddForm && (
        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <UserPlus className="h-5 w-5 ml-2 text-indigo-500" />
                بيانات المستخدم الجديد
            </h3>
            <form onSubmit={handleCreateUser} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">الاسم الكامل</label>
                        <input
                            type="text"
                            required
                            className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
                            value={newUserName}
                            onChange={(e) => setNewUserName(e.target.value)}
                            placeholder="مثال: أحمد محمد"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">البريد الإلكتروني</label>
                        <input
                            type="email"
                            required
                            className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
                            value={newUserEmail}
                            onChange={(e) => setNewUserEmail(e.target.value)}
                            placeholder="user@event.com"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">الصلاحية / الدور</label>
                        <select
                            className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
                            value={newUserRole}
                            onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                        >
                            <option value="data_entry">مدخل بيانات</option>
                            <option value="organizer">منظم</option>
                            <option value="owner">مالك (Owner)</option>
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">كلمة المرور</label>
                        <input
                            type="text"
                            className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border bg-gray-50"
                            value={newUserPassword}
                            onChange={(e) => setNewUserPassword(e.target.value)}
                            placeholder="اتركها فارغة لتعيين 123456 تلقائياً"
                        />
                    </div>
                </div>
                <div className="flex justify-end pt-4">
                    <button
                        type="submit"
                        disabled={isCreating}
                        className="inline-flex items-center px-6 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
                    >
                        {isCreating ? 'جاري الإضافة...' : 'حفظ المستخدم'}
                    </button>
                </div>
            </form>
        </div>
      )}

      {message && (
        <div className={`p-4 rounded-md ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'} flex justify-between items-center shadow-sm`}>
          <span className="font-medium">{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-gray-500 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      <div className="bg-white shadow overflow-hidden sm:rounded-lg border border-gray-100">
        <ul className="divide-y divide-gray-200">
          {loading ? (
            <li className="p-8 text-center text-gray-500">جاري تحميل المستخدمين...</li>
          ) : users.length === 0 ? (
            <li className="p-8 text-center text-gray-500">لا يوجد مستخدمين مسجلين.</li>
          ) : (
            users.map((u) => (
              <li key={u.id} className="p-4 hover:bg-gray-50 transition duration-150 ease-in-out">
                <div className="flex items-center justify-between">
                  <div className="flex items-center min-w-0 flex-1">
                    <div className="flex-shrink-0 h-12 w-12 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-lg shadow-sm">
                      {u.full_name?.charAt(0).toUpperCase() || u.email.charAt(0).toUpperCase()}
                    </div>
                    <div className="mr-4 truncate">
                      <div className="text-base font-bold text-gray-900 truncate">{u.full_name || 'بدون اسم'}</div>
                      <div className="text-sm text-gray-500 truncate font-mono">{u.email}</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-4 space-x-reverse">
                    {editingId === u.id ? (
                      <div className="flex items-center space-x-2 space-x-reverse bg-gray-50 p-2 rounded-lg">
                        <select
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value as UserRole)}
                          className="block w-32 pl-3 pr-8 py-1 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md border"
                        >
                          <option value="owner">مالك</option>
                          <option value="data_entry">مدخل بيانات</option>
                          <option value="organizer">منظم</option>
                        </select>
                        <button
                          onClick={() => handleUpdateRole(u.id)}
                          className="text-green-600 hover:text-green-900 bg-white p-1 rounded-full shadow-sm"
                          title="حفظ"
                        >
                          <Save className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-gray-600 hover:text-gray-900 bg-white p-1 rounded-full shadow-sm"
                          title="إلغاء"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-3 space-x-reverse">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${
                          u.role === 'owner' ? 'bg-purple-100 text-purple-800 border-purple-200' :
                          u.role === 'data_entry' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                          'bg-green-100 text-green-800 border-green-200'
                        }`}>
                          <Shield className="w-3 h-3 ml-1" />
                          {u.role === 'data_entry' ? 'مدخل بيانات' : 
                           u.role === 'organizer' ? 'منظم' : 'مالك'}
                        </span>
                        
                        {/* Prevent deleting yourself */}
                        {currentUser?.id !== u.id && (
                          <>
                            <button
                              onClick={() => {
                                setEditingId(u.id);
                                setEditRole(u.role);
                              }}
                              className="text-indigo-600 hover:text-indigo-900 p-1 hover:bg-indigo-50 rounded-full transition-colors"
                              title="تعديل الدور"
                            >
                              <Edit className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u.id)}
                              className="text-red-600 hover:text-red-900 p-1 hover:bg-red-50 rounded-full transition-colors"
                              title="حذف المستخدم"
                            >
                              <Trash2 className="h-5 w-5" />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
};

export default UsersPage;