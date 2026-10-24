// Map page logic. Shared helpers (clinicType, clinicLinks, findPlace, ...) live in common.js.

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

// A layer group holds a set of pins so they can be shown or hidden together.
// There is one group per clinic type, matching the filter buttons above the map.
const filterLayers = {};
for (const type of Object.keys(CLINIC_TYPES)) {
  filterLayers[type] = L.layerGroup().addTo(map);
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
  name.textContent = clinic.name;

  const typeLabel = document.createElement("span");
  typeLabel.className = "clinic-type";
  typeLabel.textContent = type.label;
  typeLabel.style.color = type.color;
  container.append(name, typeLabel);

  const details = [clinic.address, clinic.hours && `Hours: ${clinic.hours}`, clinic.cost];
  for (const text of details.filter(Boolean)) {
    const line = document.createElement("p");
    line.textContent = text;
    container.append(line);
  }

  container.append(...clinicLinks(clinic));
  return container;
}

// Pin locations and their type, kept so "Near me" can find the closest clinics.
const clinicLocations = [];

// Only count clinics whose filter checkbox is turned on.
function visibleClinicLocations() {
  return clinicLocations
    .filter((clinic) => map.hasLayer(filterLayers[clinic.type]))
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

    button.addEventListener("click", () => {
      button.disabled = true;
      status.textContent = "Finding your location…";
      getUserLocation(
        (lat, lng) => {
          button.disabled = false;
          status.textContent = "";
          showNearest(L.latLng(lat, lng), "You are here");
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
    const place = findPlace(places, input.value);
    if (!place) {
      status.textContent = placeNotFoundMessage(input.value);
      return;
    }
    status.textContent = `Showing the clinics closest to ${placeLabel(place)}.`;
    showNearest(L.latLng(place.lat, place.lng), placeLabel(place));
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

async function loadClinics() {
  try {
    const clinics = await loadJson("data/clinics.json");
    for (const clinic of clinics) {
      if (!Number.isFinite(clinic.lat) || !Number.isFinite(clinic.lng)) {
        continue;
      }
      const type = clinicType(clinic);
      // Unknown types are grouped with health centers so they are never silently hidden.
      const group = filterLayers[clinic.type] ? clinic.type : "health_center";
      clinicLocations.push({ latLng: L.latLng(clinic.lat, clinic.lng), type: group });
      L.circleMarker([clinic.lat, clinic.lng], {
        radius: 8,
        color: "#fff",
        weight: 2,
        fillColor: type.color,
        fillOpacity: 0.9
      })
        .bindPopup(() => buildPopup(clinic), { maxWidth: 280 })
        .addTo(filterLayers[group]);
    }
  } catch (error) {
    console.error("Could not load clinic data:", error);
  }
}

setUpPlaceSearch();
loadPlaces();
loadClinics();
