'use client';

import { useEffect, useState } from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from 'lucide-react';

function readMetaScheme(): ToasterProps['theme'] {
  if (typeof document === 'undefined') return 'system';
  const content = document.querySelector('meta[name="color-scheme"]')?.getAttribute('content');
  if (content === 'dark') return 'dark';
  if (content === 'light') return 'light';
  return 'system';
}

const Toaster = ({ ...props }: ToasterProps) => {
  const [theme, setTheme] = useState<ToasterProps['theme']>(() => readMetaScheme());

  useEffect(() => {
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (!meta) return;
    const update = () => setTheme(readMetaScheme());
    update();
    const observer = new MutationObserver(update);
    observer.observe(meta, { attributes: true, attributeFilter: ['content'] });
    return () => observer.disconnect();
  }, []);

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: 'cn-toast',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
