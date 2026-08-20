import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/classical.css'
import './styles/reader.css'
import App from './App.jsx'
import { AuthProvider } from './components/AuthContext.jsx'
import { SyncProvider } from './components/SyncContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <SyncProvider>
        <App />
      </SyncProvider>
    </AuthProvider>
  </StrictMode>,
)
