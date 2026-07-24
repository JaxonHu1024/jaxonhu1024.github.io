import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const clientDirectory = resolve(root, "dist/client");
const outputDirectory = resolve(root, "github-pages-dist");
const siteOrigin = process.env.SITE_ORIGIN ?? "https://jaxonhu1024.github.io";
const siteUrl = new URL(siteOrigin);

async function render(pathname, { allowNotFound = false } = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("export", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request(new URL(pathname, siteUrl), {
      headers: {
        accept: "text/html",
        host: siteUrl.host,
        "x-forwarded-host": siteUrl.host,
        "x-forwarded-proto": siteUrl.protocol.slice(0, -1),
      },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          const assetUrl = new URL(request.url);
          try {
            const body = await readFile(resolve(clientDirectory, `.${assetUrl.pathname}`));
            return new Response(body, { status: 200 });
          } catch {
            return new Response("Not found", { status: 404 });
          }
        },
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  if (!response.ok && !(allowNotFound && response.status === 404)) {
    throw new Error(`Failed to render ${pathname}: ${response.status}`);
  }

  return response.text();
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

await cp(resolve(clientDirectory, "assets"), resolve(outputDirectory, "assets"), {
  recursive: true,
});
await cp(resolve(root, "public/favicon.svg"), resolve(outputDirectory, "favicon.svg"));
await cp(resolve(root, "public/og.png"), resolve(outputDirectory, "og.png"));

const html = await render("/");
const notFoundHtml = await render("/404", { allowNotFound: true });
await writeFile(resolve(outputDirectory, "index.html"), html);
await writeFile(resolve(outputDirectory, "404.html"), notFoundHtml);

console.log(`Exported GitHub Pages artifact to ${outputDirectory}`);
