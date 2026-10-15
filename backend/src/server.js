import { createApp } from './app.js';
// Later: import { createSupabaseRepository } from './adapters/supabaseRepository.js'; createApp({ repo: createSupabaseRepository(...) })
createApp().listen(process.env.PORT ?? 3001, () => console.log('API up'));
