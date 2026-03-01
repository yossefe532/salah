import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Users, Clock } from 'lucide-react';

const LiveCounter: React.FC = () => {
  const [stats, setStats] = useState({ total: 0, checkedIn: 0 });
  const [time, setTime] = useState(new Date());

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Update stats every 10 seconds
  useEffect(() => {
    fetchStats();
    const poller = setInterval(fetchStats, 10000);
    return () => clearInterval(poller);
  }, []);

  const fetchStats = async () => {
    try {
      const attendees = await api.get('/attendees');
      if (attendees) {
        setStats({
          total: attendees.length,
          checkedIn: attendees.filter((a: any) => a.attendance_status).length
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const percentage = stats.total > 0 ? Math.round((stats.checkedIn / stats.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 to-black opacity-50"></div>
      
      {/* Top Bar */}
      <div className="absolute top-8 left-8 flex items-center gap-4 z-10">
        <div className="text-4xl font-bold text-indigo-500">EventMgr</div>
      </div>
      
      <div className="absolute top-8 right-8 flex items-center gap-2 z-10 text-gray-400 text-xl">
        <Clock className="w-6 h-6" />
        <span>{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>

      {/* Main Counter */}
      <div className="z-10 text-center space-y-8">
        <h2 className="text-3xl md:text-5xl font-light text-gray-300 mb-8">عدد الحضور الآن</h2>
        
        <div className="relative inline-block">
          <div className="text-[12rem] md:text-[16rem] font-bold leading-none text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-600 drop-shadow-2xl">
            {stats.checkedIn}
          </div>
          <div className="text-2xl md:text-4xl text-gray-500 mt-4 font-mono">
            / {stats.total}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full max-w-2xl mx-auto mt-12">
          <div className="flex justify-between text-lg mb-2 text-gray-400">
            <span>نسبة الحضور</span>
            <span>{percentage}%</span>
          </div>
          <div className="h-4 bg-gray-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-1000 ease-out"
              style={{ width: `${percentage}%` }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveCounter;