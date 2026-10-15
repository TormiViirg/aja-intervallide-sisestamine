import 'dotenv/config';
import { createApp } from './app.js';
import { createClient } from '@supabase/supabase-js';
import { createMemoryRepository } from './adapters/memoryRepository.js';
import { createSupabaseRepository } from './adapters/supabaseRepository.js';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const festivalId = process.env.SUPABASE_FESTIVAL_ID;
const adminUserId = process.env.SUPABASE_ADMIN_USER_ID;
if (Boolean(url) !== Boolean(serviceRoleKey)) {
	throw new Error('Set both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
}
if (url && (!festivalId || !adminUserId)) {
	throw new Error('Set SUPABASE_FESTIVAL_ID and SUPABASE_ADMIN_USER_ID');
}
if (process.env.NODE_ENV === 'production' && !url) {
	throw new Error('Supabase credentials are required in production');
}

const repo = url
	? createSupabaseRepository(createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }), { festivalId, adminUserId })
	: createMemoryRepository();

createApp({ repo }).listen(process.env.PORT ?? 3001, () => console.log('API up'));
