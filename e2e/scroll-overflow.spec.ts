import { test, expect, type Page } from '@playwright/test';

test.describe('Scroll overflow behavior', () => {
  async function getScrollState(page: Page) {
    return page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('div.flex-1.overflow-y-auto.min-h-0.relative');
      if (!el) return { error: 'scroll container not found' };
      return {
        scrollTop: Math.round(el.scrollTop),
        scrollHeight: Math.round(el.scrollHeight),
        clientHeight: Math.round(el.clientHeight),
        atBottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 2,
      };
    });
  }

  async function sendMessage(page: Page, text: string) {
    const textarea = page.locator('textarea').last();
    await expect(textarea).toBeVisible({ timeout: 5000 });
    await textarea.focus();
    await textarea.pressSequentially(text, { delay: 2 });
    await page.waitForTimeout(100);
    await textarea.press('Enter');
  }

  test('stays at bottom during streaming (stickToBottom behavior)', async ({ page }) => {
    const chatId = crypto.randomUUID();
    await page.goto(`/chat/${chatId}`, { waitUntil: 'load' });
    await page.waitForTimeout(1000);

    // Send a first message and wait for some assistant response
    await sendMessage(page, 'What is the meaning of life?');

    // Wait for initial assistant response to start appearing
    await page.waitForTimeout(3000);

    // Check scroll state after first exchange
    const state1 = await getScrollState(page);
    console.log('State after first msg:', JSON.stringify(state1));
    await page.screenshot({ path: 'e2e/screenshots/overflow-state1.png' });

    // Send second message while first assistant response might still be streaming
    await sendMessage(page, 'Tell me more about philosophy');

    // Wait for content to accumulate
    await page.waitForTimeout(3000);

    const state2 = await getScrollState(page);
    console.log('State after second msg:', JSON.stringify(state2));
    await page.screenshot({ path: 'e2e/screenshots/overflow-state2.png' });

    // Send third message to really force overflow
    await sendMessage(page, 'Explain in great detail with many sentences');

    await page.waitForTimeout(4000);

    const state3 = await getScrollState(page);
    console.log('State after third msg:', JSON.stringify(state3));
    await page.screenshot({ path: 'e2e/screenshots/overflow-state3.png' });

    // Check: if we have overflow (scrollHeight > clientHeight), we should be at bottom
    if (state3.scrollHeight > state3.clientHeight) {
      expect(state3.atBottom).toBe(true);
      console.log('✅ Confirmed: scroll is at bottom with overflow content');
    } else {
      console.log('Note: No overflow yet, even with 3 messages. Chat content may be compact.');
    }

    // Verify container is correctly set up for scrolling
    const cssCheck = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('div.flex-1.overflow-y-auto.min-h-0.relative');
      if (!el) return { error: 'no container' };
      const cs = getComputedStyle(el);
      return {
        overflowY: cs.overflowY,
        display: cs.display,
        flex: cs.flex,
        position: cs.position,
      };
    });
    console.log('Container CSS:', JSON.stringify(cssCheck));
    expect(cssCheck.overflowY).toBe('auto');
  });

  test('scroll-down button appears when scrolled up', async ({ page }) => {
    const chatId = crypto.randomUUID();
    await page.goto(`/chat/${chatId}`, { waitUntil: 'load' });
    await page.waitForTimeout(1000);

    // Send messages to generate content
    await sendMessage(page, 'Hey there test message one');
    await page.waitForTimeout(2000);
    await sendMessage(page, 'Second message with more content');
    await page.waitForTimeout(2000);

    // Scroll up in the container to trigger stickToBottom = false
    const scrolled = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('div.flex-1.overflow-y-auto.min-h-0.relative');
      if (!el) return false;
      // Only scroll up if there's enough content
      if (el.scrollHeight > el.clientHeight + 100) {
        el.scrollTop = 0;
        el.dispatchEvent(new Event('scroll'));
        return true;
      }
      return false;
    });
    console.log('Scrolled up:', scrolled);

    await page.waitForTimeout(500);

    // Check if scroll-to-bottom button appears
    const button = page.locator('button[aria-label="Scroll to bottom"]');
    if (scrolled) {
      await expect(button).toBeVisible({ timeout: 2000 });
      console.log('✅ Scroll-to-bottom button visible when scrolled up');

      // Click the button to scroll back down
      await button.click();
      await page.waitForTimeout(500);

      const finalState = await getScrollState(page);
      console.log('After button click:', JSON.stringify(finalState));
      expect(finalState.atBottom).toBe(true);
    } else {
      console.log('Note: Not enough content to scroll up. Button may not appear.');
      // Button should NOT be visible since we're at bottom
      await expect(button).not.toBeVisible();
    }
  });
});
