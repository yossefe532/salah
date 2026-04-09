import fs from 'fs';

const apiPath = 'e:\\شغل\\شغل\\ص\\src\\lib\\api.ts';
let apiContent = fs.readFileSync(apiPath, 'utf-8');

apiContent = apiContent.replace(
  `if (endpoint === '/seating/auto-assign') {`,
  `if (endpoint === '/seating/auto-assign-all') {
      const eventId = body?.event_id || DEFAULT_EVENT_ID;
      
      // Get all attendees without seats
      const { data: attendees } = await supabase.from('attendees').select('id, seat_class, governorate').is('seat_number', null);
      if (!attendees || !attendees.length) return { success: true, count: 0 };
      
      let assignedCount = 0;
      
      // Group by class to process efficiently
      const classes = ['A', 'B', 'C'];
      for (const cls of classes) {
         const classAttendees = attendees.filter(a => a.seat_class === cls);
         if (!classAttendees.length) continue;
         
         // Get available seats for this class
         const { data: availableSeats } = await supabase.from('seats')
            .select('*')
            .eq('event_id', eventId)
            .eq('seat_class', cls)
            .eq('status', 'available')
            .order('row_number', { ascending: true })
            .order('seat_number', { ascending: true })
            .limit(classAttendees.length);
            
         if (!availableSeats || !availableSeats.length) continue;
         
         const toAssign = Math.min(classAttendees.length, availableSeats.length);
         
         for (let i = 0; i < toAssign; i++) {
            const att = classAttendees[i];
            const seat = availableSeats[i];
            
            // Assign seat
            await supabase.from('seats').update({
               status: 'booked',
               attendee_id: att.id
            }).eq('id', seat.id);
            
            // Update attendee
            await supabase.from('attendees').update({
               seat_number: seat.seat_number,
               governorate: seat.governorate
            }).eq('id', att.id);
            
            assignedCount++;
         }
      }
      return { success: true, count: assignedCount };
    }
    
    if (endpoint === '/seating/auto-assign') {`
);

fs.writeFileSync(apiPath, apiContent);
console.log('Added auto-assign-all API endpoint');
