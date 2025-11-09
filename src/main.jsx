import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import TrackingPage from './TrackingPage'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TrackingPage />
  </StrictMode>,
)
