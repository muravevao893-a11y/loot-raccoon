export const tg = window.Telegram?.WebApp;

export function initTelegram() {
  tg?.ready?.();
  tg?.expand?.();
}

export function getTelegramUser() {
  return tg?.initDataUnsafe?.user;
}

export function getStartParam() {
  return tg?.initDataUnsafe?.start_param ?? '';
}

export function getInitData() {
  return tg?.initData ?? '';
}

export function haptic(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'light') {
  try {
    tg?.HapticFeedback?.impactOccurred(style);
  } catch {
    // Telegram haptics can be unavailable in desktop/web preview.
  }
}

export function notify(type: 'error' | 'success' | 'warning') {
  try {
    tg?.HapticFeedback?.notificationOccurred(type);
  } catch {
    // noop
  }
}
