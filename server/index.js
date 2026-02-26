import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Supabase Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cwftlzaibboszcrukhig.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('FATAL: SUPABASE_SERVICE_ROLE_KEY is missing!');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// --- Routes ---

// Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email.trim().toLowerCase())
    .eq('password', password.trim())
    .single();

  if (user) {
    const { password, ...userWithoutPass } = user;
    res.json({ 
        user: userWithoutPass, 
        session: { 
            access_token: 'supabase-session-' + user.id, 
            user: userWithoutPass 
        } 
    });
  } else {
    res.status(401).json({ error: 'Invalid email or password' });
  }
});

// Users
app.get('/api/users', async (req, res) => {
  const { data: users, error } = await supabase
    .from('users')
    .select('id, email, full_name, role, created_at');
  res.json(users || []);
});

app.post('/api/users', async (req, res) => {
  const newUser = req.body;
  if (!newUser.password) newUser.password = '123456';

  const { data, error } = await supabase
    .from('users')
    .insert([newUser])
    .select('id, email, full_name, role, created_at')
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

app.put('/api/users/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .update(req.body)
    .eq('id', req.params.id)
    .select('id, email, full_name, role, created_at')
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

app.delete('/api/users/:id', async (req, res) => {
  const { error } = await supabase
    .from('users')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

// Attendees
app.get('/api/attendees', async (req, res) => {
  const showTrash = req.query.trash === 'true';
  const { data: attendees, error } = await supabase
    .from('attendees')
    .select('*')
    .eq('is_deleted', showTrash)
    .order('created_at', { ascending: false });
  res.json(attendees || []);
});

app.get('/api/attendees/:id', async (req, res) => {
  const { data: attendee, error } = await supabase
    .from('attendees')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (attendee) res.json(attendee);
  else res.status(404).json({ error: 'Attendee not found' });
});

app.post('/api/attendees', async (req, res) => {
  const newAttendee = { ...req.body, is_deleted: false };
  const { data, error } = await supabase
    .from('attendees')
    .insert([newAttendee])
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

app.put('/api/attendees/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('attendees')
    .update(req.body)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

app.delete('/api/attendees/:id', async (req, res) => {
  const { error } = await supabase
    .from('attendees')
    .update({ is_deleted: true })
    .eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

app.patch('/api/attendees/:id/restore', async (req, res) => {
  const { error } = await supabase
    .from('attendees')
    .update({ is_deleted: false })
    .eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

app.delete('/api/attendees/:id/permanent', async (req, res) => {
  const { error } = await supabase
    .from('attendees')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

// Check-in
app.post('/api/checkin', async (req, res) => {
  const { code, userId } = req.body;
  
  const { data: attendee, error: fetchError } = await supabase
    .from('attendees')
    .select('*')
    .or(`qr_code.eq.${code},barcode.eq.${code},id.eq.${code}`)
    .single();

  if (!attendee) return res.status(404).json({ error: 'Attendee not found' });
  if (attendee.attendance_status) return res.status(400).json({ error: 'Already checked in', attendee });

  const { data: updated, error: updateError } = await supabase
    .from('attendees')
    .update({
      attendance_status: true,
      checked_in_at: new Date().toISOString(),
      checked_in_by: userId
    })
    .eq('id', attendee.id)
    .select()
    .single();

  if (updateError) return res.status(400).json({ error: updateError.message });

  await supabase.from('logs').insert([{
    attendee_id: attendee.id,
    recorded_by: userId,
    action: 'check_in'
  }]);

  res.json({ success: true, attendee: updated });
});

app.patch('/api/attendees/:id/toggle-attendance', async (req, res) => {
  const { id } = req.params;
  const { data: attendee } = await supabase.from('attendees').select('*').eq('id', id).single();
  
  if (!attendee) return res.status(404).json({ error: 'Attendee not found' });

  const newStatus = !attendee.attendance_status;
  const { data: updated, error } = await supabase
    .from('attendees')
    .update({
      attendance_status: newStatus,
      checked_in_at: newStatus ? new Date().toISOString() : null,
      checked_in_by: newStatus ? 'manual' : null
    })
    .eq('id', id)
    .select()
    .single();

  res.json(updated);
});

const PORT = process.env.PORT || 3000;
const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api')) return next();
        res.sendFile(path.join(distPath, 'index.html'));
    });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
