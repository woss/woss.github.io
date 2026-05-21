import { config } from './config';

export enum webhooksEnum {
  reportGenericMessage,
  reportMessage,
  messageDownvote,
  messageHeart,
  messageUpvote,
  reactionRemoved,
  chatLocked,
  chatDeleted,
  contactSubmitted,
}

interface WebhookData {
  type: keyof typeof webhooksEnum;
  chatId?: string;
  messageId?: string;
  reason?: string;
  userAgent?: string;
  country?: string;
}

export async function callWebhook(data: WebhookData): Promise<void> {
  console.log('Webhook called:', data);

  const message =
    `Webhook event: ${data.type}` +
    (data.chatId ? `,\nchatId: ${data.chatId}` : '') +
    (data.messageId ? `,\nmessageId: ${data.messageId}` : '') +
    (data.reason ? `,\nreason: ${data.reason}` : '') +
    (data.userAgent ? `,\nuserAgent: ${data.userAgent}` : '') +
    (data.country ? `,\ncountry: ${data.country}` : '');
  try {
    const response = await fetch(config().report.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config().report.webhookToken,
      },
      body: JSON.stringify({
        message,
        type: data.type,
        ...(data.userAgent && { userAgent: data.userAgent }),
        ...(data.country && { country: data.country }),
      }),
    });
    const result = await response.json();
    console.log('Webhook response:', result);
  } catch (error) {
    console.error('Webhook failed:', error);
  }
  return;
}
