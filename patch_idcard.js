import fs from 'fs';

const fileContent = fs.readFileSync('e:\\شغل\\شغل\\ص\\src\\pages\\IDCard.tsx', 'utf-8');

let updated = fileContent.replace(
  `const [attendee, setAttendee] = useState<Attendee | null>(null);`,
  `const [attendee, setAttendee] = useState<Attendee | null>(null);
  const [seatInfo, setSeatInfo] = useState<any>(null);`
);

updated = updated.replace(
  `const data = await api.get(\`/attendees/\${attendeeId}\`);
      setAttendee(data);`,
  `const data = await api.get(\`/attendees/\${attendeeId}\`);
      setAttendee(data);
      if (data.seat_number && data.seat_class) {
        try {
           const mapData = await api.get(\`/seating/map?eventId=\${normalizeGovernorate(data.governorate).toUpperCase()}-2026-MAIN\`);
           const seat = mapData.seats?.find((s: any) => s.attendee_id === attendeeId || (s.seat_number === data.seat_number && s.seat_class === data.seat_class && s.status === 'booked'));
           if (seat) {
              const table = mapData.tables?.find((t: any) => t.id === seat.table_id);
              setSeatInfo({ seat, table });
           }
        } catch(e) { console.error(e); }
      }`
);

updated = updated.replace(
  `Seat num : {attendee.seat_number ?? '-'}`,
  `{attendee.seat_class === 'C' ? 'Wave : ' + (seatInfo?.seat?.wave_number || '-') + ' | Seat : ' + (attendee.seat_number ?? '-') : 'Table : ' + (seatInfo?.table?.table_order || '-') + ' | Chair : ' + (attendee.seat_number ?? '-')}`
);

fs.writeFileSync('e:\\شغل\\شغل\\ص\\src\\pages\\IDCard.tsx', updated);
console.log('Successfully updated IDCard to show Table/Chair or Wave/Seat');
