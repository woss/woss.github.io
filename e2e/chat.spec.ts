import { test, expect } from '@playwright/test';

test.describe('AI chat flow', () => {
  test('home page loads and chat input is visible', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (err) => logs.push(`[PAGE_ERROR] ${err.message}`));

    // Navigate to home page
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(1000);

    // Verify page loaded — look for the text input
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 5000 });

    // Type a question
    const question = 'What projects has Daniel founded?';
    await textarea.fill(question);
    await expect(textarea).toHaveValue(question);

    // Press Enter to send
    await textarea.press('Enter');

    // Wait for navigation to chat page (auto-send flow)
    await page.waitForURL(/\/chat\//, { timeout: 15000 });

    // Wait for the user message to appear
    await expect(page.getByText(question).first()).toBeAttached({ timeout: 5000 });

    // Check for console errors
    const errors = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[PAGE_ERROR]'));
    expect(errors).toEqual([]);

    console.log('Console output:', logs.join('\n'));
  });

  test('chat page loads directly and accepts input', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (err) => logs.push(`[PAGE_ERROR] ${err.message}`));

    // Navigate directly to a new chat
    await page.goto('/chat/new', { waitUntil: 'load' });
    await page.waitForTimeout(1000);

    // Verify the input is present
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 5000 });

    // Check for console errors
    const errors = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[PAGE_ERROR]'));
    expect(errors).toEqual([]);

    console.log('Console output:', logs.join('\n'));
  });
});
