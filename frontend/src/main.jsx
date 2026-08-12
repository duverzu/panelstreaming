import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth';
import { ThemeProvider } from './theme';
import { AmbitoProvider } from './ambito';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <AmbitoProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AmbitoProvider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);
