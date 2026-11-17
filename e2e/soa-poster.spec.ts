import { expect, test, type Page } from "@playwright/test";

import { db, mockRequests, resetMock, setPosterExtraction, unique } from "./helpers";

// A 1x1 PNG: small enough to be sent as-is. The fake Claude ignores the
// image and returns whatever setPosterExtraction set.
const POSTER = {
  name: "poster.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  ),
};

const EMPTY_EXTRACTION = {
  name: null,
  destinationName: null,
  pricePerPax: null,
  originalPricePerPax: null,
  durationLabel: null,
  remarks: null,
  travelDates: [],
  itinerary: [],
  inclusions: [],
  exclusions: [],
  bringItems: [],
};

const BORACAY = {
  ...EMPTY_EXTRACTION,
  name: "Boracay Escape",
  destinationName: "Boracay",
  durationLabel: "3D2N",
  pricePerPax: 5999,
  inclusions: ["Roundtrip airfare", "2 nights hotel"],
  exclusions: ["Travel tax", "Terminal fee"],
};

async function importPoster(page: Page) {
  // The file input behind "Import from poster" is hidden; set it directly.
  await page.getByLabel("Poster image").setInputFiles(POSTER);
}

const descriptions = (page: Page) => page.getByLabel("Description");
const unitPrices = (page: Page) => page.getByLabel("Unit price");

test.beforeEach(async () => {
  await resetMock();
});

test("SOA: poster import adds the package, inclusions and exclusions as line items", async ({ page }) => {
  await setPosterExtraction(BORACAY);
  const billTo = unique("Poster SOA");

  await page.goto("/admin/soa/new");
  await page.getByLabel("Bill to", { exact: true }).fill(billTo);
  await expect(descriptions(page)).toHaveCount(1); // the blank starter row

  await importPoster(page);
  await expect(page.getByText("Added 5 line items from the poster.")).toBeVisible();
  await expect(page.getByText("2 need a price")).toBeVisible();

  // The blank starter row was replaced, not kept above the imported items.
  await expect(descriptions(page)).toHaveCount(5);
  await expect(descriptions(page).nth(0)).toHaveValue("Boracay Escape (3D2N)");
  await expect(unitPrices(page).nth(0)).toHaveValue("5999");
  await expect(descriptions(page).nth(1)).toHaveValue("Inclusion: Roundtrip airfare");
  await expect(unitPrices(page).nth(1)).toHaveValue("0");
  await expect(descriptions(page).nth(2)).toHaveValue("Inclusion: 2 nights hotel");
  await expect(descriptions(page).nth(3)).toHaveValue("Exclusion: Travel tax");
  await expect(unitPrices(page).nth(3)).toHaveValue("");
  await expect(descriptions(page).nth(4)).toHaveValue("Exclusion: Terminal fee");
  await expect(unitPrices(page).nth(4)).toHaveValue("");

  // The poster was sent to Claude as an image.
  const reads = (await mockRequests()).filter((r) => r.path === "/anthropic/v1/messages");
  expect(reads).toHaveLength(1);
  expect(JSON.stringify(reads[0].body)).toContain('"type":"image"');

  // Unpriced exclusions block saving until they're priced or removed.
  await page.getByRole("button", { name: "Create Statement" }).click();
  await expect(page.getByText("Please fix the highlighted fields before saving.")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/soa\/new/);

  await page.getByLabel("Qty").nth(0).fill("2");
  await unitPrices(page).nth(3).fill("1620");
  await page.getByRole("button", { name: "Remove item 5" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
  await expect(descriptions(page)).toHaveCount(4);

  await page.getByRole("button", { name: "Create Statement" }).click();
  await expect(page.getByText("Statement created.")).toBeVisible();
  await page.waitForURL(/\/admin\/soa\/(?!new)[^/]+$/);

  const { data: soa, error } = await db()
    .from("statements")
    .select("line_items")
    .eq("bill_to_name", billTo)
    .single();
  expect(error).toBeNull();
  expect(soa?.line_items).toEqual([
    { description: "Boracay Escape (3D2N)", quantity: 2, unitPrice: 5999 },
    { description: "Inclusion: Roundtrip airfare", quantity: 1, unitPrice: 0 },
    { description: "Inclusion: 2 nights hotel", quantity: 1, unitPrice: 0 },
    { description: "Exclusion: Travel tax", quantity: 1, unitPrice: 1620 },
  ]);
});

test("SOA: poster import appends after items typed by hand", async ({ page }) => {
  await setPosterExtraction({ ...EMPTY_EXTRACTION, inclusions: ["Island hopping"] });

  await page.goto("/admin/soa/new");
  await descriptions(page).nth(0).fill("Visa processing");
  await unitPrices(page).nth(0).fill("2500");

  await importPoster(page);
  await expect(page.getByText("Added 2 line items from the poster.")).toBeVisible();

  await expect(descriptions(page)).toHaveCount(3);
  await expect(descriptions(page).nth(0)).toHaveValue("Visa processing");
  await expect(unitPrices(page).nth(0)).toHaveValue("2500");
  // No title or price on the flyer: a generic package line with a blank price.
  await expect(descriptions(page).nth(1)).toHaveValue("Tour package");
  await expect(unitPrices(page).nth(1)).toHaveValue("");
  await expect(descriptions(page).nth(2)).toHaveValue("Inclusion: Island hopping");
});

test("SOA: an unreadable poster leaves the line items alone", async ({ page }) => {
  await setPosterExtraction(EMPTY_EXTRACTION);

  await page.goto("/admin/soa/new");
  await descriptions(page).nth(0).fill("Hotel only");

  await importPoster(page);
  await expect(page.getByText(/No package, inclusions or exclusions could be read/)).toBeVisible();
  await expect(descriptions(page)).toHaveCount(1);
  await expect(descriptions(page).nth(0)).toHaveValue("Hotel only");
});
