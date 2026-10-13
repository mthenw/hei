import { expect, test } from "@playwright/test";

test(
  "add a todo, hand it to an agent, then complete it",
  { tag: "@desktop" },
  async ({ page }) => {
    const title = "Pack for the trip";
    await page.goto("/todos");
    await page.getByRole("textbox", { name: "New todo" }).fill(title);
    await page.keyboard.press("Enter");

    const someday = page.locator("section", {
      has: page.getByRole("heading", { name: "Someday" }),
    });
    await someday.getByRole("button", { name: title }).click();

    // The dev model answers without reporting a result, so the agent ends up waiting for the user.
    const editor = page.getByRole("dialog", { name: "Edit todo" });
    await editor.getByRole("button", { name: "Hand off" }).click();
    await expect(editor.getByText("Working")).toBeVisible();
    await expect(editor.getByText("Needs you")).toBeVisible({
      timeout: 30_000,
    });

    // The agent's chat starts with the todo.
    await editor.getByRole("link", { name: "Open chat" }).click();
    await expect(page).toHaveURL(/\/chat\/\d+$/);
    await expect(page.locator("blockquote")).toContainText(title);

    await page.goto("/todos");
    await page.getByRole("checkbox", { name: `Complete “${title}”` }).click();
    await page.getByRole("button", { name: "Completed" }).click();
    await expect(
      page.getByRole("checkbox", { name: `Reopen “${title}”` }),
    ).toBeVisible();
  },
);
