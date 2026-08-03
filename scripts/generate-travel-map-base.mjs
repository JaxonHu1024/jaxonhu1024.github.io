import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const sourcePath = process.argv[2];
const outputPath = resolve(
  process.argv[3] ?? new URL("../public/assets/travel-world-solid.svg", import.meta.url).pathname,
);

if (!sourcePath) {
  throw new Error(
    "Usage: node scripts/generate-travel-map-base.mjs /path/to/ne_110m_admin_0_countries.geojson [output.svg]",
  );
}

const geojson = JSON.parse(await readFile(resolve(sourcePath), "utf8"));

function format(value) {
  return Number(value.toFixed(1)).toString();
}

function project([longitude, latitude]) {
  return [
    ((longitude + 180) / 360) * 800,
    ((90 - latitude) / 180) * 400,
  ];
}

function ringPath(ring) {
  return ring.map((coordinate, index) => {
    const [x, y] = project(coordinate);
    return `${index === 0 ? "M" : "L"}${format(x)} ${format(y)}`;
  }).join("") + "Z";
}

const pathData = geojson.features
  .filter((feature) => feature.properties?.CONTINENT !== "Antarctica")
  .flatMap(({ geometry }) => {
    if (!geometry) return [];
    if (geometry.type === "Polygon") return [geometry.coordinates];
    if (geometry.type === "MultiPolygon") return geometry.coordinates;
    return [];
  })
  .flatMap((polygon) => polygon.map(ringPath))
  .join("");

const svg = [
  "<!-- Natural Earth 1:110m public-domain geography; equirectangular solid silhouette. -->",
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400" role="presentation">',
  `  <path d="${pathData}" fill="#667085" fill-rule="evenodd"/>`,
  "</svg>",
  "",
].join("\n");

await writeFile(outputPath, svg, "utf8");
console.log(`Generated solid world silhouette at ${outputPath}`);
