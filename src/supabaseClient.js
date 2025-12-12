import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oabthypkcvhfbipfmjxk.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hYnRoeXBrY3ZoZmJpcGZtanhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0OTQ1NDgsImV4cCI6MjA4MTA3MDU0OH0.U-PkrL0udIg8xMDauqRydOdyDK87gxRIXSTPo_C_oFQ';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
