import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import App from './App.jsx'
import './index.css'

// Service worker faqat haqiqiy (production) saytda — ishlab chiqishda keshlash halal beradi
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)

// Ilova ishga tushdi: index.html dagi "qora ekran" nazoratchisi uchun avto-tiklash belgisini tozalaymiz
setTimeout(() => {
  try { if (document.getElementById('root')?.childElementCount) sessionStorage.removeItem('tiniq-autoreset') } catch { /* private rejim */ }
}, 3000)
