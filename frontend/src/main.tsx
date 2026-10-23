import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { DEMO } from './demo/flag'
import { installResponsiveTables } from './responsiveTables'

if (DEMO) {
  // A demonstração pode abrir dentro de páginas que bloqueiam diálogos nativos
  // (confirm devolve sempre false); como os dados se repõem, confirma direto.
  window.confirm = () => true
  window.alert = () => undefined
}

// Na demonstração a navegação fica em memória: funciona em qualquer endereço onde a página seja publicada
const Router = DEMO ? MemoryRouter : BrowserRouter

const root = document.getElementById('root')!
installResponsiveTables(root)

createRoot(root).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>,
)
