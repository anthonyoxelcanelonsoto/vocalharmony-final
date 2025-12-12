import React, { useState } from 'react';
import { supabase } from './supabaseClient';

const Diagnostics = () => {
    const [status, setStatus] = useState('Esperando prueba...');
    const [details, setDetails] = useState('');
    const [rawStatus, setRawStatus] = useState('N/A');
    const [songs, setSongs] = useState([]);

    const runTest = async () => {
        setStatus('Diagnosticando...');
        setDetails('');
        setRawStatus('Iniciando pruebas...');

        const results = [];

        // PRUEBA 1: Conectividad Básica (Sin cabeceras)
        try {
            const res1 = await fetch('https://oabthypkcvhfbipfmjxk.supabase.co/rest/v1/', { method: 'GET' });
            results.push(`1. Red Básica: OK (${res1.status})`);
        } catch (err) {
            results.push(`1. Red Básica: FALLÓ (${err.message})`);
        }

        // PRUEBA 2: Clave API (Headers)
        try {
            const res2 = await fetch('https://oabthypkcvhfbipfmjxk.supabase.co/rest/v1/songs?select=*', {
                method: 'GET',
                headers: {
                    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hYnRoeXBrY3ZoZmJpcGZtanhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0OTQ1NDgsImV4cCI6MjA4MTA3MDU0OH0.U-PkrL0udIg8xMDauqRydOdyDK87gxRIXSTPo_C_oFQ',
                    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hYnRoeXBrY3ZoZmJpcGZtanhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0OTQ1NDgsImV4cCI6MjA4MTA3MDU0OH0.U-PkrL0udIg8xMDauqRydOdyDK87gxRIXSTPo_C_oFQ'
                }
            });
            if (res2.ok) {
                const data = await res2.json();
                results.push(`2. Autenticación: ÉXITO (${data.length} items)`);
                setStatus('✅ CONEXIÓN RESTABLECIDA');
            } else {
                results.push(`2. Autenticación: ERROR (${res2.status} ${res2.statusText})`);
            }
        } catch (err) {
            results.push(`2. Autenticación: ERROR DE RED (${err.message})`);
        }

        setRawStatus(results.join(' | '));

        // Reintentamos SDK si la prueba 2 funcionó
        if (results[1].includes('ÉXITO')) {
            const { data, error } = await supabase.from('songs').select('*');
            if (data) setDetails(JSON.stringify(data, null, 2)); // Show data in details box instead
        }
    };

    return (
        <div className="bg-black border border-yellow-500 p-4 m-4 rounded text-white font-mono text-xs">
            <h3 className="text-yellow-500 font-bold mb-2">DIAGNÓSTICO V2</h3>
            <div className="mb-2 text-gray-400">
                URL: https://oabthypkcvhfbipfmjxk.supabase.co<br />
                Key: sb_publishable...
            </div>
            <button
                onClick={runTest}
                className="bg-yellow-600 hover:bg-yellow-500 text-black font-bold py-2 px-4 rounded mb-2"
            >
                EJECUTAR PRUEBA
            </button>
            <div className="font-bold text-lg mt-2">{status}</div>
            <div className="text-blue-400">{rawStatus}</div>
            <pre className="bg-gray-900 p-2 mt-2 rounded overflow-auto max-h-40">
                {details}
            </pre>
        </div>
    );
};

export default Diagnostics;
