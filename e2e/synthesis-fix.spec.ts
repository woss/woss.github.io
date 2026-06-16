import { test, expect } from '@playwright/test';

test.describe('Synthesis round fix', () => {
  test('AI produces complete portfolio response with real data', async ({ page }) => {
    test.setTimeout(180000); // 3 min for AI generation
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`[${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', (err) => errors.push(`[PAGE_ERROR] ${err.message}`));

    // Navigate to home page
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(1500);

    // Find the textarea and send a portfolio question
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 5000 });

    const question = 'show me daniels photography portfolio';
    await textarea.fill(question);
    await expect(textarea).toHaveValue(question);
    await textarea.press('Enter');

    // Wait for navigation to chat page (auto-send flow creates /chat/[id])
    await page.waitForURL(/\/chat\//, { timeout: 15000 });

    // Wait for the user message to appear
    await expect(page.getByText(question).first()).toBeAttached({ timeout: 5000 });

    // Wait for the textarea to become enabled (indicates AI finished generating)
    await page.waitForTimeout(2000);

    // The textarea has disabled={isLoading}. Wait until it's enabled.
    await expect(textarea).toBeEnabled({ timeout: 120000 });

    // Collect all assistant messages from the chat
    const assistantMessages = page.locator('.justify-start');

    // Get the last/full assistant response text
    const lastMessageText = await assistantMessages.last().innerText();

    // Verify response is substantial
    expect(lastMessageText.length).toBeGreaterThan(150);

    // Verify no raw XML/tool_call artifacts remain in the final output
    const xmlPattern = /<[^>]*(?:tool_calls|invoke|parameter|toolResult|tool_call|function)[^>]*>/i;
    expect(lastMessageText).not.toMatch(xmlPattern);

    // Verify portfolio content is present
    const portfolioKeywords = ['daniel', 'photography', 'portfolio', 'photo', 'image', 'picture', 'gallery', 'album'];
    const hasPortfolioContent = portfolioKeywords.some((kw) => lastMessageText.toLowerCase().includes(kw));
    expect(hasPortfolioContent).toBe(true);

    // Verify no console/page errors
    expect(errors).toEqual([]);
  });
});
