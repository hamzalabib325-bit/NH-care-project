// Start with a view of New Hampshire; no clinic locations are loaded yet.
const map = L.map("map", {
  zoomControl: false
}).setView([43.8, -71.6], 7.7);

// OpenStreetMap tiles are free to view and require visible attribution.
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Keep the zoom buttons in the lower corner where they are easy to reach.
L.control.zoom({ position: "bottomright" }).addTo(map);