// src/main.jsx — CargoChain
// React entry. Mounts <App /> inside the Web3Provider + ContractsProvider
// tree. The CSS is imported here so it's bundled once and applies globally.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import { Web3Provider } from './context/Web3Context.jsx';
import { ContractsProvider } from './context/ContractsContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { UserProfileProvider } from './context/UserProfileContext.jsx';
import { ChatAuthProvider } from './context/ChatAuthContext.jsx';
import './css/style.css';

const root = createRoot(document.getElementById('root'));
root.render(
  <StrictMode>
    <ToastProvider>
      <Web3Provider>
        <ContractsProvider>
          <UserProfileProvider>
            <ChatAuthProvider>
              <App />
            </ChatAuthProvider>
          </UserProfileProvider>
        </ContractsProvider>
      </Web3Provider>
    </ToastProvider>
  </StrictMode>,
);
