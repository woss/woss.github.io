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

export interface ErrorWebhookPayload {
  error: string;
  userId: string;
  chatId: string;
  model: string;
  provider: string;
  status: number;
}

export async function callErrorWebhook(payload: ErrorWebhookPayload): Promise<void> {
  const url = config().report.errorWebhookUrl;
  if (!url) return;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`Error webhook returned ${res.status}: ${await res.text()}`);
    } else {
      console.log(`Error webhook succeeded (${res.status})`);
    }
  } catch (err) {
    console.error(`Error webhook failed: ${err}`);
  }
}
