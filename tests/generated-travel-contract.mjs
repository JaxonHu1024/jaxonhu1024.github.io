import { readFileSync } from "node:fs";

export const generatedTravelData = JSON.parse(readFileSync(
  new URL("../app/data/travel.generated.json", import.meta.url),
  "utf8",
));

export const generatedBidirectionalCorridors = generatedTravelData.routes
  .filter(({ bidirectional }) => bidirectional).length;

export const generatedCountryCodes = [...new Set(
  generatedTravelData.airports.map(({ countryCode }) => countryCode),
)].sort();
