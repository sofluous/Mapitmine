// Exercise the visible responsive control, keeping filter coverage on both UIs.
export async function chooseObjectKind(page, kind) {
  const select = page.locator('#objectFilter');
  if (await select.isVisible()) await select.selectOption(kind);
  else await page.locator(`[data-object-filter="${kind}"]`).click();
}

export async function choosePinView(page, value) {
  const control = page.locator('#pinRowView');
  await control.selectOption(value);
}
