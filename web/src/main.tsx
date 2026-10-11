import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
// bundled, not loaded from a font CDN: the CSP allows fonts from 'self' only
import '@fontsource-variable/inter/opsz.css';
import './i18n';
import './index.css';
import App from './App';
import { AuthProvider } from './auth';
import { registerServiceWorker } from './lib/sw';

registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* "user": with reduced motion switched on, springs keep their fades but lose the travel */}
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </MotionConfig>
  </StrictMode>,
);
