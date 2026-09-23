import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl) {
  throw new Error('Falta VITE_SUPABASE_URL en las variables de entorno.');
}

if (!supabasePublishableKey) {
  throw new Error('Falta VITE_SUPABASE_PUBLISHABLE_KEY en las variables de entorno.');
}

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey
);