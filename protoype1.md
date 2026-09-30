# NH Care Finder — Project Context

## What this app does
A web app that helps people in New Hampshire find the nearest urgent care centers
and free or low-cost medical clinics. The user shares their location (or types a
ZIP code or town), and the app shows the closest options on a map and in a list,
sorted by distance, with phone numbers and directions.

This is my entry for the 2026 Congressional App Challenge.
**Deadline: Monday, October 26, 2026 at 12:00 PM ET.** I plan to submit by October 24.

## About me
I am a beginner with no prior coding experience. Please:
- Keep code simple, readable, and well-commented.
- After every change, explain in plain language what you did and why.
- When you introduce a new concept (a function, an event listener, JSON, etc.),
  explain it briefly like I'm new to programming.
- Work in small steps. Build one feature at a time so I can test it before moving on.
- If there is a simpler way to do something, choose the simpler way.
- Avoid unnecessary complexity so the project stays easy to maintain and fix.

## Tech stack (do not change without asking me)
- Plain HTML, CSS, and JavaScript only.
- No frameworks (no React, Vue, etc.), no build tools, no npm packages for the app itself.
- No backend or database. All clinic data lives in `data/clinics.json`.
- Map: Leaflet with OpenStreetMap tiles (loaded from a CDN, include the required
  OpenStreetMap attribution on the map).
- Location: the browser's `navigator.geolocation`, with a ZIP code / town search as a fallback.
- Distance: the Haversine formula, written in JavaScript.
- Hosting: GitHub Pages.
- I test locally with the VS Code Live Server extension.

## File structure
```
index.html        — page structure
style.css         — all styling
app.js            — all app logic
data/clinics.json — the clinic list
data/raw/         — original downloaded source files (not used by the app directly)
scripts/          — helper scripts for cleaning data (JavaScript only)
README.md         — project description for judges
```

## Clinic data format
Each entry in `data/clinics.json` should look like this:
```json
{
  "name": "Example Clinic",
  "type": "urgent_care",
  "address": "123 Main St, Concord, NH 03301",
  "lat": 43.2081,
  "lng": -71.5376,
  "phone": "603-555-0100",
  "hours": "Mon-Fri 8am-8pm, Sat-Sun 9am-5pm",
  "website": "https://example.com",
  "cost": "Accepts uninsured / sliding scale",
  "source": "Where this entry came from",
  "last_verified": "2026-10-01"
}
```
Allowed values for `type`: `urgent_care`, `free_clinic`, `health_center` (sliding-scale / FQHC).

## Important rules
- **Never invent clinic names, addresses, phone numbers, or hours.** Every location
  must come from a real source file I provide. If data is missing, leave the field
  empty and tell me. This is a medical app, and wrong information could hurt someone.
- **Always show an emergency banner** at the top of the page telling users to call
  911 for emergencies like chest pain, trouble breathing, or stroke symptoms.
- **Do not store or send the user's location anywhere.** Use it only in the browser
  to calculate distances.
- Make the app work well on phones first (most users will be on mobile).
- Follow basic accessibility: large tap targets, readable text, labels for screen readers,
  good color contrast.
- Use git. After each working feature, commit with a clear message describing the change.
- Before big changes, show me a plan and wait for my approval.

## Features (in priority order)
1. Map of New Hampshire showing all clinics as pins
2. "Find nearest" button using the user's location
3. List of the 10 nearest clinics, sorted by distance, with distance in miles
4. ZIP code / town search as a fallback
5. Tap-to-call and "Get directions" links
6. Filters: urgent care vs. free/low-cost
7. Emergency 911 banner (required from the start)
8. Stretch goals if time allows: "open now" indicator, "report incorrect info" link
