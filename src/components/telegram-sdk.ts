type NativeButton = {
  show: () => void;
  hide: () => void;
  onClick: (callback: () => void) => void;
  offClick: (callback: () => void) => void;
};

type TelegramWebApp = {
  initData?: string;
  ready?: () => void;
  expand?: () => void;
  colorScheme?: 'light' | 'dark';
  onEvent?: (event: 'themeChanged', callback: () => void) => void;
  offEvent?: (event: 'themeChanged', callback: () => void) => void;
  HapticFeedback?: { impactOccurred?: (style: 'light') => void };
  MainButton?: NativeButton & { setText: (text: string) => void };
  BackButton?: NativeButton;
};

export function readTelegramWebApp() {
  return (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
}
