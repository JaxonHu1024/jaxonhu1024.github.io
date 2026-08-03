import travelDataJson from "../data/travel.generated.json";

type TravelAirport = {
  city: string;
  continent: string;
  country: string;
  countryCode: string;
  iata: string;
  lat: number;
  lng: number;
  name: string;
  visits: number;
};

type TravelRoute = {
  bidirectional: boolean;
  count: number;
  distanceKm: number;
  firstYear: number;
  from: string;
  lastYear: number;
  to: string;
};

type TravelData = {
  airports: TravelAirport[];
  counts: {
    airports: number;
    cities: number;
    continents: number;
    countries: number;
    flights: number;
    routes: number;
  };
  routes: TravelRoute[];
  schemaVersion: number;
  totalDistanceKm: number;
  yearRange: [number, number];
};

type ProjectedPoint = {
  x: number;
  y: number;
};

const travelData = travelDataJson as unknown as TravelData;
const MAP_WIDTH = 800;
const MAP_HEIGHT = 400;
const COUNTRY_DISPLAY_ORDER = ["CN", "HK", "SG", "TH", "AU", "MY", "KR", "JP", "PH"];

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

function formatDistance(distance: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(distance);
}

function countryFlag(countryCode: string) {
  if (!/^[A-Z]{2}$/.test(countryCode)) return "•";

  return [...countryCode]
    .map((character) => String.fromCodePoint(127397 + character.charCodeAt(0)))
    .join("");
}

export function TravelMap() {
  const airportByIata = new Map(travelData.airports.map((airport) => [airport.iata, airport]));
  const bidirectionalCorridors = travelData.routes
    .filter((route) => route.bidirectional).length;
  const hubCodes = new Set(
    [...travelData.airports]
      .sort((left, right) => right.visits - left.visits || left.iata.localeCompare(right.iata))
      .slice(0, 4)
      .map((airport) => airport.iata),
  );
  const locationSummary = travelData.airports
    .map((airport) => `${airport.city} (${airport.iata})`)
    .join(", ");
  const countrySignals = [...travelData.airports.reduce((countries, airport) => {
    const existing = countries.get(airport.countryCode);
    countries.set(airport.countryCode, {
      code: airport.countryCode,
      name: airport.country,
      visits: (existing?.visits ?? 0) + airport.visits,
    });
    return countries;
  }, new Map<string, { code: string; name: string; visits: number }>()).values()]
    .sort((left, right) => {
      const leftOrder = COUNTRY_DISPLAY_ORDER.indexOf(left.code);
      const rightOrder = COUNTRY_DISPLAY_ORDER.indexOf(right.code);
      if (leftOrder !== -1 || rightOrder !== -1) {
        return (leftOrder === -1 ? Number.POSITIVE_INFINITY : leftOrder)
          - (rightOrder === -1 ? Number.POSITIVE_INFINITY : rightOrder);
      }
      return right.visits - left.visits || left.name.localeCompare(right.name);
    });

  return (
    <figure className="about-travel" aria-labelledby="travel-map-title">
      <figcaption className="travel-map-header">
        <p className="travel-map-kicker">FLIGHT.FOOTPRINT</p>
        <h3 id="travel-map-title">Places leave a signal.</h3>
        <p>
          Routes I&apos;ve flown—and the places that keep widening how I see,
          learn, and build.
        </p>
      </figcaption>

      {travelData.airports.length > 0 && travelData.routes.length > 0 ? (
        <div className="travel-map-stage">
          <div className="travel-map-viewport">
            <svg
              className="travel-map-canvas"
              viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
              preserveAspectRatio="xMaxYMid slice"
              role="img"
              aria-labelledby="travel-map-svg-title travel-map-svg-description"
            >
              <title id="travel-map-svg-title">Jaxon&apos;s aggregated flight footprint</title>
              <desc id="travel-map-svg-description">
                {`${travelData.counts.routes} unique flight corridors connect ${travelData.counts.airports} airports across ${travelData.counts.countries} countries and regions. ${bidirectionalCorridors} corridors include completed flights in both directions. Locations include ${locationSummary}.`}
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
                  const strokeWidth = Math.min(1.55, .72 + Math.log2(route.count + 1) * .18);

                  return (
                    <g
                      className="travel-map-route"
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

                  return (
                    <g
                      className="travel-map-airport"
                      data-hub={isHub ? "true" : "false"}
                      key={airport.iata}
                      transform={`translate(${point.x.toFixed(2)} ${point.y.toFixed(2)})`}
                    >
                      <title>{`${airport.city} · ${airport.iata}`}</title>
                      <circle className="travel-map-airport-point" r={isHub ? 3.7 : 2.9} />
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>

          <ul className="travel-map-flags" aria-label="Visited countries and regions">
            {countrySignals.map((country) => (
              <li data-country-code={country.code} key={country.code}>
                <span className="travel-map-flag-icon" aria-hidden="true">
                  {countryFlag(country.code)}
                </span>
                <span className="travel-map-flag-tooltip" aria-hidden="true">
                  {country.name}
                </span>
                <span className="sr-only">{country.name}</span>
              </li>
            ))}
          </ul>

          <div className="travel-map-summary">
            <dl className="travel-map-stats" aria-label="Flight footprint summary">
              <div>
                <dt>Flight segments</dt>
                <dd>{travelData.counts.flights}</dd>
              </div>
              <div>
                <dt>Airports reached</dt>
                <dd>{travelData.counts.airports}</dd>
              </div>
              <div>
                <dt>Countries / regions</dt>
                <dd>{travelData.counts.countries}</dd>
              </div>
            </dl>
            <p
              className="travel-map-distance"
              aria-label={`Approximately ${formatDistance(travelData.totalDistanceKm)} kilometers flown`}
            >
              <span aria-hidden="true">≈</span>
              <strong>{formatDistance(travelData.totalDistanceKm)}</strong>
              <span>KM</span>
            </p>
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
