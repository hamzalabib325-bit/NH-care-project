// Start with a view of New Hampshire; clinic pins are added once the data loads.
const map = L.map("map", {
  zoomControl: false
}).setView([43.8, -71.6], 7.7);

// OpenStreetMap tiles are free to view and require visible attribution.
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
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

      if (userMarker) {
        userMarker.setLatLng(here);
      } else {
        userMarker = L.circleMarker(here, {
          radius: 9,
          color: "#fff",
          weight: 3,
          fillColor: "#7c3aed",
          fillOpacity: 1
        }).bindPopup("You are here").addTo(map);
      }

      // Zoom to show the patient and the three closest clinics, even in rural areas.
      const nearest = visibleClinicLocations()
        .sort((a, b) => here.distanceTo(a) - here.distanceTo(b))
        .slice(0, 3);

      if (nearest.length) {
        map.fitBounds(L.latLngBounds([here, ...nearest]), { padding: [40, 40], maxZoom: 13 });
      } else {
        map.setView(here, 12);
      }
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
