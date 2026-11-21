import { test, expect } from "@playwright/test";
// Never `const APP = http://localhost:XXXX`. Use baseURL from config.
test("login shell renders", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/login`);
  await expect(page.getByRole("heading")).toBeVisible();
});
