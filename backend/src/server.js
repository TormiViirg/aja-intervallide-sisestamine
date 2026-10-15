import { createApp } from './app.js';
import { createClient } from '@supabase/supabase-js';
import { createMemoryRepository } from './adapters/memoryRepository.js';
import { createSupabaseRepository } from './adapters/supabaseRepository.js';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (Boolean(url) !== Boolean(serviceRoleKey)) {
	throw new Error('Set both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
}
if (process.env.NODE_ENV === 'production' && !url) {
	throw new Error('Supabase credentials are required in production');
}

const repo = url
	? createSupabaseRepository(createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }))
	: createMemoryRepository();

createApp({ repo }).listen(process.env.PORT ?? 3001, () => console.log('API up'));
