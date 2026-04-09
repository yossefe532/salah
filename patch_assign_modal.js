import fs from 'fs';

const smPath = 'e:\\شغل\\شغل\\ص\\src\\pages\\SeatingManagement.tsx';
let smContent = fs.readFileSync(smPath, 'utf-8');

smContent = smContent.replace(
  `const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);`,
  `const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [assignmentModal, setAssignmentModal] = useState<{isOpen: boolean, seat: Seat | null}>({isOpen: false, seat: null});
  const [searchTerm, setSearchTerm] = useState('');`
);

smContent = smContent.replace(
  `const handleSeatClick = (seat: Seat) => {
    setSelectedSeatId(seat.id);
    setSelectedElement({ id: seat.id, type: 'seat' });
    
    if (mode === 'assign') {
      if (seat.status === 'booked') {
        const attendee = attendees.find(a => a.id === seat.attendee_id);
        if (attendee) {
          alert(\`هذا المقعد محجوز لـ: \${(attendee as any).full_name || (attendee as any).name} \\nفئة: \${attendee.seat_class} - رقم المقعد: \${attendee.seat_number}\`);
        }
      } else {
        const eligible = attendees.filter(a => a.seat_class === seat.seat_class && !a.seat_number);
        if (eligible.length === 0) {
          alert('لا يوجد عملاء غير مسكنين في هذه الفئة (' + seat.seat_class + ')');
        } else {
          // Open assignment dialog (simulated with prompt for now)
          const names = eligible.map((a, i) => \`\${i+1}- \${(a as any).full_name || (a as any).name}\`).join('\\n');
          const choice = prompt(\`اختر رقم العميل لتسكينه في هذا المقعد:\\n\${names}\`);
          const idx = parseInt(choice || '') - 1;
          if (!isNaN(idx) && eligible[idx]) {
            const a = eligible[idx];
            setSelectedSeatId(seat.id);
            // Simulate selecting from the dropdown
            setTimeout(() => assignSelected(a.id as string), 100);
          }
        }
      }
    }
  };`,
  `const handleSeatClick = (seat: Seat) => {
    setSelectedSeatId(seat.id);
    setSelectedElement({ id: seat.id, type: 'seat' });
  };
  
  const handleSeatDoubleClick = (seat: Seat) => {
    if (mode === 'assign') {
      if (seat.status === 'booked') {
        const attendee = attendees.find(a => a.id === seat.attendee_id);
        if (attendee) {
          alert(\`هذا المقعد محجوز لـ: \${(attendee as any).full_name || (attendee as any).name} \\nفئة: \${attendee.seat_class} - رقم المقعد: \${attendee.seat_number}\`);
        }
      } else {
        setSelectedSeatId(seat.id);
        setSearchTerm('');
        setAssignmentModal({ isOpen: true, seat });
      }
    }
  };`
);

smContent = smContent.replace(
  `onClick={(e) => {
                       e.stopPropagation();
                       handleSeatClick(seat);
                    }}`,
  `onClick={(e) => {
                       e.stopPropagation();
                       handleSeatClick(seat);
                    }}
                    onDoubleClick={(e) => {
                       e.stopPropagation();
                       handleSeatDoubleClick(seat);
                    }}`
);

smContent = smContent.replace(
  `{/* Layout elements removed as they require DB migration */}`,
  `{/* Layout elements removed as they require DB migration */}
              
              {/* Assignment Modal */}
              {assignmentModal.isOpen && assignmentModal.seat && (
                 <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setAssignmentModal({isOpen: false, seat: null})}>
                    <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-6 flex flex-col gap-4 shadow-2xl" onClick={e => e.stopPropagation()}>
                       <h3 className="text-lg font-bold text-white">تسكين المقعد: {assignmentModal.seat.seat_code}</h3>
                       <input 
                         type="text" 
                         autoFocus
                         placeholder="ابحث بالاسم أو رقم التليفون..." 
                         value={searchTerm}
                         onChange={e => setSearchTerm(e.target.value)}
                         className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                       />
                       <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-2">
                         {attendees
                            .filter(a => a.seat_class === assignmentModal.seat!.seat_class && !a.seat_number && normalizeGovernorate(a.governorate) === normalizeGovernorate(governorate))
                            .filter(a => {
                               const term = searchTerm.toLowerCase();
                               const name = ((a as any).full_name || (a as any).name || '').toLowerCase();
                               const phone = ((a as any).phone || '').toLowerCase();
                               return name.includes(term) || phone.includes(term);
                            })
                            .map(a => (
                               <button 
                                 key={a.id}
                                 onClick={() => {
                                    setAssignmentModal({isOpen: false, seat: null});
                                    assignSelected(a.id);
                                 }}
                                 className="flex items-center justify-between p-3 rounded-lg border border-slate-700 bg-slate-800/50 hover:bg-indigo-600 hover:border-indigo-500 transition text-right"
                               >
                                 <div className="flex flex-col">
                                    <span className="font-bold text-white">{(a as any).full_name || (a as any).name}</span>
                                    <span className="text-xs text-slate-400">{(a as any).phone}</span>
                                 </div>
                                 <span className="text-xs bg-slate-700 px-2 py-1 rounded text-slate-300">اختر</span>
                               </button>
                            ))
                         }
                         {attendees.filter(a => a.seat_class === assignmentModal.seat!.seat_class && !a.seat_number && normalizeGovernorate(a.governorate) === normalizeGovernorate(governorate)).length === 0 && (
                            <div className="text-center text-slate-500 py-4">لا يوجد عملاء غير مسكنين في هذه الفئة</div>
                         )}
                       </div>
                       <button onClick={() => setAssignmentModal({isOpen: false, seat: null})} className="mt-2 py-2 text-slate-400 hover:text-white transition">إلغاء</button>
                    </div>
                 </div>
              )}`
);

fs.writeFileSync(smPath, smContent);
console.log('Added Assignment Modal via Double Click');
