import { supabase } from './supabase';

export const API_PORT = 3000;

// This client-side API now talks directly to Supabase when online
export const api = {
  async get(endpoint: string) {
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
      const { data: attendee } = await supabase.from('attendees').select('*').or(`qr_code.eq.${code},barcode.eq.${code},id.eq.${code}`).single();
      if (!attendee) throw new Error('المشارك غير موجود');
      if (attendee.attendance_status) throw new Error('تم تسجيل الحضور مسبقاً');
      
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