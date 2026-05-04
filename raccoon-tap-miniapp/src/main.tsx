import React from 'react';
import ReactDOM from 'react-dom/client';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import App from './App';
import './styles.css';
import { tonManifestUrl } from './lib/ton';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TonConnectUIProvider manifestUrl={tonManifestUrl}>
      <App />
    </TonConnectUIProvider>
  </React.StrictMode>,
);
