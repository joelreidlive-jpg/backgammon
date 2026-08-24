import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { GlossaryProvider } from './Glossary.js';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlossaryProvider>
      <App />
    </GlossaryProvider>
  </StrictMode>,
);
