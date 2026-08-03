import { AIRPORT_CATALOG_FIELDS } from "./airport-schema.mjs";
import { indexRequiredFields, selectCsvRows } from "./csv-table.mjs";

export const FLIGHTY_FIELD_ALLOWLIST = Object.freeze([
  "Date",
  "From",
  "To",
  "Canceled",
  "Diverted To",
]);

const EARTH_RADIUS_KM = 6371.0088;

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

function greatCircleDistanceKm(from, to) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(to.lat - from.lat);
  const longitudeDelta = toRadians(to.lng - from.lng);
  const fromLatitude = toRadians(from.lat);
  const toLatitude = toRadians(to.lat);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(haversine)));
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

    flights.push({ from, to, year: flightDate.getUTCFullYear() });
  }

  if (flights.length === 0) {
    throw new Error("Flighty CSV contains no completed, non-canceled flights");
  }

  const visits = new Map();
  const routes = new Map();
  const usedIata = new Set();
  let firstYear = Number.POSITIVE_INFINITY;
  let lastYear = Number.NEGATIVE_INFINITY;
  let totalDistanceKm = 0;

  const addVisit = (iata) => visits.set(iata, (visits.get(iata) ?? 0) + 1);

  for (const flight of flights) {
    const fromAirport = airportIndex.get(flight.from);
    const toAirport = airportIndex.get(flight.to);
    const [routeFrom, routeTo] = canonicalRoute(flight.from, flight.to);
    const routeKey = `${routeFrom}\u0000${routeTo}`;
    const forwardDirection = flight.from === routeFrom && flight.to === routeTo;
    const distanceKm = greatCircleDistanceKm(fromAirport, toAirport);
    const existingRoute = routes.get(routeKey);

    usedIata.add(flight.from);
    usedIata.add(flight.to);
    addVisit(flight.from);
    addVisit(flight.to);
    firstYear = Math.min(firstYear, flight.year);
    lastYear = Math.max(lastYear, flight.year);
    totalDistanceKm += distanceKm;

    if (existingRoute) {
      existingRoute.count += 1;
      existingRoute.firstYear = Math.min(existingRoute.firstYear, flight.year);
      existingRoute.lastYear = Math.max(existingRoute.lastYear, flight.year);
      existingRoute.seenForward ||= forwardDirection;
      existingRoute.seenReverse ||= !forwardDirection;
    } else {
      routes.set(routeKey, {
        from: routeFrom,
        to: routeTo,
        count: 1,
        firstYear: flight.year,
        lastYear: flight.year,
        distanceKm: Math.round(distanceKm),
        seenForward: forwardDirection,
        seenReverse: !forwardDirection,
      });
    }
  }

  const airports = [...usedIata]
    .sort(compareText)
    .map((iata) => ({ ...airportIndex.get(iata), visits: visits.get(iata) }));
  const routeList = [...routes.values()]
    .map(({ seenForward, seenReverse, ...route }) => ({
      ...route,
      bidirectional: seenForward && seenReverse,
    }))
    .sort((left, right) => {
      const fromOrder = compareText(left.from, right.from);
      return fromOrder || compareText(left.to, right.to);
    });
  const cities = new Set(airports.map(({ city, countryCode }) => `${countryCode}\u0000${city}`));
  const countries = new Set(airports.map(({ countryCode }) => countryCode));
  const continents = new Set(airports.map(({ continent }) => continent));

  return {
    schemaVersion: 1,
    source: {
      flightData: "Flighty CSV",
      airportData: "OurAirports",
      rowCount: flights.length,
    },
    yearRange: [firstYear, lastYear],
    counts: {
      flights: flights.length,
      airports: airports.length,
      cities: cities.size,
      countries: countries.size,
      continents: continents.size,
      routes: routeList.length,
    },
    totalDistanceKm: Math.round(totalDistanceKm),
    airports,
    routes: routeList,
  };
}

export function serializeTravelData(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}
