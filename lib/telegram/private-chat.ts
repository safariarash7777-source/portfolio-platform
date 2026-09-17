/** Webhook secret authentication must run first; this is the delivery boundary. */
export function isPrivateBotConversation(message: {
  from?: { id?: number; is_bot?: boolean };
  chat?: { id?: number; type?: string };
} | undefined): boolean {
  const userId = message?.from?.id;
  return message?.chat?.type === 'private'
    && typeof userId === 'number'
    && Number.isSafeInteger(userId)
    && userId > 0
    && message?.from?.is_bot !== true
    && message.chat.id === userId;
}
