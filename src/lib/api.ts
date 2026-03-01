import { supabase } from './supabase';

export const API_PORT = 3000;

// Offline Queue Management
const QUEUE_KEY = 'offline_checkin_queue';

const addToQueue = (endpoint: string, body: any) => {
  const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  queue.push({ endpoint, body, timestamp: Date.now() });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
};

export const processOfflineQueue = async () => {
  if (!navigator.onLine) return;
  const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  if (queue.length === 0) return;

  console.log(`Processing ${queue.length} offline requests...`);
  const failedRequests = [];

  for (const req of queue) {
    try {
      await api.post(req.endpoint, req.body);
    } catch (e) {
      console.error('Failed to sync request:', req, e);
      // Only retry if it's a network error, not a logic error (like 404)
      failedRequests.push(req);
    }
  }

  if (failedRequests.length < queue.length) {
      // Some succeeded
      localStorage.setItem(QUEUE_KEY, JSON.stringify(failedRequests));
      alert('تمت مزامنة البيانات المسجلة أثناء انقطاع الإنترنت بنجاح.');
  }
};

// Listen for online status
window.addEventListener('online', processOfflineQueue);

// This client-side API now talks directly to Supabase when online
export const api = {
  async get(endpoint: string) {
    // ... existing get code ...
    if (endpoint.startsWith('/attendees')) {
      const showTrash = endpoint.includes('trash=true');
      const idMatch = endpoint.match(/\/attendees\/([^\/?]+)/);
      
      if (idMatch) {
        const { data } = await supabase.from('attendees').select('*').eq('id', idMatch[1]).single();
        return data;
      }

      const { data } = await supabase
        .from('attendees')
        .select('*')
        .eq('is_deleted', showTrash)
        .order('created_at', { ascending: false });
      return data || [];
    }

    if (endpoint === '/users') {
      const { data } = await supabase.from('users').select('id, email, full_name, role, created_at');
      return data || [];
    }
    return [];
  },
  
  async post(endpoint: string, body: any) {
    // Offline Handling for Check-in
    if (endpoint === '/checkin' && !navigator.onLine) {
        addToQueue(endpoint, body);
        return { success: true, offline: true, message: 'تم التسجيل وضع الأوفلاين (سيتم الرفع عند عودة النت)' };
    }

    if (endpoint === '/login') {
      const { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('email', body.email.trim().toLowerCase())
        .eq('password', body.password.trim())
        .single();
      
      if (!user) throw new Error('بيانات الدخول غير صحيحة');
      const { password, ...userWithoutPass } = user;
      return { user: userWithoutPass, session: { access_token: 'sb-' + user.id, user: userWithoutPass } };
    }

    if (endpoint === '/attendees') {
      const { data, error } = await supabase.from('attendees').insert([{ ...body, is_deleted: false }]).select().single();
      if (error) throw new Error(error.message);
      return data;
    }

    if (endpoint === '/checkin') {
      const { code, userId } = body;
      const clean = String(code || '').trim();
      
      // Smart Search Strategy:
      // 1. Try Exact Match (Fastest)
      let { data: attendee } = await supabase
        .from('attendees')
        .select('*')
        .or(`qr_code.eq.${clean},barcode.eq.${clean},id.eq.${clean}`)
        .single();

      // 2. If not found, try "Contains" (Slower but smarter)
      // This handles cases where scanner reads "QR_123" but DB has "QR_123_456" or vice versa
      if (!attendee) {
        // Escape special chars for LIKE query
        const safeClean = clean.replace(/([%_])/g, '\\$1');
        const { data: candidates } = await supabase
          .from('attendees')
          .select('*')
          .or(`qr_code.ilike.%${safeClean}%,barcode.ilike.%${safeClean}%`)
          .limit(1); // Take the first best match
        
        if (candidates && candidates.length > 0) {
            attendee = candidates[0];
        }
      }

      if (!attendee) throw new Error('المشارك غير موجود');
      
      if (attendee.attendance_status) {
          // Return the attendee data even if already checked in, so UI can show "Already Checked In"
          return { success: false, error: 'تم تسجيل الحضور مسبقاً', attendee };
      }
      
      const { data: updated } = await supabase.from('attendees').update({ attendance_status: true, checked_in_at: new Date().toISOString(), checked_in_by: userId }).eq('id', attendee.id).select().single();
      await supabase.from('logs').insert([{ attendee_id: attendee.id, recorded_by: userId, action: 'check_in' }]);
      return { success: true, attendee: updated };
    }

    if (endpoint === '/users') {
      const { data, error } = await supabase.from('users').insert([body]).select().single();
      if (error) throw new Error(error.message);
      return data;
    }
  },

  async put(endpoint: string, body: any) {
    const id = endpoint.split('/').pop();
    const table = endpoint.includes('/users/') ? 'users' : 'attendees';
    const { data, error } = await supabase.from(table).update(body).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
  },

  async patch(endpoint: string, body: any = {}) {
    const parts = endpoint.split('/');
    const id = parts[2];
    if (endpoint.includes('restore')) {
      await supabase.from('attendees').update({ is_deleted: false }).eq('id', id);
      return { success: true };
    }
    if (endpoint.includes('toggle-attendance')) {
      const { data: att } = await supabase.from('attendees').select('attendance_status').eq('id', id).single();
      const newStatus = !att.attendance_status;
      const { data } = await supabase.from('attendees').update({ 
        attendance_status: newStatus, 
        checked_in_at: newStatus ? new Date().toISOString() : null,
        checked_in_by: newStatus ? 'manual' : null
      }).eq('id', id).select().single();
      return data;
    }
  },

  async delete(endpoint: string) {
    const parts = endpoint.split('/');
    const id = parts[2];
    if (endpoint.includes('permanent')) {
      await supabase.from('attendees').delete().eq('id', id);
    } else if (endpoint.includes('/users/')) {
      await supabase.from('users').delete().eq('id', id);
    } else {
      await supabase.from('attendees').update({ is_deleted: true }).eq('id', id);
    }
    return { success: true };
  }
};
