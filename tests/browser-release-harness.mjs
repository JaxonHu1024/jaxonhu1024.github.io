export async function createReleasePageSession(browser, options) {
  const context = await browser.newContext({
    serviceWorkers: "block",
    ...options,
  });
  const page = await context.newPage();

  return { context, page };
}
