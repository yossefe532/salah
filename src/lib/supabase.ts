import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cwftlzaibboszcrukhig.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3ZnRsemFpYmJvc3pjcnVraGlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMjIwMzIsImV4cCI6MjA4NzU5ODAzMn0.9c6K0Y-cdB0WpiAsPllvKN5Amx9VGunicWDhywAsrAc';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
