import { test, expect } from "@playwright/test";
// Never `const APP = http://localhost:XXXX`. Use baseURL from config.
test("shell renders", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/`);
  await expect(page.getByRole("heading")).toBeVisible();
});
