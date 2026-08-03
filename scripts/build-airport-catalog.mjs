import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildAirportCatalog } from "./lib/airport-catalog.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const airportsPath = resolve(process.argv[2] ?? resolve(root, "data/private/ourairports-airports.csv"));
const countriesPath = resolve(process.argv[3] ?? resolve(root, "data/private/ourairports-countries.csv"));
const catalogVersion = process.argv[4] ?? "ourairports-v1";
const outputPath = resolve(root, "scripts/data/airports.iata.v1.json");

const [airportsCsv, countriesCsv] = await Promise.all([
  readFile(airportsPath, "utf8"),
  readFile(countriesPath, "utf8"),
]);
const catalog = buildAirportCatalog(airportsCsv, countriesCsv, catalogVersion);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(catalog)}\n`);

console.log(`Wrote ${catalog.airportCount} IATA airports to ${outputPath}`);
