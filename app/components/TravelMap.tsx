"use client";

import { useEffect, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import travelDataJson from "../data/travel.generated.json";
import { SignalHeading } from "./SignalHeading";

type TravelAirport = {
  city: string;
  country: string;
  countryCode: string;
  iata: string;
  lat: number;
  lng: number;
  visits: number;
};

type TravelRoute = {
  bidirectional: boolean;
  count: number;
  from: string;
  to: string;
};

type TravelData = {
  airports: TravelAirport[];
  counts: {
    airports: number;
    countries: number;
    routes: number;
  };
  routes: TravelRoute[];
  schemaVersion: number;
};

type ProjectedPoint = {
  x: number;
  y: number;
};

type CountrySignal = {
  code: string;
  name: string;
  visits: number;
};

const travelData: TravelData = travelDataJson;
const MAP_WIDTH = 800;
const MAP_HEIGHT = 400;
const MOBILE_MAP_ASPECT_RATIO = 6 / 5;
const MIN_FOCUSED_VIEW_WIDTH = 216;
const MIN_FOCUSED_VIEW_HEIGHT = 180;
const MOBILE_MAP_QUERY = "(max-width: 600px)";
const WORLD_VIEW_BOX = `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`;
const COUNTRY_DISPLAY_ORDER = ["CN", "HK", "SG", "TH", "AU", "MY", "KR", "JP", "PH"];
const subscribeToHydration = () => () => undefined;
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

function projectPoint({ lat, lng }: TravelAirport): ProjectedPoint {
  return {
    x: ((lng + 180) / 360) * MAP_WIDTH,
    y: ((90 - lat) / 180) * MAP_HEIGHT,
  };
}

function createLinePath(start: ProjectedPoint, end: ProjectedPoint) {
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} L ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function createRoutePaths(start: ProjectedPoint, end: ProjectedPoint) {
  const horizontalDistance = end.x - start.x;

  if (Math.abs(horizontalDistance) <= MAP_WIDTH / 2) {
    return [createLinePath(start, end)];
  }

  if (horizontalDistance < 0) {
    return [
      createLinePath(start, { ...end, x: end.x + MAP_WIDTH }),
      createLinePath({ ...start, x: start.x - MAP_WIDTH }, end),
    ];
  }

  return [
    createLinePath(start, { ...end, x: end.x - MAP_WIDTH }),
    createLinePath({ ...start, x: start.x + MAP_WIDTH }, end),
  ];
}

function clampCamera(start: number, size: number, limit: number) {
  return Math.min(Math.max(0, start), Math.max(0, limit - size));
}

function clampValue(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function createFocusedViewBox(airports: TravelAirport[]) {
  if (airports.length === 0) return WORLD_VIEW_BOX;

  const points = airports.map(projectPoint);
  const minX = Math.min(...points.map(({ x }) => x));
  const maxX = Math.max(...points.map(({ x }) => x));
  const minY = Math.min(...points.map(({ y }) => y));
  const maxY = Math.max(...points.map(({ y }) => y));
  const horizontalSpan = maxX - minX;
  const verticalSpan = maxY - minY;

  // A wide or near-global dataset is clearer in the world view and avoids
  // ambiguous wrapping around the international date line.
  if (horizontalSpan > MAP_WIDTH * .7 || verticalSpan > MAP_HEIGHT * .8) {
    return WORLD_VIEW_BOX;
  }

  const padding = clampValue(Math.max(horizontalSpan, verticalSpan) * .12, 16, 48);
  let width = Math.max(MIN_FOCUSED_VIEW_WIDTH, horizontalSpan + padding * 2);
  let height = Math.max(MIN_FOCUSED_VIEW_HEIGHT, verticalSpan + padding * 2);

  if (width / height < MOBILE_MAP_ASPECT_RATIO) {
    width = height * MOBILE_MAP_ASPECT_RATIO;
  } else {
    height = width / MOBILE_MAP_ASPECT_RATIO;
  }

  if (width > MAP_WIDTH || height > MAP_HEIGHT) return WORLD_VIEW_BOX;

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const x = clampCamera(centerX - width / 2, width, MAP_WIDTH);
  const y = clampCamera(centerY - height / 2, height, MAP_HEIGHT);

  return [x, y, width, height].map((value) => value.toFixed(2)).join(" ");
}

function countryFlag(countryCode: string) {
  if (!/^[A-Z]{2}$/.test(countryCode)) return "•";

  return [...countryCode]
    .map((character) => String.fromCodePoint(127397 + character.charCodeAt(0)))
    .join("");
}

const airportByIata = new Map(travelData.airports.map((airport) => [airport.iata, airport]));
const bidirectionalCorridors = travelData.routes.filter((route) => route.bidirectional).length;
const focusedViewBox = createFocusedViewBox(travelData.airports);
const hubCodes = new Set(
  [...travelData.airports]
    .sort((left, right) => right.visits - left.visits || left.iata.localeCompare(right.iata))
    .slice(0, 4)
    .map((airport) => airport.iata),
);
const countrySignals = [...travelData.airports.reduce((countries, airport) => {
  const existing = countries.get(airport.countryCode);
  countries.set(airport.countryCode, {
    code: airport.countryCode,
    name: airport.country,
    visits: (existing?.visits ?? 0) + airport.visits,
  });
  return countries;
}, new Map<string, CountrySignal>()).values()]
  .sort((left, right) => {
    const leftOrder = COUNTRY_DISPLAY_ORDER.indexOf(left.code);
    const rightOrder = COUNTRY_DISPLAY_ORDER.indexOf(right.code);
    if (leftOrder !== -1 || rightOrder !== -1) {
      return (leftOrder === -1 ? Number.POSITIVE_INFINITY : leftOrder)
        - (rightOrder === -1 ? Number.POSITIVE_INFINITY : rightOrder);
    }
    return right.visits - left.visits || left.name.localeCompare(right.name);
  });

export function TravelMap() {
  const isHydrated = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );
  const [isMobileMap, setIsMobileMap] = useState<boolean | null>(null);
  const [selectedCountryCode, setSelectedCountryCode] = useState<string | null>(null);
  const selectedCountry = countrySignals.find(({ code }) => code === selectedCountryCode) ?? null;
  const isMapReady = isHydrated && isMobileMap !== null;

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_MAP_QUERY);
    const syncMapView = () => setIsMobileMap(mediaQuery.matches);

    syncMapView();
    mediaQuery.addEventListener("change", syncMapView);
    return () => mediaQuery.removeEventListener("change", syncMapView);
  }, []);

  const toggleCountry = (countryCode: string) => {
    setSelectedCountryCode((current) => current === countryCode ? null : countryCode);
  };

  const handleDockKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || selectedCountryCode === null) return;
    event.preventDefault();
    setSelectedCountryCode(null);
  };

  return (
    <figure
      className="about-travel"
      aria-labelledby="travel-map-title"
      data-filter-active={selectedCountryCode === null ? "false" : "true"}
      data-map-ready={isMapReady ? "true" : "false"}
    >
      <figcaption className="travel-map-header">
        <SignalHeading className="travel-map-kicker">
          FLIGHT.FOOTPRINT
        </SignalHeading>
        <h3 id="travel-map-title">Places leave a signal.</h3>
        <p>
          Routes I&apos;ve flown—and the places that keep widening how I see,
          learn, and build.
        </p>
      </figcaption>

      {travelData.airports.length > 0 && travelData.routes.length > 0 ? (
        <div className="travel-map-stage">
          <div className="travel-map-viewport">
            <span className="travel-map-loading" role="status">
              ACQUIRING MAP SIGNAL
            </span>
            <svg
              className="travel-map-canvas"
              data-map-view={isMobileMap === true && focusedViewBox !== WORLD_VIEW_BOX ? "focus" : "world"}
              id="travel-map-canvas"
              viewBox={isMobileMap === true ? focusedViewBox : WORLD_VIEW_BOX}
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-labelledby="travel-map-svg-title travel-map-svg-description"
            >
              <title id="travel-map-svg-title">Jaxon&apos;s aggregated flight footprint</title>
              <desc id="travel-map-svg-description">
                {`${travelData.counts.routes} unique flight corridors connect ${travelData.counts.airports} airports across ${travelData.counts.countries} countries and regions. ${bidirectionalCorridors} corridors include completed flights in both directions.`}
              </desc>
              <image
                className="travel-map-land"
                href="/assets/travel-world-solid.svg"
                width={MAP_WIDTH}
                height={MAP_HEIGHT}
                aria-hidden="true"
              />

              <g className="travel-map-routes" aria-hidden="true">
                {travelData.routes.map((route) => {
                  const startAirport = airportByIata.get(route.from);
                  const endAirport = airportByIata.get(route.to);
                  if (!startAirport || !endAirport) return null;

                  const routeKey = `${route.from}-${route.to}`;
                  const strokeWidth = Math.min(1.7, .82 + Math.log2(route.count + 1) * .2);
                  const routeMatchesSelection = selectedCountryCode === null
                    || startAirport.countryCode === selectedCountryCode
                    || endAirport.countryCode === selectedCountryCode;

                  return (
                    <g
                      className="travel-map-route"
                      data-emphasis={selectedCountryCode === null
                        ? "idle"
                        : routeMatchesSelection ? "active" : "muted"}
                      data-route-direction={route.bidirectional ? "both" : "one-way"}
                      data-route-key={routeKey}
                      key={routeKey}
                    >
                      {createRoutePaths(projectPoint(startAirport), projectPoint(endAirport)).map(
                        (path, pathIndex) => (
                          <path
                            className="travel-map-route-path"
                            d={path}
                            fill="none"
                            key={pathIndex}
                            strokeWidth={strokeWidth}
                            vectorEffect="non-scaling-stroke"
                          />
                        ),
                      )}
                    </g>
                  );
                })}
              </g>

              <g className="travel-map-airports" aria-hidden="true">
                {travelData.airports.map((airport) => {
                  const point = projectPoint(airport);
                  const isHub = hubCodes.has(airport.iata);
                  const airportMatchesSelection = selectedCountryCode === null
                    || airport.countryCode === selectedCountryCode;

                  return (
                    <g
                      className="travel-map-airport"
                      data-emphasis={selectedCountryCode === null
                        ? "idle"
                        : airportMatchesSelection ? "active" : "muted"}
                      data-hub={isHub ? "true" : "false"}
                      key={airport.iata}
                      transform={`translate(${point.x.toFixed(2)} ${point.y.toFixed(2)})`}
                    >
                      <title>{`${airport.city} · ${airport.iata}`}</title>
                      <circle className="travel-map-airport-halo" r={isHub ? 6.8 : 5.6} />
                      <circle className="travel-map-airport-point" r={isHub ? 3.9 : 3.1} />
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>

          <div className="travel-map-dock" onKeyDown={handleDockKeyDown}>
            <div className="travel-map-dock-status">
              <dl
                className="travel-map-stats"
                aria-label="Visited countries and regions summary"
              >
                <div>
                  <dt>Countries / regions</dt>
                  <dd>
                    {travelData.counts.countries < 10 ? (
                      <span className="travel-map-stat-leading-zero" aria-hidden="true">0</span>
                    ) : null}
                    {travelData.counts.countries}
                  </dd>
                </div>
              </dl>
              <p className="travel-map-filter-status" aria-live="polite" aria-atomic="true">
                <span>Map filter</span>
                <strong>{selectedCountry?.name ?? "All signals"}</strong>
              </p>
            </div>

            <div className="travel-map-flags-scroll">
              <ul
                className="travel-map-flags"
                aria-label="Filter flight footprint by country or region"
              >
                {countrySignals.map((country) => {
                  const isSelected = country.code === selectedCountryCode;

                  return (
                    <li
                      data-country-code={country.code}
                      data-selected={isSelected ? "true" : "false"}
                      key={country.code}
                    >
                      <button
                        className="travel-map-flag-button"
                        type="button"
                        aria-controls="travel-map-canvas"
                        aria-disabled={!isHydrated}
                        aria-pressed={isSelected}
                        disabled={!isHydrated}
                        onClick={() => toggleCountry(country.code)}
                      >
                        <span className="travel-map-flag-icon" aria-hidden="true">
                          {countryFlag(country.code)}
                        </span>
                        <span className="travel-map-flag-tooltip" aria-hidden="true">
                          {country.name}
                        </span>
                        <span className="sr-only">{country.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <p className="sr-only">
            Flighty export aggregated at build time; exact itinerary details are not published.
          </p>
        </div>
      ) : (
        <div className="travel-map-empty" role="status">
          <p>TRACE UNAVAILABLE</p>
          <span>Sync a Flighty export to acquire the next travel signal.</span>
        </div>
      )}
    </figure>
  );
}
