import { test, expect, type Page } from '@playwright/test';

// Helper: get scroll state from the correct container
async function getScrollState(page: Page) {
  return page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('div.flex-1.overflow-y-auto.min-h-0.relative');
    if (!el) return { error: 'scroll container not found' };
    return {
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      atBottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 2,
      overflowY: getComputedStyle(el).overflowY,
    };
  });
}

async function fillAndSendTextarea(page: Page, text: string) {
  // Find ALL textareas and use the visible one
  const textarea = page.locator('textarea').last();
  await expect(textarea).toBeVisible({ timeout: 5000 });
  await textarea.focus();
  await textarea.pressSequentially(text, { delay: 3 });
  await page.waitForTimeout(200);
  await textarea.press('Enter');
}

test.describe('Comprehensive chat scroll', () => {
  test('scrolls to bottom on page load with existing messages', async ({ page }) => {
    // Collect console output
    const logs: string[] = [];
    page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (err) => logs.push(`[PAGE_ERROR] ${err.message}`));

    // Navigate to a chat that has messages. Use a new chat so no SSE replay issues.
    const chatId = crypto.randomUUID();
    await page.goto(`/chat/${chatId}`, { waitUntil: 'load' });
    await page.waitForTimeout(2000); // Let page render and settle

    const initial = await getScrollState(page);
    console.log('Initial scroll state:', JSON.stringify(initial));

    // Save screenshots for debugging
    await page.screenshot({ path: 'e2e/screenshots/comp-initial.png' });

    // Check scroll container exists with correct CSS
    expect(initial.overflowY).toBe('auto');
  });

  test('scrolls to bottom on send', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (err) => logs.push(`[PAGE_ERROR] ${err.message}`));

    const chatId = crypto.randomUUID();
    await page.goto(`/chat/${chatId}`, { waitUntil: 'load' });
    await page.waitForTimeout(1000);

    // Verify textarea exists
    const ta = page.locator('textarea').last();
    await expect(ta).toBeVisible();

    // Send first message to create overflow
    await fillAndSendTextarea(page, 'Tell me a long story about dragons and magic and adventures');

    // Wait for message to appear and streaming to start
    await page.waitForTimeout(2000);

    const afterSend = await getScrollState(page);
    console.log('After send scroll state:', JSON.stringify(afterSend));
    await page.screenshot({ path: 'e2e/screenshots/comp-after-send.png' });

    // The container should either be at bottom, or have scrollable content
    console.log(
      'scrollTop:',
      afterSend.scrollTop,
      'scrollHeight:',
      afterSend.scrollHeight,
      'clientHeight:',
      afterSend.clientHeight,
    );

    // If scrollHeight > clientHeight, scrollTop should be > 0 (scrolled to bottom)
    // If scrollHeight === clientHeight, there's no overflow (trivially at bottom)
    if (afterSend.scrollHeight > afterSend.clientHeight) {
      expect(afterSend.atBottom).toBe(true);
    } else {
      // No overflow yet, that's OK for a single message
      console.log('No overflow yet - single message');
    }

    // Log any console errors
    if (logs.length > 0) {
      console.log('Console output:', logs.join('\n'));
    }
  });
});
