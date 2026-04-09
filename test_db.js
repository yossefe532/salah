import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cwftlzaibboszcrukhig.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3ZnRsemFpYmJvc3pjcnVraGlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMjIwMzIsImV4cCI6MjA4NzU5ODAzMn0.9c6K0Y-cdB0WpiAsPllvKN5Amx9VGunicWDhywAsrAc';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  const { error } = await supabase.from('layout_elements').insert([{
    event_id: 'TEST',
    governorate: 'Minya',
    element_type: 'stage',
    position_x: 50,
    position_y: 50,
    width: 20,
    height: 10,
    label: 'TEST'
  }]);
  console.log('Error from insert:', error?.message || 'Success');
}

test();
