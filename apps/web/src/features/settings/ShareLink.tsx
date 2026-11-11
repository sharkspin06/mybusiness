import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/ui';

/** Shows a one-time link with Copy and WhatsApp buttons (there's no email sending yet). */
export function ShareLink({ link, message, note }: { link: string; message: string; note: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      (document.getElementById('share-link-input') as HTMLInputElement | null)?.select();
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <label className="block">
        <span className="block text-[14px] font-medium text-ink-2 mb-1.5">Link</span>
        <input
          id="share-link-input"
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full h-11 md:h-9 px-3 rounded-sm border border-line-strong bg-surface-1 text-sm font-mono text-ink-2"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={copy} className="max-md:h-11 max-md:grow">
          {copied ? 'Copied' : 'Copy link'}
        </Button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`${message} ${link}`)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-1.5 h-11 md:h-9 px-3.5 rounded-sm border border-line-strong bg-bg text-sm font-medium text-ink hover:bg-surface-1 max-md:grow"
        >
          <Icon name="message" />
          Send on WhatsApp
        </a>
      </div>
      <p className="text-[14px] text-ink-3">{note}</p>
    </div>
  );
}
