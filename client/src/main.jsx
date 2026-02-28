import axios from 'axios'

// In Electron, API runs on localhost; use baseURL so relative /api paths work
if (typeof window !== 'undefined' && window.electron?.apiUrl) {
  axios.defaults.baseURL = window.electron.apiUrl
}

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
