"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
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
const WIDE_MAP_ASPECT_RATIO = 3 / 2;
const MOBILE_MAP_ASPECT_RATIO = 6 / 5;
const MIN_FOCUSED_VIEW_WIDTH = 216;
const MIN_FOCUSED_VIEW_HEIGHT = 180;
const MOBILE_MAP_QUERY = "(max-width: 600px)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const DOCK_POINTER_QUERY = "(hover: hover) and (pointer: fine)";
const DOCK_INFLUENCE_DISTANCE_PX = 112;
const MOBILE_RAIL_SPEED_PX_PER_MS = .018;
const MOBILE_RAIL_EDGE_PAUSE_MS = 900;
const MOBILE_RAIL_INTERACTION_PAUSE_MS = 1_600;
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

function createFocusedViewBox(airports: TravelAirport[], aspectRatio: number) {
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

  if (width / height < aspectRatio) {
    width = height * aspectRatio;
  } else {
    height = width / aspectRatio;
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
const mobileFocusedViewBox = createFocusedViewBox(travelData.airports, MOBILE_MAP_ASPECT_RATIO);
const wideFocusedViewBox = createFocusedViewBox(travelData.airports, WIDE_MAP_ASPECT_RATIO);
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
  const filterRailRef = useRef<HTMLDivElement>(null);
  const selectedCountry = countrySignals.find(({ code }) => code === selectedCountryCode) ?? null;
  const isMapReady = isHydrated && isMobileMap !== null;
  const activeViewBox = isMobileMap === null
    ? WORLD_VIEW_BOX
    : isMobileMap ? mobileFocusedViewBox : wideFocusedViewBox;

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_MAP_QUERY);
    const syncMapView = () => setIsMobileMap(mediaQuery.matches);

    syncMapView();
    mediaQuery.addEventListener("change", syncMapView);
    return () => mediaQuery.removeEventListener("change", syncMapView);
  }, []);

  useEffect(() => {
    const rail = filterRailRef.current;
    if (!rail || !isHydrated || isMobileMap !== true) return;

    const automaticMotionQuery = window.matchMedia(DOCK_POINTER_QUERY);
    const reducedMotionQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    let animationFrame: number | null = null;
    let direction: 1 | -1 = 1;
    let focusWithin = false;
    let isVisible = false;
    let lastTimestamp = performance.now();
    let pointerDown = false;
    let pointerOver = false;
    let resumeAt = lastTimestamp + MOBILE_RAIL_EDGE_PAUSE_MS;
    let scrollPosition = rail.scrollLeft;

    const setMotionState = (
      state: "manual" | "paused" | "reduced" | "running" | "waiting",
    ) => {
      if (rail.dataset.railMotion !== state) rail.dataset.railMotion = state;
    };

    const pageCanAnimate = () => (
      document.visibilityState === "visible"
      && document.documentElement.dataset.pageActive !== "false"
      && automaticMotionQuery.matches
      && !reducedMotionQuery.matches
    );

    const interactionPaused = () => pointerDown || pointerOver || focusWithin;

    const queueFrame = () => {
      if (animationFrame === null && isVisible && pageCanAnimate()) {
        animationFrame = window.requestAnimationFrame(tick);
      }
    };

    const stopFrames = () => {
      if (animationFrame === null) return;
      window.cancelAnimationFrame(animationFrame);
      animationFrame = null;
    };

    const tick = (timestamp: number) => {
      animationFrame = null;
      const elapsed = Math.min(Math.max(timestamp - lastTimestamp, 0), 64);
      lastTimestamp = timestamp;
      const maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth);

      if (!isVisible || !pageCanAnimate() || maxScroll <= 1) {
        setMotionState(reducedMotionQuery.matches ? "reduced" : "paused");
        return;
      }

      if (interactionPaused()) {
        scrollPosition = rail.scrollLeft;
        setMotionState("paused");
      } else if (timestamp < resumeAt) {
        setMotionState("waiting");
      } else {
        if (Math.abs(rail.scrollLeft - scrollPosition) > 2) {
          scrollPosition = rail.scrollLeft;
        }
        const nextScroll = scrollPosition
          + elapsed * MOBILE_RAIL_SPEED_PX_PER_MS * direction;

        if (direction === 1 && nextScroll >= maxScroll - .5) {
          rail.scrollLeft = maxScroll;
          scrollPosition = maxScroll;
          direction = -1;
          resumeAt = timestamp + MOBILE_RAIL_EDGE_PAUSE_MS;
          setMotionState("waiting");
        } else if (direction === -1 && nextScroll <= .5) {
          rail.scrollLeft = 0;
          scrollPosition = 0;
          direction = 1;
          resumeAt = timestamp + MOBILE_RAIL_EDGE_PAUSE_MS;
          setMotionState("waiting");
        } else {
          rail.scrollLeft = nextScroll;
          scrollPosition = nextScroll;
          setMotionState("running");
        }
      }

      queueFrame();
    };

    const pauseForInteraction = () => {
      setMotionState(
        reducedMotionQuery.matches
          ? "reduced"
          : automaticMotionQuery.matches ? "paused" : "manual",
      );
    };

    const resumeAfterInteraction = () => {
      if (!automaticMotionQuery.matches || reducedMotionQuery.matches) {
        syncAnimation();
        return;
      }
      resumeAt = performance.now() + MOBILE_RAIL_INTERACTION_PAUSE_MS;
      lastTimestamp = performance.now();
      setMotionState("waiting");
      queueFrame();
    };

    const handlePointerEnter = () => {
      pointerOver = true;
      pauseForInteraction();
    };
    const handlePointerLeave = () => {
      pointerOver = false;
      if (!interactionPaused()) resumeAfterInteraction();
    };
    const handlePointerDown = () => {
      pointerDown = true;
      scrollPosition = rail.scrollLeft;
      pauseForInteraction();
    };
    const handlePointerUp = () => {
      pointerDown = false;
      if (!interactionPaused()) resumeAfterInteraction();
    };
    const handleFocusIn = () => {
      focusWithin = true;
      pauseForInteraction();
    };
    const handleFocusOut = () => {
      window.requestAnimationFrame(() => {
        focusWithin = rail.contains(document.activeElement);
        if (!interactionPaused()) resumeAfterInteraction();
      });
    };
    const handleManualScrollIntent = () => {
      scrollPosition = rail.scrollLeft;
      if (!automaticMotionQuery.matches) {
        setMotionState("manual");
        return;
      }
      resumeAt = performance.now() + MOBILE_RAIL_INTERACTION_PAUSE_MS;
      setMotionState("waiting");
    };

    const syncAnimation = () => {
      if (reducedMotionQuery.matches) {
        stopFrames();
        direction = 1;
        scrollPosition = rail.scrollLeft;
        setMotionState("reduced");
        return;
      }

      if (!automaticMotionQuery.matches) {
        stopFrames();
        scrollPosition = rail.scrollLeft;
        setMotionState("manual");
        return;
      }

      if (isVisible && pageCanAnimate()) {
        lastTimestamp = performance.now();
        queueFrame();
      } else {
        stopFrames();
        setMotionState("paused");
      }
    };

    const visibilityObserver = "IntersectionObserver" in window
      ? new IntersectionObserver(([entry]) => {
        isVisible = entry?.isIntersecting ?? false;
        syncAnimation();
      }, { threshold: .1 })
      : null;
    const pageStateObserver = new MutationObserver(syncAnimation);

    rail.addEventListener("pointerenter", handlePointerEnter);
    rail.addEventListener("pointerleave", handlePointerLeave);
    rail.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    rail.addEventListener("focusin", handleFocusIn);
    rail.addEventListener("focusout", handleFocusOut);
    rail.addEventListener("wheel", handleManualScrollIntent, { passive: true });
    document.addEventListener("visibilitychange", syncAnimation);
    automaticMotionQuery.addEventListener("change", syncAnimation);
    reducedMotionQuery.addEventListener("change", syncAnimation);
    pageStateObserver.observe(document.documentElement, {
      attributeFilter: ["data-page-active"],
      attributes: true,
    });

    if (visibilityObserver) {
      visibilityObserver.observe(rail);
    } else {
      isVisible = true;
      syncAnimation();
    }

    return () => {
      stopFrames();
      visibilityObserver?.disconnect();
      pageStateObserver.disconnect();
      rail.removeEventListener("pointerenter", handlePointerEnter);
      rail.removeEventListener("pointerleave", handlePointerLeave);
      rail.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      rail.removeEventListener("focusin", handleFocusIn);
      rail.removeEventListener("focusout", handleFocusOut);
      rail.removeEventListener("wheel", handleManualScrollIntent);
      document.removeEventListener("visibilitychange", syncAnimation);
      automaticMotionQuery.removeEventListener("change", syncAnimation);
      reducedMotionQuery.removeEventListener("change", syncAnimation);
      rail.scrollLeft = 0;
      rail.dataset.railMotion = "static";
    };
  }, [isHydrated, isMobileMap]);

  useEffect(() => {
    const rail = filterRailRef.current;
    if (!rail || !isHydrated) return;

    const dockPointerQuery = window.matchMedia(DOCK_POINTER_QUERY);
    const reducedMotionQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    const items = Array.from(
      rail.querySelectorAll<HTMLElement>(".travel-map-flags > li"),
    );
    let animationFrame: number | null = null;
    let pointerX: number | null = null;
    let pointerY: number | null = null;
    let influenceDistance = DOCK_INFLUENCE_DISTANCE_PX;
    let layout: "grid" | "horizontal" | "vertical" = "grid";
    let itemCenters: Array<{ item: HTMLElement; x: number; y: number }> = [];

    const clearInfluence = () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
      pointerX = null;
      pointerY = null;
      items.forEach((item) => item.style.removeProperty("--travel-dock-influence"));
      rail.dataset.dockProximity = reducedMotionQuery.matches ? "reduced" : "idle";
    };

    const measureItems = () => {
      itemCenters = items.map((item) => {
        const bounds = item.getBoundingClientRect();
        return {
          item,
          x: bounds.left + bounds.width / 2,
          y: bounds.top + bounds.height / 2,
        };
      });
      const xPositions = itemCenters.map(({ x }) => x);
      const yPositions = itemCenters.map(({ y }) => y);
      const horizontalSpread = Math.max(...xPositions) - Math.min(...xPositions);
      const verticalSpread = Math.max(...yPositions) - Math.min(...yPositions);

      layout = verticalSpread <= 1
        ? "horizontal"
        : horizontalSpread <= 1 ? "vertical" : "grid";

      if (layout === "grid") {
        influenceDistance = DOCK_INFLUENCE_DISTANCE_PX;
        return;
      }

      const axisPositions = itemCenters
        .map((center) => layout === "horizontal" ? center.x : center.y)
        .sort((left, right) => left - right);
      const neighborDistances = axisPositions
        .slice(1)
        .map((position, index) => position - axisPositions[index]);
      const nearestNeighbor = neighborDistances.length > 0
        ? Math.min(...neighborDistances)
        : 0;
      influenceDistance = nearestNeighbor > 0
        ? Math.max(DOCK_INFLUENCE_DISTANCE_PX, nearestNeighbor * 1.6)
        : DOCK_INFLUENCE_DISTANCE_PX;
    };

    const paintInfluence = () => {
      animationFrame = null;
      if (
        pointerX === null
        || pointerY === null
        || !dockPointerQuery.matches
        || reducedMotionQuery.matches
      ) {
        clearInfluence();
        return;
      }

      const activePointerX = pointerX;
      const activePointerY = pointerY;
      const influences = itemCenters.map(({ x, y }) => {
        const distance = layout === "horizontal"
          ? Math.abs(activePointerX - x)
          : layout === "vertical"
            ? Math.abs(activePointerY - y)
            : Math.hypot(activePointerX - x, activePointerY - y);
        const linearInfluence = clampValue(
          1 - distance / influenceDistance,
          0,
          1,
        );
        return linearInfluence * linearInfluence * (3 - 2 * linearInfluence);
      });

      itemCenters.forEach(({ item }, index) => {
        item.style.setProperty("--travel-dock-influence", influences[index].toFixed(3));
      });
      rail.dataset.dockProximity = "active";
    };

    const queuePaint = () => {
      if (animationFrame === null) {
        animationFrame = window.requestAnimationFrame(paintInfluence);
      }
    };

    const handlePointerEnter = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !dockPointerQuery.matches) return;
      pointerX = event.clientX;
      pointerY = event.clientY;
      measureItems();
      queuePaint();
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !dockPointerQuery.matches) return;
      pointerX = event.clientX;
      pointerY = event.clientY;
      queuePaint();
    };
    const handleLayoutChange = () => {
      if (pointerX === null || pointerY === null) return;
      measureItems();
      queuePaint();
    };

    rail.addEventListener("pointerenter", handlePointerEnter);
    rail.addEventListener("pointermove", handlePointerMove);
    rail.addEventListener("pointerleave", clearInfluence);
    rail.addEventListener("scroll", handleLayoutChange, { passive: true });
    window.addEventListener("resize", handleLayoutChange, { passive: true });
    dockPointerQuery.addEventListener("change", clearInfluence);
    reducedMotionQuery.addEventListener("change", clearInfluence);

    clearInfluence();
    return () => {
      clearInfluence();
      rail.removeEventListener("pointerenter", handlePointerEnter);
      rail.removeEventListener("pointermove", handlePointerMove);
      rail.removeEventListener("pointerleave", clearInfluence);
      rail.removeEventListener("scroll", handleLayoutChange);
      window.removeEventListener("resize", handleLayoutChange);
      dockPointerQuery.removeEventListener("change", clearInfluence);
      reducedMotionQuery.removeEventListener("change", clearInfluence);
      rail.dataset.dockProximity = "idle";
    };
  }, [isHydrated]);

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
              data-map-view={isMapReady && activeViewBox !== WORLD_VIEW_BOX ? "focus" : "world"}
              id="travel-map-canvas"
              viewBox={activeViewBox}
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

              <g aria-hidden="true">
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

              <g aria-hidden="true">
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

            <ul className="travel-map-legend" aria-label="Map legend">
              <li>
                <span
                  className="travel-map-legend-mark travel-map-legend-mark--hub"
                  aria-hidden="true"
                />
                <span>Hub node</span>
              </li>
              <li>
                <span
                  className="travel-map-legend-mark travel-map-legend-mark--route"
                  aria-hidden="true"
                />
                <span>Route signal</span>
              </li>
            </ul>
          </div>

          <div
            className="travel-map-dock"
            role="group"
            aria-label="Flight footprint controls"
            onKeyDown={handleDockKeyDown}
          >
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

            <div
              className="travel-map-flags-scroll"
              data-dock-proximity="idle"
              data-rail-motion="static"
              ref={filterRailRef}
            >
              <ul
                className="travel-map-flags"
                aria-label="Filter flight footprint by country or region"
              >
                {countrySignals.map((country) => {
                  const isSelected = country.code === selectedCountryCode;

                  return (
                    <li
                      data-country-code={country.code}
                      data-filter-value={country.code}
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
                        <span className="travel-map-region-code" aria-hidden="true">
                          {country.code}
                        </span>
                        <span className="travel-map-country-name" aria-hidden="true">
                          {country.name}
                        </span>
                        <span className="sr-only">{country.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <p className="travel-map-privacy">
              Build-time aggregate. Exact itinerary details are omitted.
            </p>
          </div>
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
