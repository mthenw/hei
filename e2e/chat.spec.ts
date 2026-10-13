import { devices, expect, type Page, test } from "@playwright/test";

/** Start a chat from the new-chat page and wait for the dev model's reply to finish. */
async function startChat(page: Page, message: string) {
  await sendFirstMessage(page, message);
  await expectFinishedReply(page, message);
}

/** Send a chat's first message; resolves once its page is open. */
async function sendFirstMessage(page: Page, message: string) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByRole("combobox", { name: "Model" })).toHaveText(
    /Hei dev model/,
  );

  await page.getByPlaceholder("Ask Hei anything").fill(message);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/chat\/\d+$/);
}

/** The dev model quotes the message back, then streams a fixed reply; its last line means the reply is complete. */
async function expectFinishedReply(page: Page, message: string) {
  await expect(page.locator("blockquote")).toContainText(message);
  await expect(page.getByText("it resumes by itself")).toBeVisible({
    timeout: 30_000,
  });
}

test(
  "start, reopen, regenerate, rename and delete a chat",
  { tag: "@desktop" },
  async ({ page }) => {
    const message = "Plan a picnic by the lake";
    await startChat(page, message);

    const chats = page.getByRole("navigation", { name: "Chats" });
    await expect(chats.getByRole("link", { name: message })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page).toHaveTitle(`${message} · Hei`);

    // The conversation is stored, not just held by the page.
    await page.reload();
    await expect(page.locator("blockquote")).toContainText(message);
    await expect(page.getByText("it resumes by itself")).toBeVisible();

    // Regenerate replaces the reply instead of adding a second one.
    await page.getByRole("button", { name: "Regenerate" }).click();
    await expect(page.getByText("it resumes by itself")).toBeHidden();
    await expect(page.getByText("it resumes by itself")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator("blockquote")).toHaveCount(1);

    await chats.getByRole("link", { name: message }).hover();
    await chats.getByRole("button", { name: `Actions for ${message}` }).click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    const field = page.getByRole("textbox", { name: "Chat title" });
    await field.fill("Lake picnic");
    await field.press("Enter");
    await expect(
      chats.getByRole("link", { name: "Lake picnic" }),
    ).toBeVisible();
    await expect(page).toHaveTitle("Lake picnic · Hei");

    await chats.getByRole("link", { name: "Lake picnic" }).hover();
    await chats
      .getByRole("button", { name: "Actions for Lake picnic" })
      .click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    const confirm = page.getByRole("alertdialog", {
      name: "Delete this chat?",
    });
    await confirm.getByRole("button", { name: "Delete" }).click();

    await expect(page).toHaveURL(/\/chat$/);
    await expect(page.getByRole("link", { name: "Lake picnic" })).toHaveCount(
      0,
    );
  },
);

test(
  "chat from a phone, then find it in the drawer",
  { tag: "@phone" },
  async ({ page }) => {
    const message = "Ideas for a rainy Sunday";
    await startChat(page, message);

    // The header names the open chat, not the section.
    await expect(page.getByRole("banner")).toContainText(message);

    await page.getByRole("button", { name: "Open Chats" }).click();
    const drawer = page.getByRole("dialog", { name: "Chats" });
    await expect(drawer.getByRole("link", { name: message })).toBeVisible();
    await drawer.getByRole("link", { name: "New chat" }).click();
    await expect(drawer).toBeHidden();
    await expect(
      page.getByRole("heading", { name: "What can I help with?" }),
    ).toBeVisible();

    const tabs = page.getByRole("navigation", { name: "Sections" });
    await tabs.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings\/profile$/);
    await expect(page.getByRole("banner")).toContainText("Settings");
  },
);

test(
  "a reply keeps going after the tab closes and finishes on the phone",
  { tag: "@desktop" },
  async ({ page, browser }) => {
    const message = "Write a haiku about trams";
    await sendFirstMessage(page, message);
    // Close the tab while the reply is still streaming.
    await expect(page.getByText("it resumes by itself")).toBeHidden();
    const url = page.url();
    await page.close();

    const phone = await browser.newContext({ ...devices["Pixel 7"] });
    const phonePage = await phone.newPage();
    await phonePage.goto(url);
    await expectFinishedReply(phonePage, message);
    await phone.close();
  },
);
