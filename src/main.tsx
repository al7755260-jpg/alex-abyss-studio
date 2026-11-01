import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installGlbFetchScheduler } from './net/glbFetchScheduler'
import { MODEL_REVISION } from './data/headDelivery'
import './styles.css'

installGlbFetchScheduler({ assetRevision: MODEL_REVISION })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
