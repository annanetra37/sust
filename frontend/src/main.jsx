import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ModuleProvider } from './context/ModuleContext';
import { ThemeProvider } from './context/ThemeContext';
import { LanguageProvider } from './i18n';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <ModuleProvider>
              <App />
            </ModuleProvider>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
