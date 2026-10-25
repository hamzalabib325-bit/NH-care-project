// Map page logic. Shared helpers (clinicType, clinicLinks, findPlace, ...) live in common.js.

// The corners of a box around New Hampshire (south-west, then north-east).
const NH_BOUNDS = L.latLngBounds([42.69, -72.56], [45.31, -70.6]);

// Start with a view of New Hampshire; clinic pins are added once the data loads.
// maxBounds stops the map from being dragged far outside the state.
// zoomSnap lets the map zoom in quarter steps, so New Hampshire can fill the screen.
const map = L.map("map", {
  zoomControl: false,
  zoomSnap: 0.25,
  // The mouse wheel scrolls the page until the map is clicked (see below).
  scrollWheelZoom: false,
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

// On computers, scrolling over the map would zoom it instead of scrolling the page.
// So wheel-zoom turns on only after the map is clicked, and off when the mouse leaves.
map.on("click", () => map.scrollWheelZoom.enable());
map.on("mouseout", () => map.scrollWheelZoom.disable());

// Keep the zoom buttons in the lower corner where they are easy to reach.
L.control.zoom({ position: "bottomright" }).addTo(map);

// A message on top of the map, for "Loading…" or when something goes wrong.
const mapMessage = document.getElementById("map-message");
function showMapMessage(text) {
  mapMessage.textContent = text;
  mapMessage.hidden = !text;
}

// Clinic pins are small colored circles drawn with CSS (see .clinic-pin in style.css).
const pinIcons = {};
for (const [key, type] of Object.entries(CLINIC_TYPES)) {
  pinIcons[key] = L.divIcon({
    className: "clinic-pin",
    html: `<span style="background:${type.color}"></span>`,
    iconSize: [20, 20],
    popupAnchor: [0, -8]
  });
}

// A cluster group holds one clinic type's pins. Pins that are close together on screen
// are combined into one numbered bubble, which splits apart as you zoom in.
// There is one group per type, so each bubble keeps its type's color and the filter
// buttons can still show or hide each type.
const filterLayers = {};
for (const [key, type] of Object.entries(CLINIC_TYPES)) {
  filterLayers[key] = L.markerClusterGroup({
    maxClusterRadius: 35,
    // Zoomed in to street level, always show every pin on its own.
    disableClusteringAtZoom: 14,
    showCoverageOnHover: false,
    iconCreateFunction: (cluster) => {
      const count = cluster.getChildCount();
      return L.divIcon({
        className: "clinic-cluster",
        html: `<span style="background:${type.color}" aria-label="${t("{count} {type} locations", { count, type: type.label })}">${count}</span>`,
        iconSize: [34, 34]
      });
    }
  }).addTo(map);
}

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

function buildPopup(clinic) {
  const type = clinicType(clinic);
  const container = document.createElement("div");
  container.className = "clinic-popup";

  const name = document.createElement("strong");
  name.className = "clinic-name";
  name.textContent = displayName(clinic.name);

  const typeLabel = document.createElement("span");
  typeLabel.className = "clinic-type";
  typeLabel.textContent = type.label;
  typeLabel.style.color = type.color;
  container.append(name, typeLabel);

  const details = [clinic.address && displayAddress(clinic.address), clinic.hours && t("Hours: {hours}", { hours: displayHours(clinic.hours) }), clinic.cost, ...serviceLines(clinic)];
  for (const text of details.filter(Boolean)) {
    const line = document.createElement("p");
    line.textContent = text;
    container.append(line);
  }

  container.append(...clinicLinks(clinic));
  return container;
}

// Every pin, with its clinic and filter group, so "Near me" and "Show on map" can find them.
const clinicMarkers = [];

// Only count clinics whose filter checkbox is turned on.
function visibleClinicLocations() {
  return clinicMarkers
    .filter((entry) => map.hasLayer(filterLayers[entry.group]))
    .map((entry) => entry.marker.getLatLng());
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

function addNearMeButton() {
  const control = L.control({ position: "topleft" });
  control.onAdd = () => {
    const container = L.DomUtil.create("div", "near-me");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "near-me-button";
    button.textContent = t("Near me");
    const status = document.createElement("p");
    status.className = "near-me-status";
    status.setAttribute("role", "status");

    button.addEventListener("click", () => {
      button.disabled = true;
      status.textContent = t("Finding your location…");
      getUserLocation(
        (lat, lng) => {
          button.disabled = false;
          status.textContent = "";
          showNearest(L.latLng(lat, lng), t("You are here"));
        },
        (message) => {
          button.disabled = false;
          status.textContent = message;
        }
      );
    });

    container.append(button, status);
    // Stop taps on the button from also dragging or zooming the map.
    L.DomEvent.disableClickPropagation(container);
    return container;
  };
  control.addTo(map);
}

addNearMeButton();

// Town and ZIP code centers, loaded from data/places.json.
let places = [];

function setUpPlaceSearch() {
  const form = document.getElementById("place-search");
  const input = document.getElementById("place-input");
  const status = document.getElementById("place-status");

  form.addEventListener("submit", (event) => {
    // Stop the browser from reloading the page when the form is sent.
    event.preventDefault();
    if (!places.length) {
      status.textContent = t("Town and ZIP search isn't available right now. Try refreshing the page.");
      return;
    }
    const place = findPlace(places, input.value);
    if (!place) {
      status.textContent = placeNotFoundMessage(input.value);
      return;
    }
    status.textContent = t("Showing the clinics closest to {place}.", { place: placeLabel(place) });
    showNearest(L.latLng(place.lat, place.lng), placeLabel(place));
    // Bring the map into view so the results are on screen.
    document.getElementById("map").scrollIntoView({ behavior: "smooth", block: "end" });
  });
}

async function loadPlaces() {
  try {
    places = await loadJson("data/places.json");
    fillTownSuggestions(places, "town-list");
  } catch (error) {
    console.error("Could not load town and ZIP data:", error);
  }
}

// The cost helper links here as map.html?lat=...&lng=... to show one clinic.
// Zoom to that clinic's pin and open its popup.
function showLinkedClinic() {
  const params = new URLSearchParams(window.location.search);
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  if (!params.has("lat") || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return;
  }
  const entry = clinicMarkers.find(({ clinic }) =>
    Math.abs(clinic.lat - lat) < 1e-6 && Math.abs(clinic.lng - lng) < 1e-6);
  if (!entry) {
    return;
  }
  // If that type is filtered out, turn it back on so the pin can be seen.
  const checkbox = document.querySelector(`input[name="filter"][value="${entry.group}"]`);
  if (checkbox && !checkbox.checked) {
    checkbox.click();
  }
  map.setView(entry.marker.getLatLng(), 15);
  filterLayers[entry.group].zoomToShowLayer(entry.marker, () => entry.marker.openPopup());
}

async function loadClinics() {
  showMapMessage(t("Loading clinics…"));
  try {
    const clinics = await loadJson("data/clinics.json");
    for (const clinic of clinics) {
      if (!Number.isFinite(clinic.lat) || !Number.isFinite(clinic.lng)) {
        continue;
      }
      // Unknown types are grouped with health centers so they are never silently hidden.
      const group = filterLayers[clinic.type] ? clinic.type : "health_center";
      const marker = L.marker([clinic.lat, clinic.lng], {
        icon: pinIcons[group],
        // Screen readers and hover tooltips read the clinic's name.
        title: displayName(clinic.name),
        alt: displayName(clinic.name)
      }).bindPopup(() => buildPopup(clinic), { maxWidth: 280 });
      filterLayers[group].addLayer(marker);
      clinicMarkers.push({ clinic, marker, group });
    }
    showMapMessage("");
    showLinkedClinic();
  } catch (error) {
    console.error("Could not load clinic data:", error);
    showMapMessage(t("Sorry, the clinic list didn't load. Check your internet connection and refresh the page."));
  }
}

setUpPlaceSearch();
loadPlaces();
loadClinics();
