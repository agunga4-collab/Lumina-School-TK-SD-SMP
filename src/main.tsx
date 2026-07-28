import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './context/AuthContext';
import { AcademicYearProvider } from './context/AcademicYearContext';
import { MenuVisibilityProvider } from './context/MenuVisibilityContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AcademicYearProvider>
        <MenuVisibilityProvider>
          <App />
        </MenuVisibilityProvider>
      </AcademicYearProvider>
    </AuthProvider>
  </StrictMode>,
);
