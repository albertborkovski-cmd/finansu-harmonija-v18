import { useState } from 'react';
import type { RelatedObject } from '../lib/notifications';
import { NOTIFICATION_OPEN_BUTTON_CLASS_NAME } from '../lib/notificationPresentation';

export type OpenRelatedObject = (object: RelatedObject) => Promise<void>;

/** Application navigation keeps the current list mounted so Back restores its context. */
export default function RelatedObjectLink({ object, organizationId, label, variant = 'link', onOpen, onError }: {
  object: RelatedObject;
  organizationId?: string;
  label?: string;
  variant?: 'link' | 'button';
  onOpen: OpenRelatedObject;
  onError: (message: string) => void;
}) {
  const [opening, setOpening] = useState(false);
  return <button type="button" role={variant === 'link' ? 'link' : undefined} disabled={opening}
    aria-label={`${label ?? `Open ${object.type}`}: ${object.label}`} title={object.label}
    className={variant === 'button'
      ? NOTIFICATION_OPEN_BUTTON_CLASS_NAME
      : 'max-w-full truncate text-left text-[#007EA7] hover:underline disabled:cursor-wait disabled:opacity-60'}
    onClick={async () => {
      if (opening) return;
      setOpening(true);
      onError('');
      try {
        if (!organizationId || object.organizationId !== organizationId) throw new Error('The related object does not belong to this organization.');
        await onOpen(object);
      }
      catch (error) { onError(error instanceof Error ? error.message : 'The related object is unavailable.'); }
      finally { setOpening(false); }
    }}>{variant === 'button' ? 'Open' : label ?? object.label}</button>;
}
