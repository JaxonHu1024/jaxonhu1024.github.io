import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseRfc4180 } from "../scripts/lib/rfc4180.mjs";
import {
  createTravelData,
  FLIGHTY_FIELD_ALLOWLIST,
  serializeTravelData,
} from "../scripts/lib/travel-data.mjs";

const CATALOG = {
  schemaVersion: 1,
  catalogVersion: "test-v1",
  fields: ["iata", "name", "city", "country", "countryCode", "continent", "lat", "lng"],
  airports: [
    ["AAA", "Alpha Airport", "Alpha", "Exampleland", "EX", "AS", 10, 20],
    ["BBB", "Bravo Airport", "Bravo", "Exampleland", "EX", "AS", 15, 25],
    ["CCC", "Charlie Airport", "Charlie", "Otherland", "OT", "EU", 40, -5],
  ],
};
const TEST_OPTIONS = { asOf: "2025-01-01T23:59:59.999Z" };

const HEADER = [
  "Date",
  "Airline",
  "Flight",
  "From",
  "To",
  "Dep Gate",
  "Arr Gate",
  "Canceled",
  "Diverted To",
  "PNR",
  "Seat",
  "Notes",
  "Flight Flighty ID",
];

function csvRow(values) {
  return values
    .map((value) => {
      const text = String(value ?? "");
      return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    })
    .join(",");
}

function flightyCsv(rows, newline = "\r\n") {
  return `${[csvRow(HEADER), ...rows.map(csvRow)].join(newline)}${newline}`;
}

function walkKeys(value, keys = []) {
  if (Array.isArray(value)) {
    for (const item of value) walkKeys(item, keys);
    return keys;
  }

  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      keys.push(key);
      walkKeys(child, keys);
    }
  }

  return keys;
}

test("RFC 4180 parser handles BOM, CRLF, escaped quotes, commas, and embedded line breaks", () => {
  const parsed = parseRfc4180(
    '\uFEFFName,Note,Empty\r\n"Alpha, Beta","line one\r\nline two",\r\n"Quote","said ""hello""",end\r\n',
  );

  assert.deepEqual(parsed, [
    ["Name", "Note", "Empty"],
    ["Alpha, Beta", "line one\r\nline two", ""],
    ["Quote", 'said "hello"', "end"],
  ]);
});

test("Flighty import whitelists fields, removes canceled flights, and uses diversion destinations", () => {
  const csv = flightyCsv([
    [
      "2024-06-14",
      "SECRET_AIRLINE",
      "SECRET_FLIGHT_123",
      "AAA",
      "BBB",
      "SECRET_GATE_A",
      "SECRET_GATE_B",
      "false",
      "CCC",
      "SECRET_PNR",
      "SECRET_SEAT",
      "SECRET_NOTE",
      "SECRET_ID",
    ],
    [
      "2022-01-09",
      "SECRET_CANCELLED_AIRLINE",
      "SECRET_CANCELLED_FLIGHT",
      "AAA",
      "ZZZ",
      "",
      "",
      "true",
      "",
      "SECRET_CANCELLED_PNR",
      "",
      "",
      "SECRET_CANCELLED_ID",
    ],
  ]);

  const data = createTravelData(csv, CATALOG, TEST_OPTIONS);
  const serialized = serializeTravelData(data);

  assert.deepEqual(FLIGHTY_FIELD_ALLOWLIST, ["Date", "From", "To", "Canceled", "Diverted To"]);
  assert.deepEqual(data.counts, {
    flights: 1,
    airports: 2,
    cities: 2,
    countries: 2,
    continents: 2,
    routes: 1,
  });
  assert.deepEqual(data.yearRange, [2024, 2024]);
  assert.deepEqual(data.routes, [
    {
      from: "AAA",
      to: "CCC",
      count: 1,
      firstYear: 2024,
      lastYear: 2024,
      distanceKm: 4149,
      bidirectional: false,
    },
  ]);
  assert.equal(data.source.rowCount, 1);
  assert.ok(data.totalDistanceKm > 0);
  assert.doesNotMatch(
    serialized,
    /SECRET_|2024-06-14|2022-01-09|flighty id|pnr|seat|gate|notes?|flight number/i,
  );
  assert.deepEqual(
    [...new Set(walkKeys(data))].filter((key) =>
      /date|pnr|seat|gate|note|flighty|airline|tail|terminal|cabin|reason|actual|scheduled/i.test(key),
    ),
    [],
  );
});

test("Flighty aggregation is deterministic across source row order", () => {
  const first = [
    ["2021-03-01", "", "", "BBB", "AAA", "", "", "false", "", "", "", "", ""],
    ["2019-08-20", "", "", "CCC", "BBB", "", "", "false", "", "", "", "", ""],
    ["2024-11-02", "", "", "AAA", "BBB", "", "", "false", "", "", "", "", ""],
  ];
  const second = [...first].reverse();

  const firstOutput = serializeTravelData(createTravelData(flightyCsv(first), CATALOG, TEST_OPTIONS));
  const secondOutput = serializeTravelData(createTravelData(flightyCsv(second), CATALOG, TEST_OPTIONS));

  assert.equal(firstOutput, secondOutput);
  assert.deepEqual(JSON.parse(firstOutput).routes, [
    {
      from: "AAA",
      to: "BBB",
      count: 2,
      firstYear: 2021,
      lastYear: 2024,
      distanceKm: 777,
      bidirectional: true,
    },
    {
      from: "BBB",
      to: "CCC",
      count: 1,
      firstYear: 2019,
      lastYear: 2019,
      distanceKm: 4023,
      bidirectional: false,
    },
  ]);
});

test("Flighty import fails closed for unknown IATA codes", () => {
  const csv = flightyCsv([
    ["2024-01-01", "", "", "AAA", "ZZZ", "", "", "false", "", "", "", "", ""],
  ]);

  assert.throws(
    () => createTravelData(csv, CATALOG, TEST_OPTIONS),
    /Unknown IATA code ZZZ at CSV row 2/,
  );
});

test("Flighty import rejects calendar-invalid dates", () => {
  const csv = flightyCsv([
    ["2024-02-30", "", "", "AAA", "BBB", "", "", "false", "", "", "", "", ""],
  ]);

  assert.throws(
    () => createTravelData(csv, CATALOG, TEST_OPTIONS),
    /Invalid Flighty date at CSV row 2/,
  );
});

test("Flighty import excludes future itinerary rows from the public footprint", () => {
  const csv = flightyCsv([
    ["2024-12-31", "", "", "AAA", "BBB", "", "", "false", "", "", "", "", ""],
    ["2025-01-02", "", "", "AAA", "CCC", "", "", "false", "", "", "", "", ""],
  ]);

  const data = createTravelData(csv, CATALOG, TEST_OPTIONS);

  assert.equal(data.counts.flights, 1);
  assert.equal(data.source.rowCount, 1);
  assert.deepEqual(data.yearRange, [2024, 2024]);
  assert.deepEqual(data.airports.map(({ iata }) => iata), ["AAA", "BBB"]);
  assert.deepEqual(data.routes.map(({ from, to }) => `${from}:${to}`), ["AAA:BBB"]);
});

test("checked-in generated travel data keeps a self-consistent privacy-safe contract", async () => {
  const raw = await readFile(new URL("../app/data/travel.generated.json", import.meta.url), "utf8");
  const data = JSON.parse(raw);

  assert.equal(data.schemaVersion, 1);
  assert.equal(data.source.flightData, "Flighty CSV");
  assert.equal(data.source.airportData, "OurAirports");
  assert.ok(Number.isInteger(data.counts.flights) && data.counts.flights > 0);
  assert.equal(data.source.rowCount, data.counts.flights);
  assert.equal(data.airports.length, data.counts.airports);
  assert.equal(data.routes.length, data.counts.routes);
  assert.equal(data.routes.reduce((total, route) => total + route.count, 0), data.counts.flights);
  assert.equal(
    new Set(data.airports.map(({ city, countryCode }) => `${countryCode}\u0000${city}`)).size,
    data.counts.cities,
  );
  assert.equal(new Set(data.airports.map(({ countryCode }) => countryCode)).size, data.counts.countries);
  assert.equal(new Set(data.airports.map(({ continent }) => continent)).size, data.counts.continents);
  assert.ok(Number.isFinite(data.totalDistanceKm) && data.totalDistanceKm > 0);
  assert.equal(data.yearRange.length, 2);
  assert.ok(data.yearRange[0] <= data.yearRange[1]);
  assert.equal(data.routes.every((route) => (
    route.from < route.to
    && Number.isInteger(route.count)
    && route.count > 0
    && route.firstYear <= route.lastYear
    && typeof route.bidirectional === "boolean"
  )), true);
  assert.deepEqual(
    data.airports.map(({ iata }) => iata),
    [...data.airports.map(({ iata }) => iata)].sort(),
  );
  assert.deepEqual(
    data.routes.map(({ from, to }) => `${from}:${to}`),
    [...data.routes.map(({ from, to }) => `${from}:${to}`)].sort(),
  );
  assert.equal(
    new Set(data.routes.map(({ from, to }) => `${from}:${to}`)).size,
    data.routes.length,
  );
  assert.equal(raw, serializeTravelData(data));
  assert.doesNotMatch(
    raw,
    /\b\d{4}-\d{2}-\d{2}\b|sourceSha|fileName|filename|pnr|seat|gate|notes?|flighty id|flight number/i,
  );
});
