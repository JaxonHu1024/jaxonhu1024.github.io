import { AIRPORT_CATALOG_FIELDS } from "./airport-schema.mjs";
import { indexRequiredFields, selectCsvRows } from "./csv-table.mjs";

export const FLIGHTY_FIELD_ALLOWLIST = Object.freeze([
  "Date",
  "From",
  "To",
  "Canceled",
  "Diverted To",
]);

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function normalizeIata(value, rowNumber, label) {
  const iata = String(value ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{3}$/.test(iata)) {
    throw new Error(`Invalid ${label} IATA code at CSV row ${rowNumber}`);
  }
  return iata;
}

function parseCanceled(value, rowNumber) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "true" || normalized === "yes" || normalized === "1") return true;
  if (normalized === "false" || normalized === "no" || normalized === "0" || normalized === "") {
    return false;
  }
  throw new Error(`Invalid Canceled value at CSV row ${rowNumber}`);
}

function parseFlightDate(value, rowNumber) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) throw new Error(`Invalid Flighty date at CSV row ${rowNumber}`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1900 ||
    year > 2200 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid Flighty date at CSV row ${rowNumber}`);
  }
  return date;
}

function decodeAirportCatalog(catalog) {
  if (!catalog || catalog.schemaVersion !== 1 || !Array.isArray(catalog.fields)) {
    throw new Error("Unsupported airport catalog schema");
  }
  if (!Array.isArray(catalog.airports)) {
    throw new Error("Airport catalog is missing airports");
  }

  const fieldIndexes = indexRequiredFields(
    catalog.fields,
    AIRPORT_CATALOG_FIELDS,
    "Airport catalog",
  );
  const airports = new Map();

  for (const [catalogIndex, values] of catalog.airports.entries()) {
    if (!Array.isArray(values) || values.length !== catalog.fields.length) {
      throw new Error(`Invalid airport catalog row ${catalogIndex + 1}`);
    }

    const read = (fieldName) => values[fieldIndexes.get(fieldName)];
    const iata = String(read("iata") ?? "").trim().toUpperCase();
    const name = String(read("name") ?? "").trim();
    const city = String(read("city") ?? "").trim() || name;
    const country = String(read("country") ?? "").trim();
    const countryCode = String(read("countryCode") ?? "").trim().toUpperCase();
    const continent = String(read("continent") ?? "").trim().toUpperCase();
    const lat = Number(read("lat"));
    const lng = Number(read("lng"));

    if (!/^[A-Z0-9]{3}$/.test(iata) || !name || !country || !countryCode || !continent) {
      throw new Error(`Invalid airport catalog metadata at row ${catalogIndex + 1}`);
    }
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      throw new Error(`Invalid airport latitude for ${iata}`);
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      throw new Error(`Invalid airport longitude for ${iata}`);
    }
    if (airports.has(iata)) {
      throw new Error(`Duplicate airport catalog IATA code ${iata}`);
    }

    airports.set(iata, { iata, name, city, country, countryCode, continent, lat, lng });
  }

  return airports;
}

function canonicalRoute(from, to) {
  return compareText(from, to) <= 0 ? [from, to] : [to, from];
}

export function createTravelData(csvText, catalog, { asOf = new Date() } = {}) {
  const rows = selectCsvRows(csvText, FLIGHTY_FIELD_ALLOWLIST, "Flighty CSV");
  const airportIndex = decodeAirportCatalog(catalog);
  const flights = [];
  const asOfDate = asOf instanceof Date ? asOf : new Date(asOf);

  if (Number.isNaN(asOfDate.getTime())) {
    throw new Error("Invalid travel-data as-of date");
  }

  for (const { rowNumber, values } of rows) {
    const read = (fieldName) => values[fieldName];
    if (parseCanceled(read("Canceled"), rowNumber)) continue;

    const flightDate = parseFlightDate(read("Date"), rowNumber);
    if (flightDate.getTime() > asOfDate.getTime()) continue;

    const from = normalizeIata(read("From"), rowNumber, "departure");
    const divertedTo = String(read("Diverted To") ?? "").trim();
    const to = normalizeIata(divertedTo || read("To"), rowNumber, "arrival");

    if (!airportIndex.has(from)) {
      throw new Error(`Unknown IATA code ${from} at CSV row ${rowNumber}`);
    }
    if (!airportIndex.has(to)) {
      throw new Error(`Unknown IATA code ${to} at CSV row ${rowNumber}`);
    }

    flights.push({ from, to });
  }

  if (flights.length === 0) {
    throw new Error("Flighty CSV contains no completed, non-canceled flights");
  }

  const visits = new Map();
  const routes = new Map();
  const usedIata = new Set();
  const addVisit = (iata) => visits.set(iata, (visits.get(iata) ?? 0) + 1);

  for (const flight of flights) {
    const [routeFrom, routeTo] = canonicalRoute(flight.from, flight.to);
    const routeKey = `${routeFrom}\u0000${routeTo}`;
    const forwardDirection = flight.from === routeFrom && flight.to === routeTo;
    const existingRoute = routes.get(routeKey);

    usedIata.add(flight.from);
    usedIata.add(flight.to);
    addVisit(flight.from);
    addVisit(flight.to);
    if (existingRoute) {
      existingRoute.count += 1;
      existingRoute.seenForward ||= forwardDirection;
      existingRoute.seenReverse ||= !forwardDirection;
    } else {
      routes.set(routeKey, {
        from: routeFrom,
        to: routeTo,
        count: 1,
        seenForward: forwardDirection,
        seenReverse: !forwardDirection,
      });
    }
  }

  const airports = [...usedIata]
    .sort(compareText)
    .map((iata) => {
      const { city, country, countryCode, lat, lng } = airportIndex.get(iata);
      return { iata, city, country, countryCode, lat, lng, visits: visits.get(iata) };
    });
  const routeList = [...routes.values()]
    .map(({ from, to, count, seenForward, seenReverse }) => ({
      from,
      to,
      count,
      bidirectional: seenForward && seenReverse,
    }))
    .sort((left, right) => {
      const fromOrder = compareText(left.from, right.from);
      return fromOrder || compareText(left.to, right.to);
    });
  const countries = new Set(airports.map(({ countryCode }) => countryCode));

  return {
    schemaVersion: 2,
    counts: {
      airports: airports.length,
      countries: countries.size,
      routes: routeList.length,
    },
    airports,
    routes: routeList,
  };
}

export function serializeTravelData(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}
