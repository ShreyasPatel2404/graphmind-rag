/**
 * Toast.jsx — Lightweight toast system, no extra dependencies.
 * Usage:
 *   import { toast, ToastContainer } from "./Toast";
 *   toast.success("Done!") / toast.error("Oops") / toast.info("Hey")
 *   <ToastContainer /> — place once in App.jsx or layout
 */

import { useState, useEffect, useCallback, createContext, useContext, useRef } from "react";

// ─── Context ──────────────────────────────────────────────────────────────────
const ToastContext = createContext(null);

let _addToast = null; // module-level so toast.* works outside React tree

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const add = useCallback((msg, type = "info", duration = 3500) => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p, { id, msg, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), duration);
  }, []);

  useEffect(() => { _addToast = add; return () => { _addToast = null; }; }, [add]);

  const remove = (id) => setToasts((p) => p.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={add}>
      {children}
      <ToastContainer toasts={toasts} onRemove={remove} />
    </ToastContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useToast() {
  return useContext(ToastContext);
}

// ─── Imperative API (usable anywhere) ────────────────────────────────────────
export const toast = {
  success: (msg, dur) => _addToast?.(msg, "success", dur),
  error:   (msg, dur) => _addToast?.(msg, "error",   dur),
  info:    (msg, dur) => _addToast?.(msg, "info",    dur),
  warn:    (msg, dur) => _addToast?.(msg, "warn",    dur),
};

// ─── Container ────────────────────────────────────────────────────────────────
const STYLES = {
  success: "bg-emerald-500/20 border-emerald-500/40 text-emerald-300",
  error:   "bg-red-500/20    border-red-500/40    text-red-300",
  info:    "bg-indigo-500/20 border-indigo-500/40 text-indigo-300",
  warn:    "bg-yellow-500/20 border-yellow-500/40 text-yellow-300",
};

const ICONS = {
  success: "✓",
  error:   "✕",
  info:    "ℹ",
  warn:    "⚠",
};

function ToastContainer({ toasts, onRemove }) {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => onRemove(t.id)}
          className={`
            pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl
            border backdrop-blur-sm shadow-xl text-sm font-medium
            cursor-pointer select-none
            animate-[fadeInUp_0.2s_ease]
            ${STYLES[t.type] || STYLES.info}
          `}
        >
          <span className="text-base leading-none">{ICONS[t.type]}</span>
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}