import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createTravelData, serializeTravelData } from "./lib/travel-data.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inputPath = resolve(process.argv[2] ?? resolve(root, "data/private/flighty.csv"));
const catalogPath = resolve(root, "scripts/data/airports.iata.v1.json");
const outputPath = resolve(root, "app/data/travel.generated.json");

const [flightyCsv, catalogJson] = await Promise.all([
  readFile(inputPath, "utf8"),
  readFile(catalogPath, "utf8"),
]);
const travelData = createTravelData(flightyCsv, JSON.parse(catalogJson));

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, serializeTravelData(travelData));

console.log(
  `Wrote ${travelData.routes.reduce((total, route) => total + route.count, 0)} flights, ${travelData.counts.airports} airports, and ${travelData.counts.routes} routes to ${outputPath}`,
);
