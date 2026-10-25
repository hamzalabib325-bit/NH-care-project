# NH Care Finder

**Find free and low-cost health care in New Hampshire, and know what you might pay before you go.**

Many people put off seeing a doctor because they are worried about the cost. NH Care Finder helps people in New Hampshire find the closest free clinics, community health centers, and urgent care centers, and shows which ones are the best fit for their budget.

Built for the 2026 Congressional App Challenge.

## What it does

- **Map:** every clinic in the app appears as a color-coded pin on a map of New Hampshire. Tap a pin to see the clinic's address, hours, phone number, website, and a "Get directions" link.
- **Find care near me:** tap "Near me" to use your location, or search by any New Hampshire ZIP code or town. The map zooms to the closest clinics.
- **Filters:** show or hide free clinics, health centers, and urgent care.
- **Services:** each clinic lists the services its source data confirms, such as primary care, dental care, walk-ins, or school-based care.
- **Cost helper:** answer four quick questions (insurance, household size, income, and location). The app ranks nearby clinics as *Best fit*, *Call to check cost*, or *Likely costly*, explains why, and points out programs you may qualify for, such as NH Medicaid.
- **More help:** 2-1-1, NH Medicaid sign-up, and mobile health programs.
- **911 banner:** every page reminds people to call 911 in an emergency.

## Privacy

Your location and your answers are used only inside your own browser to measure distances and rank clinics. Nothing is saved or sent anywhere. There are no accounts, cookies, or tracking.

## Where the data comes from

| Data | Source |
| --- | --- |
| Community health centers | U.S. Health Resources and Services Administration (HRSA), Health Center Service Delivery and Look-Alike Sites |
| Urgent care centers | NPPES NPI Registry, plus providers' own websites |
| Free clinics and mobile programs | Providers' own websites |
| Town and ZIP code locations | U.S. Census Bureau 2024 Gazetteer files |
| Cost rules | 2026 HHS Poverty Guidelines; HRSA sliding-fee discount requirements; NH DHHS Medicaid (Granite Advantage) income limit |
| Map | © OpenStreetMap contributors, displayed with Leaflet |

The cost helper never guesses at prices. It only uses published rules, such as the requirement that federally funded health centers offer income-based discounts, and it always tells people to call ahead to confirm.

## How it's built

Plain HTML, CSS, and JavaScript, with no frameworks and no server. Clinic data lives in `data/clinics.json`. Hosted on GitHub Pages.

| File | What it is |
| --- | --- |
| `index.html` | Home page |
| `map.html`, `map.js` | Map page |
| `cost.html`, `cost.js` | Cost helper page |
| `help.html` | More help page |
| `about.html` | About, privacy, and data sources |
| `common.js` | Code shared by the map and cost pages (distances, search, clinic links) |
| `style.css` | Styling for every page |
| `data/` | Clinic list (`clinics.json`) and town/ZIP locations (`places.json`); original source files are in `data/raw/` |
| `scripts/` | Helper scripts used to clean and check the data |

To run it locally, open the folder in VS Code and start the Live Server extension.
