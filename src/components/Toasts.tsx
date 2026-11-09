import { AlertIcon, CheckIcon, ZapIcon } from './icons';

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
}

export function Toasts({ toasts }: { toasts: ToastItem[] }) {
  if (!toasts.length) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.tone}`}>
          <span className="toast-icon">
            {toast.tone === 'error' ? <AlertIcon size={14} /> : toast.tone === 'success' ? <CheckIcon size={14} /> : <ZapIcon size={14} />}
          </span>
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
