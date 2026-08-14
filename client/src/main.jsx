// Development-only render profiler. Its import must precede React and ReactDOM.
import { scan } from 'react-scan'

// Question (answered): why axios? Any specific reasons? Are there alternatives?
import axios from 'axios'

// In Electron, API runs on localhost; use baseURL so relative /api paths work
if (typeof window !== 'undefined' && window.electron?.apiUrl) {
  axios.defaults.baseURL = window.electron.apiUrl
}

import React from 'react'
import ReactDOM from 'react-dom/client'

import App from './App.jsx'
import './index.css'

// Question (answered): Is this necessary? What are we doing with this? 
// Question (answered): does this need to be inside the lib folder? What's the JS way of doing this? In python i'd just have a utils folder.
import { setupAxiosInstrumentation, setupGlobalErrorInstrumentation } from './lib/instrumentation'

// Review (answered): do we need a new component for this? Is this the Normal Error page when something goes wrong in the app? 
// Review (answered): on that topic, does the client side have an error page that shows stuff when something goes wrong? As far as I have seen it's not there (because i haven't seen it while using the product)
import InstrumentationErrorBoundary from './components/InstrumentationErrorBoundary'

if (import.meta.env.DEV) {
  scan({ enabled: true, showToolbar: true, animationSpeed: 'off' })
}

setupAxiosInstrumentation()
setupGlobalErrorInstrumentation()

ReactDOM.createRoot(document.getElementById('root')).render(
  // Question (answered): what does react strict mode do? Teach me
  <React.StrictMode>
    <InstrumentationErrorBoundary>
      <App />
    </InstrumentationErrorBoundary>
  </React.StrictMode>,
)
