import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { CartProvider } from './context/CartContext';
import { ConsentProvider } from './context/ConsentContext';
import { AuthProvider } from './context/AuthContext';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ConsentProvider>
          <CartProvider>
            <App />
          </CartProvider>
        </ConsentProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
