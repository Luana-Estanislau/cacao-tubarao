import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import Home from './Home.jsx'
import App from './App.jsx'
import MapaPublico from './MapaPublico.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/reportar" element={<App />} />
        <Route path="/mapa" element={<MapaPublico />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
