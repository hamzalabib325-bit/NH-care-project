// The corners of a box around New Hampshire (south-west, then north-east).
const NH_BOUNDS = L.latLngBounds([42.69, -72.56], [45.31, -70.6]);

// Start with a view of New Hampshire; clinic pins are added once the data loads.
// maxBounds stops the map from being dragged far outside the state.
// zoomSnap lets the map zoom in quarter steps, so New Hampshire can fill the screen.
const map = L.map("map", {
  zoomControl: false,
  zoomSnap: 0.25,
  maxBounds: NH_BOUNDS.pad(0.15),
  maxBoundsViscosity: 1
}).fitBounds(NH_BOUNDS);

// Don't allow zooming out past the view that fits all of New Hampshire.
// Screens differ in size, so this is worked out again whenever the window changes.
function limitZoomToNH() {
  map.setMinZoom(map.getBoundsZoom(NH_BOUNDS));
}
limitZoomToNH();
map.on("resize", limitZoomToNH);

// OpenStreetMap tiles are free to view and require visible attribution.
// detectRetina loads more detailed map images on sharp (high-resolution) screens
// like most phones, so roads and labels don't look blurry.
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  detectRetina: true,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Keep the zoom buttons in the lower corner where they are easy to reach.
L.control.zoom({ position: "bottomright" }).addTo(map);

// Each clinic type gets its own pin color and a plain-language label.
// "filter" says which checkbox above the map shows or hides it.
const CLINIC_TYPES = {
  free_clinic: { label: "Free clinic", color: "#1a7f37", filter: "free" },
  health_center: { label: "Health center (sliding-scale fees)", color: "#1d5fa8", filter: "free" },
  urgent_care: { label: "Urgent care", color: "#c2410c", filter: "urgent" }
};

// A layer group holds a set of pins so they can be shown or hidden together.
const filterLayers = {
  urgent: L.layerGroup().addTo(map),
  free: L.layerGroup().addTo(map)
};

// When a filter checkbox changes, show or hide that group of pins.
for (const checkbox of document.querySelectorAll('input[name="filter"]')) {
  checkbox.addEventListener("change", () => {
    const layer = filterLayers[checkbox.value];
    if (checkbox.checked) {
      layer.addTo(map);
    } else {
      layer.remove();
    }
  });
}

// Some websites in the data are stored without "https://".
function toUrl(website) {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

// Build popup content with DOM nodes so clinic text is never parsed as HTML.
function buildPopup(clinic, type) {
  const container = document.createElement("div");
  container.className = "clinic-popup";

  const name = document.createElement("strong");
  name.className = "clinic-name";
  name.textContent = clinic.name;
  container.append(name);

  const typeLabel = document.createElement("span");
  typeLabel.className = "clinic-type";
  typeLabel.textContent = type.label;
  typeLabel.style.color = type.color;
  container.append(typeLabel);

  const details = [clinic.address, clinic.hours && `Hours: ${clinic.hours}`, clinic.cost];
  for (const text of details.filter(Boolean)) {
    const line = document.createElement("p");
    line.textContent = text;
    container.append(line);
  }

  // phone_alt holds a number verified on the provider's own site, so it is listed first.
  for (const number of [clinic.phone_alt, clinic.phone].filter(Boolean)) {
    const phone = document.createElement("a");
    phone.href = `tel:${number.replace(/[^\d+]/g, "")}`;
    phone.textContent = `Call ${number}`;
    container.append(phone);
  }

  if (clinic.website) {
    const website = document.createElement("a");
    website.href = toUrl(clinic.website);
    website.target = "_blank";
    website.rel = "noopener";
    // Show the site's address (e.g. "example.org") so it reads clearly as a link.
    website.textContent = new URL(website.href).hostname.replace(/^www\./, "");
    container.append(website);
  }

  // Google Maps works on phones and computers. We only send the clinic's address;
  // Google Maps itself asks for the user's location if they want turn-by-turn directions.
  const directions = document.createElement("a");
  const destination = clinic.address || `${clinic.lat},${clinic.lng}`;
  directions.href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  directions.target = "_blank";
  directions.rel = "noopener";
  directions.textContent = "Get directions";
  container.append(directions);

  return container;
}

function addLegend() {
  const legend = L.control({ position: "bottomleft" });
  legend.onAdd = () => {
    const container = L.DomUtil.create("div", "map-legend");
    for (const type of Object.values(CLINIC_TYPES)) {
      const row = document.createElement("div");
      const swatch = document.createElement("span");
      swatch.className = "legend-swatch";
      swatch.style.background = type.color;
      row.append(swatch, type.label);
      container.append(row);
    }
    return container;
  };
  legend.addTo(map);
}

// Pin locations and their filter group, kept so "Near me" can find the closest clinics.
const clinicLocations = [];

// Only count clinics whose filter checkbox is turned on.
function visibleClinicLocations() {
  return clinicLocations
    .filter((clinic) => map.hasLayer(filterLayers[clinic.filter]))
    .map((clinic) => clinic.latLng);
}
let userMarker = null;

// Mark a starting point (from Near me or the search box) and zoom to the
// three closest clinics, so rural users still see options on screen.
function showNearest(here, label) {
  if (userMarker) {
    userMarker.setLatLng(here).setPopupContent(label);
  } else {
    userMarker = L.circleMarker(here, {
      radius: 9,
      color: "#fff",
      weight: 3,
      fillColor: "#7c3aed",
      fillOpacity: 1
    }).bindPopup(label).addTo(map);
  }

  const nearest = visibleClinicLocations()
    .sort((a, b) => here.distanceTo(a) - here.distanceTo(b))
    .slice(0, 3);

  if (nearest.length) {
    map.fitBounds(L.latLngBounds([here, ...nearest]), { padding: [40, 40], maxZoom: 13 });
  } else {
    map.setView(here, 12);
  }
}

function showNearMe(button, status) {
  if (!("geolocation" in navigator)) {
    status.textContent = "Your browser can't share your location.";
    return;
  }

  button.disabled = true;
  status.textContent = "Finding your location…";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      button.disabled = false;
      status.textContent = "";
      const here = L.latLng(position.coords.latitude, position.coords.longitude);

      showNearest(here, "You are here");
    },
    (error) => {
      button.disabled = false;
      status.textContent = error.code === error.PERMISSION_DENIED
        ? "Location is turned off. Allow location access to use Near me."
        : "Couldn't find your location. Please try again.";
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
  );
}

function addNearMeButton() {
  const control = L.control({ position: "topleft" });
  control.onAdd = () => {
    const container = L.DomUtil.create("div", "near-me");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "near-me-button";
    button.textContent = "Near me";
    const status = document.createElement("p");
    status.className = "near-me-status";
    status.setAttribute("role", "status");
    button.addEventListener("click", () => showNearMe(button, status));
    container.append(button, status);
    // Stop taps on the button from also dragging or zooming the map.
    L.DomEvent.disableClickPropagation(container);
    return container;
  };
  control.addTo(map);
}

addNearMeButton();

// Town and ZIP code centers from the U.S. Census Bureau (see data/places.json).
let places = [];

// Make typed text easy to compare: "  Concord, NH " becomes "concord".
function normalizePlace(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/,?\s*(nh|new hampshire)$/, "")
    .trim();
}

function findPlace(query) {
  // "03301-1234" or "03301" both become "03301".
  const zip = query.match(/^(\d{5})(-\d{4})?$/);
  if (zip) {
    return places.find((place) => place.kind === "zip" && place.name === zip[1]);
  }
  return places.find((place) => place.kind === "town" && normalizePlace(place.name) === query);
}

function setUpPlaceSearch() {
  const form = document.getElementById("place-search");
  const input = document.getElementById("place-input");
  const status = document.getElementById("place-status");

  form.addEventListener("submit", (event) => {
    // Stop the browser from reloading the page when the form is sent.
    event.preventDefault();
    const query = normalizePlace(input.value);
    if (!query) {
      status.textContent = "Type a New Hampshire ZIP code or town name.";
      return;
    }

    const place = findPlace(query);
    if (!place) {
      status.textContent = /^\d/.test(query)
        ? "We couldn't find that New Hampshire ZIP code. Try your town name instead."
        : "We couldn't find that New Hampshire town. Check the spelling or try a ZIP code.";
      return;
    }

    const label = place.kind === "zip" ? `ZIP code ${place.name}` : `${place.name}, NH`;
    status.textContent = `Showing the clinics closest to ${label}.`;
    showNearest(L.latLng(place.lat, place.lng), label);
  });
}

async function loadPlaces() {
  try {
    const response = await fetch("data/places.json");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    places = await response.json();

    // Fill the drop-down suggestions with town names as the user types.
    const townList = document.getElementById("town-list");
    for (const place of places.filter((p) => p.kind === "town")) {
      const option = document.createElement("option");
      option.value = place.name;
      townList.append(option);
    }
  } catch (error) {
    console.error("Could not load town and ZIP data:", error);
  }
}

setUpPlaceSearch();
loadPlaces();

async function loadClinics() {
  try {
    const response = await fetch("data/clinics.json");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const clinics = await response.json();

    for (const clinic of clinics) {
      if (!Number.isFinite(clinic.lat) || !Number.isFinite(clinic.lng)) {
        continue;
      }
      // Unknown types are grouped with free & low-cost so they are never silently hidden.
      const type = CLINIC_TYPES[clinic.type] ?? { label: "Clinic", color: "#555", filter: "free" };
      clinicLocations.push({ latLng: L.latLng(clinic.lat, clinic.lng), filter: type.filter });
      L.circleMarker([clinic.lat, clinic.lng], {
        radius: 8,
        color: "#fff",
        weight: 2,
        fillColor: type.color,
        fillOpacity: 0.9
      })
        .bindPopup(() => buildPopup(clinic, type), { maxWidth: 280 })
        .addTo(filterLayers[type.filter]);
    }

    addLegend();
  } catch (error) {
    console.error("Could not load clinic data:", error);
  }
}

loadClinics();
