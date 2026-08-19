import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth';
import { ThemeProvider } from './theme';
import { AmbitoProvider } from './ambito';
import { SidebarProvider } from './sidebarCtx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <AmbitoProvider>
          <SidebarProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
          </SidebarProvider>
        </AmbitoProvider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);
