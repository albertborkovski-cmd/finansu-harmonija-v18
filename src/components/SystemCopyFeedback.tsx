import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2 } from 'lucide-react';

export function useSystemCopyFeedback() {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }

    setCopied(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 2500);
  };

  return { copied, copyText };
}

export function SystemCopyToast({ visible, message = 'Content copied successfully' }: { visible: boolean; message?: string }) {
  if (!visible || typeof document === 'undefined') return null;

  return createPortal(
    <div role="status" aria-live="polite" className="fixed bottom-6 left-1/2 z-[400] flex -translate-x-1/2 items-center gap-2 rounded-lg bg-[#2E8B57] px-5 py-3 font-montserrat text-[14px] font-semibold text-white shadow-lg">
      <CheckCircle2 size={18} />
      {message}
    </div>,
    document.body,
  );
}
