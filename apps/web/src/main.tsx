import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RequireAccount } from './Account.js';
import { App } from './App.js';
import { GlossaryProvider } from './Glossary.js';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlossaryProvider>
      <RequireAccount>
        <App />
      </RequireAccount>
    </GlossaryProvider>
  </StrictMode>,
);
