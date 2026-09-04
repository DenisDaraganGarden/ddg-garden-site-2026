import { test, expect } from '@playwright/test';

test.describe('Mobile UI Verification', () => {
  test('should load the homepage and check key elements on mobile', async ({ page, isMobile }) => {
    // This test will run in all projects, but we can skip if not mobile if desired
    // For now we run it on all to verify general layout
    
    await page.goto('/');

    // Wait for the app to load (checking for a common element like 'main' or a specific container)
    await page.waitForSelector('body');

    // Screenshot for visual verification
    await page.screenshot({ path: `output/screenshot-homepage-${isMobile ? 'mobile' : 'desktop'}.png` });

    // Check for Menu button (common in mobile)
    // Adjust selector based on actual implementation
    const menuButton = page.locator('button[aria-label="menu"], .menu-toggle, #menu-button');
    if (await menuButton.count() > 0) {
      await expect(menuButton).toBeVisible();
      
      // Check that it's clickable and not obscured
      const box = await menuButton.boundingBox();
      expect(box).not.toBeNull();
      
      // Ensure it's in a reasonable position (e.g., top right or top left)
      const viewport = page.viewportSize();
      if (viewport) {
        expect(box.y).toBeLessThan(100); // Should be near the top
      }
    }

    // Check that there are no horizontal scrollbars on mobile
    const isHorizontalScrollable = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    
    if (isMobile) {
      expect(isHorizontalScrollable).toBe(false);
    }
  });

  test('buttons should be appropriately sized for touch', async ({ page, isMobile }) => {
    if (!isMobile) return;

    await page.goto('/');
    
    const buttons = await page.locator('button, a[role="button"]').all();
    for (const button of buttons) {
      if (await button.isVisible()) {
        const box = await button.boundingBox();
        if (box) {
          const text = await button.innerText();
          const label = await button.getAttribute('aria-label');
          const id = await button.getAttribute('id');
          const name = text || label || id || 'unnamed-button';
          
          if (box.width < 30 || box.height < 30) {
            console.log(`Failing button: "${name}" at (${box.x}, ${box.y}) - Size: ${box.width}x${box.height}`);
          }
          
          expect(box.width, `Button "${name}" is too narrow`).toBeGreaterThanOrEqual(30);
          expect(box.height, `Button "${name}" is too short`).toBeGreaterThanOrEqual(30);
        }
      }
    }
  });
});
