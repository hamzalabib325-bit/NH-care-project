// Code shared by every page that works with clinics or places.
// Pages load this file first, then their own script (map.js or cost.js).

// Each clinic type gets its own pin color and a plain-language label.
const CLINIC_TYPES = {
  free_clinic: { label: "Free clinic", color: "#1a7f37" },
  health_center: { label: "Health center (sliding-scale fees)", color: "#1d5fa8" },
  urgent_care: { label: "Urgent care", color: "#c2410c" }
};

// Unknown types still get shown, just in gray.
function clinicType(clinic) {
  return CLINIC_TYPES[clinic.type] ?? { label: "Clinic", color: "#555" };
}

// Load a JSON file from the data folder.
async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} loading ${path}`);
  }
  return response.json();
}

// Distance in miles between two points, using the Haversine formula
// (it accounts for the Earth being round).
function distanceMiles(lat1, lng1, lat2, lng2) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(a));
}

// Some websites in the data are stored without "https://".
function toUrl(website) {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

function makeLink(href, text, opensNewTab) {
  const link = document.createElement("a");
  link.href = href;
  link.textContent = text;
  if (opensNewTab) {
    link.target = "_blank";
    link.rel = "noopener";
  }
  return link;
}

// Call, website, and directions links for one clinic.
// Built with DOM nodes so clinic text is never parsed as HTML.
function clinicLinks(clinic) {
  const links = [];

  // phone_alt holds a number verified on the provider's own site, so it is listed first.
  for (const number of [clinic.phone_alt, clinic.phone].filter(Boolean)) {
    links.push(makeLink(`tel:${number.replace(/[^\d+]/g, "")}`, `Call ${number}`, false));
  }

  if (clinic.website) {
    const url = toUrl(clinic.website);
    // Show the site's address (e.g. "example.org") so it reads clearly as a link.
    links.push(makeLink(url, new URL(url).hostname.replace(/^www\./, ""), true));
  }

  // Google Maps works on phones and computers. We only send the clinic's address;
  // Google Maps itself asks for the user's location if they want turn-by-turn directions.
  const destination = clinic.address || `${clinic.lat},${clinic.lng}`;
  links.push(makeLink(
    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`,
    "Get directions",
    true
  ));

  return links;
}

// --- Town and ZIP code search -------------------------------------------
// Town and ZIP code centers come from the U.S. Census Bureau (see data/places.json).
// The search happens in the browser, so what someone types is never sent anywhere.

// Make typed text easy to compare: "  Concord, NH " becomes "concord".
function normalizePlace(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/,?\s*(nh|new hampshire)$/, "")
    .trim();
}

// Returns the matching place, or null if there isn't one.
function findPlace(places, text) {
  const query = normalizePlace(text);
  // "03301-1234" or "03301" both become "03301".
  const zip = query.match(/^(\d{5})(-\d{4})?$/);
  if (zip) {
    return places.find((place) => place.kind === "zip" && place.name === zip[1]) ?? null;
  }
  return places.find((place) => place.kind === "town" && normalizePlace(place.name) === query) ?? null;
}

// A friendly message for when findPlace comes back empty.
function placeNotFoundMessage(text) {
  const query = normalizePlace(text);
  if (!query) {
    return "Type a New Hampshire ZIP code or town name.";
  }
  return /^\d/.test(query)
    ? "We couldn't find that New Hampshire ZIP code. Try your town name instead."
    : "We couldn't find that New Hampshire town. Check the spelling or try a ZIP code.";
}

function placeLabel(place) {
  return place.kind === "zip" ? `ZIP code ${place.name}` : `${place.name}, NH`;
}

// Fill a <datalist> with town names so they are suggested while typing.
function fillTownSuggestions(places, datalistId) {
  const list = document.getElementById(datalistId);
  for (const place of places.filter((p) => p.kind === "town")) {
    const option = document.createElement("option");
    option.value = place.name;
    list.append(option);
  }
}

// Ask the browser for the user's location. Calls onFound(lat, lng) or onError(message).
// The location is only used on this device to measure distances.
function getUserLocation(onFound, onError) {
  if (!("geolocation" in navigator)) {
    onError("Your browser can't share your location. Try a ZIP code or town instead.");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (position) => onFound(position.coords.latitude, position.coords.longitude),
    (error) => onError(error.code === error.PERMISSION_DENIED
      ? "Location is turned off. Allow location access, or type a ZIP code or town instead."
      : "Couldn't find your location. Please try again, or type a ZIP code or town."),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
  );
}
