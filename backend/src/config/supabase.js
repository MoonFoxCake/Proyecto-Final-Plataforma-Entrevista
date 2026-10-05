const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl) {
  throw new Error('Falta SUPABASE_URL en las variables de entorno.');
}

if (!supabaseSecretKey) {
  throw new Error('Falta SUPABASE_SECRET_KEY en las variables de entorno.');
}

const supabase = createClient(
  supabaseUrl,
  supabaseSecretKey,
  {
    realtime: {
      transport: WebSocket,
    },
  }
);

module.exports = { supabase };