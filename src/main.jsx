import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { LanguageProvider } from './i18n/LanguageProvider.jsx'
import './styles/tokens.css'
import './styles/global.css'

const CLOCK_DEPRECATION_WARNING = 'THREE.THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.';

if (typeof window !== 'undefined' && !window.__ddgThreeWarningFilterInstalled) {
    const originalWarn = console.warn.bind(console);
    window.__ddgThreeWarningFilterInstalled = true;

    console.warn = (...args) => {
        const firstArg = typeof args[0] === 'string' ? args[0] : '';

        if (firstArg.includes(CLOCK_DEPRECATION_WARNING)) {
            return;
        }

        originalWarn(...args);
    };
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <LanguageProvider>
            <App />
        </LanguageProvider>
    </React.StrictMode>,
)
