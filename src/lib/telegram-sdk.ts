export type TelegramSafeArea = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type TelegramThemeParams = {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
  header_bg_color?: string;
  accent_text_color?: string;
  section_bg_color?: string;
  subtitle_text_color?: string;
  destructive_text_color?: string;
};

export type TelegramButton = {
  isVisible?: boolean;
  setText: (text: string) => unknown;
  setParams?: (params: {
    text?: string;
    color?: string;
    text_color?: string;
    is_active?: boolean;
    is_visible?: boolean;
    position?: 'left' | 'right' | 'top' | 'bottom';
  }) => unknown;
  show: () => unknown;
  hide: () => unknown;
  enable?: () => unknown;
  disable?: () => unknown;
  showProgress?: (leaveActive?: boolean) => unknown;
  hideProgress?: () => unknown;
  onClick: (cb: () => void) => unknown;
  offClick: (cb: () => void) => unknown;
};

export type TelegramWebApp = {
  ready?: () => void;
  expand?: () => void;
  close?: () => void;
  openLink?: (url: string) => void;
  openTelegramLink?: (url: string) => void;
  enableClosingConfirmation?: () => void;
  disableClosingConfirmation?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  initData?: string;
  platform?: string;
  version?: string;
  colorScheme?: 'light' | 'dark';
  themeParams?: TelegramThemeParams;
  safeAreaInset?: Partial<TelegramSafeArea>;
  contentSafeAreaInset?: Partial<TelegramSafeArea>;
  isExpanded?: boolean;
  viewportHeight?: number;
  viewportStableHeight?: number;
  initDataUnsafe?: {
    user?: {
      id?: number;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
    start_param?: string;
  };
  onEvent?: (eventType: string, handler: () => void) => void;
  offEvent?: (eventType: string, handler: () => void) => void;
  HapticFeedback?: {
    impactOccurred?: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged?: () => void;
  };
  MainButton?: TelegramButton;
  SecondaryButton?: TelegramButton;
  BackButton?: {
    isVisible?: boolean;
    show: () => unknown;
    hide: () => unknown;
    onClick: (cb: () => void) => unknown;
    offClick: (cb: () => void) => unknown;
  };
};

type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
};

export function getTelegramWebApp(): TelegramWebApp | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as TelegramWindow).Telegram?.WebApp;
}

export function readTelegramSafeAreas(webApp: TelegramWebApp | undefined): {
  top: number;
  bottom: number;
  left: number;
  right: number;
} {
  const safe = webApp?.safeAreaInset;
  const content = webApp?.contentSafeAreaInset;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
  return {
    top: num(safe?.top) + num(content?.top),
    bottom: num(safe?.bottom) + num(content?.bottom),
    left: num(safe?.left) + num(content?.left),
    right: num(safe?.right) + num(content?.right),
  };
}

export function syncTelegramColors(webApp: TelegramWebApp | undefined, scheme: 'light' | 'dark'): void {
  if (!webApp) return;
  const bg = scheme === 'dark' ? '#0A0A0B' : '#FFFFFF';
  try {
    webApp.setHeaderColor?.(bg);
    webApp.setBackgroundColor?.(bg);
  } catch {
    // Older Telegram clients ignore unsupported color keys.
  }
}
