export function getTelegramBotUsername() {
  const username = process.env.TELEGRAM_BOT_USERNAME?.trim();
  return username && /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username) ? username : null;
}
