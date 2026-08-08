import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import Landing from './Landing.jsx'
import App from './App.jsx'
import MapaPublico from './MapaPublico.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/registrar" element={<App />} />
        <Route path="/mapa" element={<MapaPublico />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
