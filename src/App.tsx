import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Register from './pages/Register';
import Attendees from './pages/Attendees';
import IDCard from './pages/IDCard';
import CheckIn from './pages/CheckIn';
import UsersPage from './pages/Users';
import ImportData from './pages/ImportData';
import EditAttendee from './pages/EditAttendee';
import Setup from './pages/Setup';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/setup" element={<Setup />} />
          <Route path="/login" element={<Login />} />
          
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              
              <Route element={<ProtectedRoute allowedRoles={['owner']} />}>
                <Route path="/users" element={<UsersPage />} />
                <Route path="/import" element={<ImportData />} />
              </Route>

              <Route element={<ProtectedRoute allowedRoles={['owner', 'data_entry']} />}>
                <Route path="/register" element={<Register />} />
                <Route path="/attendees/:id/edit" element={<EditAttendee />} />
              </Route>
              
              <Route element={<ProtectedRoute allowedRoles={['owner', 'data_entry', 'organizer']} />}>
                <Route path="/attendees" element={<Attendees />} />
                <Route path="/attendees/:id/id-card" element={<IDCard />} />
              </Route>
              
              <Route element={<ProtectedRoute allowedRoles={['owner', 'organizer']} />}>
                <Route path="/checkin" element={<CheckIn />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
