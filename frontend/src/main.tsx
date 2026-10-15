import '@fontsource/fira-sans-extra-condensed/400.css';
import '@fontsource/fira-sans-extra-condensed/500.css';
import '@fontsource/fira-sans-extra-condensed/700.css';
import '@fontsource/jetbrains-mono/300.css';
import '@fontsource/jetbrains-mono/400.css';
import './ui/styles/tokens.css';
import './ui/styles/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createPorts } from './compositionRoot';
import { App, Loading } from './ui/App';
import { AppProvider } from './ui/AppProvider';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <AppProvider ports={createPorts()} fallback={<Loading />}>
      <App />
    </AppProvider>
  </StrictMode>,
);
