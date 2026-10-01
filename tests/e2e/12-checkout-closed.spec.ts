// Checkout closed (storefront-checkout-plan.md P0.1): cart-checkout answers
// 503 checkout_closed unless the site env CHECKOUT_OPEN is exactly 'true'.
//
// Two angles: the function called directly, and a shopper on /plans who adds
// a plan and presses Checkout. Neither sends a body that could pass
// validation: if the gate were ever missing, these requests would stop at
// 400 instead of reaching the engine, so the test can fail but can never
// create a PaymentIntent. A valid body is covered by the unit tests, with the
// engine injected. The file also skips itself when designer-plan-site/.env
// opens checkout.

import { test, expect } from '@playwright/test';
import { siteEnv } from './helpers/env';

const CHECKOUT_URL = '/.netlify/functions/cart-checkout';
const CART_KEY = 'dp_cart_v1';
const CART_ALERT = 'Checkout is in development. Your items are saved in your cart.';

test.skip(siteEnv('CHECKOUT_OPEN') === 'true', 'CHECKOUT_OPEN=true in designer-plan-site/.env; this spec only runs while checkout is closed');

test.describe('Checkout closed: cart-checkout answers 503 checkout_closed', () => {
  test('the function refuses before reading the body: 503 checkout_closed, not 400', async ({ request }) => {
    // Open, these would be 400 bad_json and 400 validation_failed. Closed,
    // both are 503: proof that the gate runs first.
    for (const body of ['{"plan_id":', '{}']) {
      const res = await request.post(CHECKOUT_URL, {
        headers: { 'Content-Type': 'application/json' },
        data: body
      });
      expect(res.status(), await res.text()).toBe(503);
      const json = await res.json();
      expect(json.code).toBe('checkout_closed');
      expect(typeof json.message).toBe('string');
    }
  });

  test('a shopper on /plans keeps the cart and sees the in-development notice', async ({ page }) => {
    await page.goto('/plans');
    await page.evaluate((key) => localStorage.removeItem(key), CART_KEY);
    await page.reload();

    await page.locator('[data-add-to-cart][data-plan="tier-one"]').click();
    const checkout = page.locator('#cart-checkout');
    await expect(checkout).toBeEnabled();

    const urlBefore = page.url();
    const dialogMessage = new Promise<string>((resolve) => {
      page.once('dialog', async (dialog) => {
        const message = dialog.message();
        await dialog.accept();
        resolve(message);
      });
    });

    const [response] = await Promise.all([
      page.waitForResponse(/cart-checkout/),
      checkout.click()
    ]);
    expect(response.status()).toBe(503);
    expect(await dialogMessage).toBe(CART_ALERT);

    expect(page.url()).toBe(urlBefore);
    const stored = await page.evaluate((key) => localStorage.getItem(key), CART_KEY);
    expect(JSON.parse(stored || '[]')).toHaveLength(1);
    await expect(page.locator('#cart-items li')).toHaveCount(1);
  });
});
