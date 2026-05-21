import { test, expect } from '@playwright/test';

test.describe('Chat auto-scroll', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a new chat page with a random ID
    const chatId = crypto.randomUUID();
    await page.goto(`/chat/${chatId}`);

    // Wait for the scroll container and textarea to render
    await page.waitForSelector('div.flex-1.overflow-y-auto.min-h-0', { state: 'attached', timeout: 10000 });
    await page.waitForSelector('textarea[placeholder*="Ask"]', { state: 'visible', timeout: 10000 });

    // Give Svelte 5 event delegation system time to initialize.
    // Without this, onkeydown may not fire for Enter key in parallel runs.
    await page.waitForTimeout(500);
  });

  test('scrolls to bottom when sending a message', async ({ page }) => {
    // Find the message list scroll container
    const messageList = page.locator('div.flex-1.overflow-y-auto.min-h-0');
    await expect(messageList).toBeAttached();

    // Find the chat input textarea
    const input = page.locator('textarea[placeholder*="Ask"]');
    await expect(input).toBeVisible();
    await input.focus();

    // Type message character by character for realistic Svelte binding
    await input.pressSequentially('Hello!', { delay: 10 });
    await page.waitForTimeout(100);

    // Send via Enter (without Shift)
    await input.press('Enter');

    // Wait for user message to appear in DOM
    // The empty state gets replaced by message list
    await page.waitForTimeout(1000);

    // Verify user message text appears in the DOM
    await expect(page.getByText('Hello!')).toBeAttached({ timeout: 10000 });

    // Verify scroll container is scrolled to bottom
    const scrollTop = await messageList.evaluate((el) => el.scrollTop);
    const scrollHeight = await messageList.evaluate((el) => el.scrollHeight);
    const clientHeight = await messageList.evaluate((el) => el.clientHeight);

    // scrollTop + clientHeight should be at or near scrollHeight
    expect(scrollTop + clientHeight).toBeGreaterThanOrEqual(scrollHeight - 2);
  });

  test('scroll container exists with overflow-y-auto', async ({ page }) => {
    const messageList = page.locator('div.flex-1.overflow-y-auto.min-h-0');
    await expect(messageList).toBeAttached();

    const overflowY = await messageList.evaluate((el) => getComputedStyle(el).overflowY);
    expect(overflowY).toBe('auto');
  });
});
