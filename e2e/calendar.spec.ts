import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";

/** Today in the Profile's default zone, as the calendar sees it. */
function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(
    new Date(),
  );
}

function icsFor(date: string): string {
  const day = date.replaceAll("-", "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Hei//E2E//EN",
    "BEGIN:VEVENT",
    "UID:lunch",
    "SUMMARY:Lunch with Kasia",
    "LOCATION:Bistro 7",
    `DTSTART;TZID=Europe/Warsaw:${day}T120000`,
    `DTEND;TZID=Europe/Warsaw:${day}T130000`,
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:conference",
    "SUMMARY:Conference",
    `DTSTART;VALUE=DATE:${day}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

test(
  "an ICS calendar shows its events in the week and month, beside dated todos",
  { tag: "@desktop" },
  async ({ page, request }) => {
    const date = today();
    const server = createServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/calendar" });
      response.end(icsFor(date));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const { port } = server.address() as AddressInfo;
    try {
      const added = await request.post("/api/calendar/accounts/ics", {
        data: { name: "Team", url: `http://127.0.0.1:${port}/team.ics` },
      });
      expect(added.status()).toBe(201);
      await request.post("/api/todos", {
        data: { title: "Pay rent", dueDate: date },
      });

      await page.goto("/calendar");
      await expect(
        page.getByRole("checkbox", { name: "Show Team" }),
      ).toBeChecked();
      const lunch = page.getByRole("button", { name: /Lunch with Kasia/ });
      await expect(lunch).toBeVisible();
      await expect(
        page.getByRole("button", { name: /Conference/ }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /Pay rent/ }).first(),
      ).toBeVisible();

      // Details: when, which calendar, where.
      await lunch.click();
      await expect(page.getByText("12:00–13:00").first()).toBeVisible();
      await expect(page.getByText("Bistro 7")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByText("Bistro 7")).toBeHidden();

      // The month view, from the keyboard.
      await page.keyboard.press("m");
      await expect(page.getByRole("button", { name: "Month" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(
        page.getByRole("button", { name: /Lunch with Kasia/ }),
      ).toBeVisible();

      // Hiding the calendar hides its events.
      await page.getByRole("checkbox", { name: "Show Team" }).click();
      await expect(
        page.getByRole("button", { name: /Lunch with Kasia/ }),
      ).toHaveCount(0);
    } finally {
      server.close();
    }
  },
);
