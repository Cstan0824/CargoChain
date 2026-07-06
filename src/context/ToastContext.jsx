// src/context/ToastContext.jsx — CargoChain
// Minimal toast queue. useToast() returns a `show(msg, kind)` function.
// <Toast /> renders the live list (mounted once in Navbar.jsx).

import { createContext, useCallback, useContext, useState } from 'react';

const ToastContext = createContext(null);

let _id = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const show = useCallback((message, kind = 'info', ttl = 4000) => {
    const id = ++_id;
    setToasts((cur) => [...cur, { id, message, kind }]);
    if (ttl > 0) {
      setTimeout(() => {
        setToasts((cur) => cur.filter((t) => t.id !== id));
      }, ttl);
    }
  }, []);

  const dismiss = useCallback((id) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => dismiss(t.id)}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (ctx === null) {
    throw new Error('useToast() called outside <ToastProvider>. Check src/main.jsx.');
  }
  return ctx;
}
