import { AIRPORT_CATALOG_FIELDS } from "./airport-schema.mjs";
import { selectCsvRows } from "./csv-table.mjs";

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function buildAirportCatalog(airportsCsv, countriesCsv, catalogVersion) {
  if (!catalogVersion || typeof catalogVersion !== "string") {
    throw new Error("Airport catalog version is required");
  }

  const countryRows = selectCsvRows(
    countriesCsv,
    ["code", "name", "continent"],
    "OurAirports countries CSV",
  );
  const countries = new Map(
    countryRows.map(({ values: country }) => [
      country.code.trim().toUpperCase(),
      { name: country.name.trim(), continent: country.continent.trim().toUpperCase() },
    ]),
  );
  const airportRows = selectCsvRows(
    airportsCsv,
    ["name", "latitude_deg", "longitude_deg", "continent", "iso_country", "municipality", "iata_code"],
    "OurAirports airports CSV",
  );
  const seenIata = new Set();
  const airports = [];

  for (const { rowNumber, values: airport } of airportRows) {
    const iata = airport.iata_code.trim().toUpperCase();
    if (!iata) continue;
    if (!/^[A-Z0-9]{3}$/.test(iata)) {
      throw new Error(`Invalid OurAirports IATA code at row ${rowNumber}`);
    }
    if (seenIata.has(iata)) {
      throw new Error(`Duplicate OurAirports IATA code ${iata}`);
    }

    const countryCode = airport.iso_country.trim().toUpperCase();
    const country = countries.get(countryCode);
    const name = airport.name.trim();
    const city = airport.municipality.trim() || name;
    const continent = airport.continent.trim().toUpperCase() || country?.continent;
    const lat = Number(airport.latitude_deg);
    const lng = Number(airport.longitude_deg);

    if (!country || !country.name || !continent || !name) {
      throw new Error(`Missing OurAirports metadata for ${iata}`);
    }
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      throw new Error(`Invalid OurAirports latitude for ${iata}`);
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      throw new Error(`Invalid OurAirports longitude for ${iata}`);
    }

    seenIata.add(iata);
    airports.push([iata, name, city, country.name, countryCode, continent, lat, lng]);
  }

  airports.sort((left, right) => compareText(left[0], right[0]));

  return {
    schemaVersion: 1,
    catalogVersion,
    sources: ["OurAirports airports.csv", "OurAirports countries.csv"],
    fields: AIRPORT_CATALOG_FIELDS,
    airportCount: airports.length,
    airports,
  };
}
