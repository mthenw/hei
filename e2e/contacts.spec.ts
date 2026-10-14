import { expect, test } from "@playwright/test";

test(
  "@ offers contacts, and an email draft opens in Gmail",
  { tag: "@desktop" },
  async ({ page }) => {
    await page.goto("/chat");
    await expect(page.getByRole("combobox", { name: "Model" })).toHaveText(
      /Hei dev model/,
    );
    const composer = page.getByPlaceholder("Ask Hei anything");

    // The test server has no Google account, so "@" offers a hint and no one to pick.
    await composer.fill("Write to @");
    await expect(
      page.getByText("Type a name to mention someone"),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByText("Type a name to mention someone")).toBeHidden();

    // The dev model drafts an email when a message starts with /draft.
    await composer.fill("/draft a hello");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/chat\/\d+$/);

    await expect(page.getByText("Hello from Hei")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("someone@example.com")).toBeVisible();
    const gmail = new URL(
      (await page
        .getByRole("link", { name: "Open in Gmail" })
        .getAttribute("href")) ?? "",
    );
    expect(gmail.origin).toBe("https://mail.google.com");
    expect(Object.fromEntries(gmail.searchParams)).toMatchObject({
      view: "cm",
      to: "someone@example.com",
      su: "Hello from Hei",
      body: expect.stringContaining("development model"),
    });
    await expect(page.getByText("The draft is above.")).toBeVisible();
  },
);
