const fs = require("node:fs/promises");
const path = require("node:path");

const BOUNDARY_URL = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0/query?where=STATE%3D%2733%27&outFields=STATE%2CNAME&outSR=4326&f=geojson";
const REQUIRED_FIELDS = [
  "name",
  "type",
  "address",
  "lat",
  "lng",
  "phone",
  "hours",
  "website",
  "cost",
  "source",
  "last_verified"
];
const REQUIRED_TEXT_FIELDS = ["name", "type", "address", "source"];
const ALLOWED_TYPES = new Set(["urgent_care", "free_clinic", "health_center"]);
const EARTH_RADIUS_MILES = 3958.7613;

function pointInRing(longitude, latitude, ring) {
  let inside = false;

  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current, current += 1) {
    const [currentLongitude, currentLatitude] = ring[current];
    const [previousLongitude, previousLatitude] = ring[previous];
    const crossesLatitude = (currentLatitude > latitude) !== (previousLatitude > latitude);
    const crossingLongitude = ((previousLongitude - currentLongitude)
      * (latitude - currentLatitude))
      / (previousLatitude - currentLatitude)
      + currentLongitude;

    if (crossesLatitude && longitude < crossingLongitude) inside = !inside;
  }

  return inside;
}

function pointInPolygon(longitude, latitude, polygon) {
  const [outerRing, ...holes] = polygon;
  return pointInRing(longitude, latitude, outerRing)
    && !holes.some((hole) => pointInRing(longitude, latitude, hole));
}

function pointInGeometry(longitude, latitude, geometry) {
  if (geometry.type === "Polygon") {
    return pointInPolygon(longitude, latitude, geometry.coordinates);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => pointInPolygon(longitude, latitude, polygon));
  }
  return false;
}

function normalizeAddress(address) {
  return String(address ?? "")
    .toUpperCase()
    .replace(/\b(?:SUITE|STE|UNIT|APT|APARTMENT|#)\s*[A-Z0-9-]+\b/g, "")
    .replace(/\bROAD\b/g, "RD")
    .replace(/\bSTREET\b/g, "ST")
    .replace(/\bHIGHWAY\b/g, "HWY")
    .replace(/\bROUTE\b/g, "RTE")
    .replace(/[^A-Z0-9]/g, "");
}

function normalizeName(name) {
  return String(name ?? "")
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

function nameSimilarity(firstName, secondName) {
  const first = normalizeName(firstName);
  const second = normalizeName(secondName);
  if (!first || !second) return 0;

  let previous = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let firstIndex = 1; firstIndex <= first.length; firstIndex += 1) {
    const current = [firstIndex];
    for (let secondIndex = 1; secondIndex <= second.length; secondIndex += 1) {
      const substitutionCost = first[firstIndex - 1] === second[secondIndex - 1] ? 0 : 1;
      current[secondIndex] = Math.min(
        current[secondIndex - 1] + 1,
        previous[secondIndex] + 1,
        previous[secondIndex - 1] + substitutionCost
      );
    }
    previous = current;
  }

  return 1 - previous[second.length] / Math.max(first.length, second.length);
}

function distanceMiles(firstClinic, secondClinic) {
  const radians = Math.PI / 180;
  const firstLatitude = firstClinic.lat * radians;
  const secondLatitude = secondClinic.lat * radians;
  const latitudeDifference = (secondClinic.lat - firstClinic.lat) * radians;
  const longitudeDifference = (secondClinic.lng - firstClinic.lng) * radians;
  const halfChordSquared = Math.sin(latitudeDifference / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude)
    * Math.sin(longitudeDifference / 2) ** 2;
  const boundedChord = Math.min(1, halfChordSquared);

  return EARTH_RADIUS_MILES * 2 * Math.atan2(
    Math.sqrt(boundedChord),
    Math.sqrt(1 - boundedChord)
  );
}

function isValidPhone(phone) {
  const withoutExtension = phone.replace(/\s*(?:ext\.?|x)\s*\d+\s*$/i, "");
  const digits = withoutExtension.replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}

function isValidWebsite(website) {
  if (/\s/.test(website)) return false;
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(website) ? website : `https://${website}`);
    return ["http:", "https:"].includes(url.protocol)
      && url.hostname.includes(".")
      && !url.hostname.startsWith(".")
      && !url.hostname.endsWith(".");
  } catch {
    return false;
  }
}

async function readNewHampshireBoundary() {
  const response = await fetch(BOUNDARY_URL, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) {
    throw new Error(`Census TIGERweb boundary request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const feature = data.features?.find((item) => item.properties?.STATE === "33");
  if (!feature?.geometry) throw new Error("Census TIGERweb did not return the New Hampshire boundary.");
  return feature.geometry;
}

async function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const clinicsPath = path.join(projectRoot, "data", "clinics.json");
  const clinics = JSON.parse(await fs.readFile(clinicsPath, "utf8"));
  if (!Array.isArray(clinics)) throw new Error("data/clinics.json must contain an array.");

  const newHampshireBoundary = await readNewHampshireBoundary();
  const errors = [];
  const warnings = [];

  for (let index = 0; index < clinics.length; index += 1) {
    const clinic = clinics[index];
    const label = clinic.name || `Record ${index + 1}`;
    const missingKeys = REQUIRED_FIELDS.filter((field) => !(field in clinic));
    if (missingKeys.length > 0) {
      errors.push({ clinic: label, issue: `Missing required field keys: ${missingKeys.join(", ")}` });
    }

    for (const field of REQUIRED_TEXT_FIELDS) {
      if (typeof clinic[field] !== "string" || clinic[field].trim() === "") {
        errors.push({ clinic: label, issue: `Missing required value: ${field}` });
      }
    }

    if (typeof clinic.type === "string" && !ALLOWED_TYPES.has(clinic.type)) {
      errors.push({ clinic: label, issue: `Unsupported type: ${clinic.type}` });
    }

    if (typeof clinic.phone !== "string") {
      errors.push({ clinic: label, issue: "Phone must be stored as text." });
    } else if (clinic.phone.trim() !== "" && !isValidPhone(clinic.phone)) {
      errors.push({ clinic: label, issue: `Phone number looks malformed: ${clinic.phone}` });
    }

    if (typeof clinic.website !== "string") {
      errors.push({ clinic: label, issue: "Website must be stored as text." });
    } else if (clinic.website.trim() !== "" && !isValidWebsite(clinic.website.trim())) {
      errors.push({ clinic: label, issue: `Website URL looks malformed: ${clinic.website}` });
    }

    const latitudeMissing = clinic.lat === null || clinic.lat === undefined || clinic.lat === "";
    const longitudeMissing = clinic.lng === null || clinic.lng === undefined || clinic.lng === "";
    if (latitudeMissing && longitudeMissing) {
      warnings.push({ clinic: label, issue: "Coordinates are missing." });
      continue;
    }
    if (latitudeMissing !== longitudeMissing) {
      errors.push({ clinic: label, issue: "Only one coordinate is present; lat and lng must both be set or both be blank." });
      continue;
    }

    if (typeof clinic.lat !== "number" || typeof clinic.lng !== "number"
      || !Number.isFinite(clinic.lat) || !Number.isFinite(clinic.lng)) {
      errors.push({ clinic: label, issue: "Coordinates must be finite numbers or both null." });
      continue;
    }
    if (clinic.lat < -90 || clinic.lat > 90 || clinic.lng < -180 || clinic.lng > 180) {
      errors.push({ clinic: label, issue: `Coordinate values out of range: lat=${clinic.lat}, lng=${clinic.lng}.` });
      continue;
    }

    const pointIsInNewHampshire = pointInGeometry(clinic.lng, clinic.lat, newHampshireBoundary);
    const swappedPointIsInNewHampshire = pointInGeometry(clinic.lat, clinic.lng, newHampshireBoundary);
    if (!pointIsInNewHampshire && swappedPointIsInNewHampshire) {
      errors.push({ clinic: label, issue: `Latitude and longitude may be swapped: lat=${clinic.lat}, lng=${clinic.lng}.` });
    } else if (!pointIsInNewHampshire) {
      warnings.push({ clinic: label, issue: `Coordinates are outside New Hampshire: lat=${clinic.lat}, lng=${clinic.lng}.` });
    }
  }

  for (let firstIndex = 0; firstIndex < clinics.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < clinics.length; secondIndex += 1) {
      const first = clinics[firstIndex];
      const second = clinics[secondIndex];
      const sameAddress = normalizeAddress(first.address) !== ""
        && normalizeAddress(first.address) === normalizeAddress(second.address);
      const bothHaveCoordinates = Number.isFinite(first.lat) && Number.isFinite(first.lng)
        && Number.isFinite(second.lat) && Number.isFinite(second.lng);
      const milesApart = bothHaveCoordinates ? distanceMiles(first, second) : null;
      const nearCoordinates = milesApart !== null && milesApart <= 0.1;
      const similarNamesNearby = milesApart !== null
        && milesApart <= 1
        && nameSimilarity(first.name, second.name) >= 0.85;

      if (sameAddress || nearCoordinates || similarNamesNearby) {
        const reasons = [];
        if (sameAddress) reasons.push("normalized addresses match");
        if (nearCoordinates) reasons.push(`coordinates are ${milesApart.toFixed(3)} miles apart`);
        if (similarNamesNearby) reasons.push("names are very similar within 1 mile");
        warnings.push({
          clinic: `${first.name} | ${second.name}`,
          issue: `Possible duplicate pair (${reasons.join("; ")}). Review manually; nearby services may be distinct.`
        });
      }
    }
  }

  console.log("Clinic data audit (read-only)");
  console.log(`Checked ${clinics.length} clinic records against the Census TIGERweb New Hampshire boundary.`);
  console.log(`Errors: ${errors.length}; warnings: ${warnings.length}`);
  if (errors.length > 0) {
    console.log("\nErrors:");
    for (const item of errors) console.log(`- ${item.clinic}: ${item.issue}`);
  }
  if (warnings.length > 0) {
    console.log("\nWarnings and possible duplicates:");
    for (const item of warnings) console.log(`- ${item.clinic}: ${item.issue}`);
  }
  if (errors.length === 0 && warnings.length === 0) console.log("No issues found.");
  console.log("\nNo files were changed.");

  if (errors.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Clinic audit could not complete: ${error.message}`);
  process.exitCode = 1;
});