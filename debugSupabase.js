import { createClient } from '@supabase/supabase-js';

// Copiando valores directamente para evitar problemas de importación si no es module
const supabaseUrl = 'https://oabthypkcvhfbipfmjxk.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hYnRoeXBrY3ZoZmJpcGZtanhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0OTQ1NDgsImV4cCI6MjA4MTA3MDU0OH0.U-PkrL0udIg8xMDauqRydOdyDK87gxRIXSTPo_C_oFQ';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testConnection() {
    console.log("Probando conexión a Supabase...");
    const { data, error } = await supabase.from('songs').select('*');

    if (error) {
        console.error("❌ ERROR:", error.message);
        console.error("Detalles:", error);
        if (error.code === '42501' || error.message.includes('policy')) {
            console.log("\n💡 PISTA: Parece ser un error de PERMISOS (Row Level Security).");
            console.log("Asegúrate de haber desactivado RLS o añadido una política 'SELECT' pública en Supabase.");
        }
    } else {
        console.log("✅ ÉXITO: Se encontraron " + data.length + " canciones.");
        console.log(data);
    }
}

testConnection();
