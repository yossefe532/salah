import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const DB_FILE = path.join(__dirname, 'db.json');

// Initialize DB with Admin User
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ 
    users: [
      {
        id: 'owner-id',
        email: 'admin@event.com',
        full_name: 'System Owner',
        role: 'owner',
        password: 'admin123', // Hardcoded initial password
        created_at: new Date().toISOString()
      }
    ], 
    attendees: [], 
    logs: [] 
  }, null, 2));
}

const readDB = () => {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE));
  } catch (e) {
    return { users: [], attendees: [], logs: [] };
  }
};

const writeDB = (data) => {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
};

// --- Routes ---

// Login (Strict Check)
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const db = readDB();
  
  console.log('Login attempt:', email, password); // Debug log

  // Find user by email AND password (with trim)
  const user = db.users.find(u => 
      u.email.trim().toLowerCase() === email.trim().toLowerCase() && 
      u.password.trim() === password.trim()
  );
  
  if (user) {
    // Return user without password
    const { password, ...userWithoutPass } = user;
    res.json({ 
        user: userWithoutPass, 
        session: { 
            access_token: 'valid-local-token-' + user.id, 
            user: userWithoutPass 
        } 
    });
  } else {
    console.log('Login failed for:', email);
    res.status(401).json({ error: 'Invalid email or password' });
  }
});

// Users
app.get('/api/users', (req, res) => {
  const db = readDB();
  // Don't send passwords
  const safeUsers = db.users.map(({ password, ...u }) => u);
  res.json(safeUsers);
});

app.post('/api/users', (req, res) => {
  const db = readDB();
  const newUser = req.body;
  
  if (db.users.find(u => u.email === newUser.email)) {
    return res.status(400).json({ error: 'User already exists' });
  }
  
  // Ensure password is set (default if missing, though frontend should send it)
  if (!newUser.password) {
      newUser.password = '123456'; 
  }

  db.users.push(newUser);
  writeDB(db);
  
  // Return safe user
  const { password, ...safeUser } = newUser;
  res.json(safeUser);
});

app.put('/api/users/:id', (req, res) => {
  const db = readDB();
  const index = db.users.findIndex(u => u.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'User not found' });
  
  // Update fields (except password unless provided)
  const updatedUser = { ...db.users[index], ...req.body };
  
  // If role changed, ensure at least one owner remains? (Optional check)
  
  db.users[index] = updatedUser;
  writeDB(db);
  
  const { password, ...safeUser } = updatedUser;
  res.json(safeUser);
});

app.delete('/api/users/:id', (req, res) => {
  const db = readDB();
  // Prevent deleting last owner?
  const user = db.users.find(u => u.id === req.params.id);
  if (user && user.role === 'owner' && db.users.filter(u => u.role === 'owner').length <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last owner' });
  }

  db.users = db.users.filter(u => u.id !== req.params.id);
  writeDB(db);
  res.json({ success: true });
});

// Attendees
app.get('/api/attendees', (req, res) => {
  const db = readDB();
  // Filter query: trash=true -> only deleted, otherwise -> only active
  const showTrash = req.query.trash === 'true';
  
  const attendees = db.attendees.filter(a => 
    showTrash ? a.is_deleted === true : !a.is_deleted
  );
  
  res.json(attendees);
});

// GET Single Attendee (Allow getting deleted ones too for ID check)
app.get('/api/attendees/:id', (req, res) => {
  const db = readDB();
  const attendee = db.attendees.find(a => a.id === req.params.id);
  if (attendee) {
    res.json(attendee);
  } else {
    res.status(404).json({ error: 'Attendee not found' });
  }
});

app.post('/api/attendees', (req, res) => {
  const db = readDB();
  const newAttendee = { ...req.body, is_deleted: false };
  
  if (db.attendees.find(a => a.id === newAttendee.id)) {
      return res.status(400).json({ error: 'Attendee ID conflict' });
  }
  
  db.attendees.push(newAttendee);
  writeDB(db);
  res.json(newAttendee);
});

app.put('/api/attendees/:id', (req, res) => {
  const db = readDB();
  const index = db.attendees.findIndex(a => a.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Attendee not found' });
  
  // Merge but keep existing is_deleted unless explicitly changed (unlikely here)
  db.attendees[index] = { ...db.attendees[index], ...req.body };
  writeDB(db);
  res.json(db.attendees[index]);
});

// Soft Delete (Move to Trash)
app.delete('/api/attendees/:id', (req, res) => {
  const db = readDB();
  const index = db.attendees.findIndex(a => a.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Attendee not found' });
  
  db.attendees[index].is_deleted = true;
  writeDB(db);
  res.json({ success: true });
});

// Restore from Trash
app.patch('/api/attendees/:id/restore', (req, res) => {
  const db = readDB();
  const index = db.attendees.findIndex(a => a.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Attendee not found' });
  
  db.attendees[index].is_deleted = false;
  writeDB(db);
  res.json({ success: true });
});

// Permanent Delete
app.delete('/api/attendees/:id/permanent', (req, res) => {
  const db = readDB();
  const index = db.attendees.findIndex(a => a.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Attendee not found' });
  
  db.attendees.splice(index, 1);
  writeDB(db);
  res.json({ success: true });
});

// Check-in
app.post('/api/checkin', (req, res) => {
  const { code, userId } = req.body;
  const db = readDB();
  
  const attendeeIndex = db.attendees.findIndex(a => 
    a.qr_code === code || a.barcode === code || a.id === code
  );
  
  if (attendeeIndex === -1) {
    return res.status(404).json({ error: 'Attendee not found' });
  }
  
  const attendee = db.attendees[attendeeIndex];
  
  if (attendee.attendance_status) {
    return res.status(400).json({ error: 'Already checked in', attendee });
  }
  
  attendee.attendance_status = true;
  attendee.checked_in_at = new Date().toISOString();
  attendee.checked_in_by = userId;
  
  db.attendees[attendeeIndex] = attendee;
  writeDB(db);
  
  // Log
  db.logs.push({
      id: crypto.randomUUID(),
      attendee_id: attendee.id,
      recorded_by: userId,
      action: 'check_in',
      created_at: new Date().toISOString()
  });
  writeDB(db);
  
  res.json({ success: true, attendee });
});

// Toggle Attendance Manually
app.patch('/api/attendees/:id/toggle-attendance', (req, res) => {
  const { id } = req.params;
  const db = readDB();
  const index = db.attendees.findIndex(a => a.id === id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Attendee not found' });
  }

  const attendee = db.attendees[index];
  // Toggle status
  const newStatus = !attendee.attendance_status;
  
  attendee.attendance_status = newStatus;
  if (newStatus) {
    attendee.checked_in_at = new Date().toISOString();
    attendee.checked_in_by = 'manual';
  } else {
    attendee.checked_in_at = null;
    attendee.checked_in_by = null;
  }
  
  db.attendees[index] = attendee;
  writeDB(db);
  res.json(attendee);
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Local API Server running on port ${PORT}`);
});