import {
  degreesLat,
  degreesLong,
  eciToGeodetic,
  gstime,
  propagate,
  twoline2satrec
} from "satellite.js";

function jsonHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Cache-Control", "s-maxage=5, stale-while-revalidate=15");
}

function normalizeWhereTheIss(data) {
  if (!Number.isFinite(Number(data.latitude)) || !Number.isFinite(Number(data.longitude))) {
    throw new Error("WhereTheISS response did not include valid coordinates");
  }

  return {
    latitude: Number(data.latitude),
    longitude: Number(data.longitude),
    timestamp: Number(data.timestamp) || Math.floor(Date.now() / 1000),
    velocity: Number(data.velocity) || undefined,
    source: "wheretheiss.at"
  };
}

function normalizeOpenNotify(data) {
  if (!data.iss_position) {
    throw new Error("Open Notify response did not include ISS position");
  }

  return {
    latitude: Number(data.iss_position.latitude),
    longitude: Number(data.iss_position.longitude),
    timestamp: Number(data.timestamp) || Math.floor(Date.now() / 1000),
    source: "open-notify.org"
  };
}

async function fetchJsonFrom(source, normalize) {
  const apiResponse = await fetch(source);

  if (!apiResponse.ok) {
    throw new Error(`${source} returned ${apiResponse.status}`);
  }

  return normalize(await apiResponse.json());
}

async function fetchCelesTrakPosition() {
  const tleResponse = await fetch("https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE");

  if (!tleResponse.ok) {
    throw new Error(`CelesTrak returned ${tleResponse.status}`);
  }

  const lines = (await tleResponse.text())
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const line1 = lines.find((line) => line.startsWith("1 "));
  const line2 = lines.find((line) => line.startsWith("2 "));

  if (!line1 || !line2) {
    throw new Error("CelesTrak did not return a usable ISS TLE");
  }

  const now = new Date();
  const satrec = twoline2satrec(line1, line2);
  const positionAndVelocity = propagate(satrec, now);

  if (!positionAndVelocity.position) {
    throw new Error("Unable to propagate ISS position from TLE");
  }

  const geodetic = eciToGeodetic(positionAndVelocity.position, gstime(now));
  const velocityVector = positionAndVelocity.velocity;
  const velocity = velocityVector
    ? Math.hypot(velocityVector.x, velocityVector.y, velocityVector.z) * 3600
    : undefined;

  return {
    latitude: degreesLat(geodetic.latitude),
    longitude: degreesLong(geodetic.longitude),
    timestamp: Math.floor(now.getTime() / 1000),
    velocity,
    source: "celestrak.org"
  };
}

export default async function handler(_request, response) {
  const sources = [
    () => fetchJsonFrom("https://api.wheretheiss.at/v1/satellites/25544", normalizeWhereTheIss),
    () => fetchJsonFrom("http://api.open-notify.org/iss-now.json", normalizeOpenNotify),
    fetchCelesTrakPosition
  ];

  for (const fetchSource of sources) {
    try {
      const data = await fetchSource();

      jsonHeaders(response);
      response.status(200).json(data);
      return;
    } catch {
      // Keep trying sources so the client gets the best available live position.
    }
  }

  response.status(502).json({
    message: "Unable to fetch ISS position"
  });
}
