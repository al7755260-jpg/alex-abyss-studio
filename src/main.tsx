import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installGlbFetchScheduler } from './net/glbFetchScheduler'
import './styles.css'

installGlbFetchScheduler({ assetRevision: 'webp-20260903' })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
