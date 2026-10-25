const fs = require("node:fs/promises");
const path = require("node:path");

// Adds a "services" list to each clinic, using only what the source data says.
// None of the sources list every service a clinic offers, so this stays small on
// purpose. Each tag comes from one of these:
// - HRSA health center sites: every "Service Delivery Site" offers primary care.
//   The site's "Location Setting" (School, Nursing Home) and "Location Type"
//   (Mobile Van) say who the site serves and where.
// - Health Care for the Homeless sites: the HRSA site name says HCH, shelter, or soup kitchen.
// - Urgent care (NPI taxonomy "Clinic/Center, Urgent Care") and "Express Care"
//   sites take walk-in patients.
// - Free clinics: the provider's own page (see each clinic's source).
//
// Run after the clinic list changes:  node scripts/add-services.js
//
// Service tags (labels are in common.js):
//   primary_care, dental, walk_in, school_based, nursing_home, mobile, homeless

const HRSA_CSV = path.join(__dirname, "..", "data", "raw", "Health_Center_Service_Delivery_and_LookAlike_Sites.csv");

// Free clinics, from each provider's own page (checked 2026-10-06, see source in clinics.json).
const FREE_CLINIC_SERVICES = {
  "Good Neighbor Health Clinic": ["primary_care"],
  "Red Logan Dental Clinic": ["dental"]
};

// Split one CSV line, keeping commas inside quoted fields.
function parseCsvLine(line) {
  const fields = [];
  let field = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      fields.push(field);
      field = "";
    } else {
      field += char;
    }
  }
  fields.push(field);
  return fields;
}

async function loadHrsaSites() {
  const lines = (await fs.readFile(HRSA_CSV, "utf8")).split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const fields = parseCsvLine(line);
    return Object.fromEntries(header.map((name, i) => [name, fields[i]]));
  }).filter((site) => site["Site State Abbreviation"] === "NH");
}

// Match a clinic to its HRSA row by site name and street address.
function findHrsaSite(sites, clinic) {
  const street = (address) => address.split(",")[0].trim().toLowerCase();
  return sites.find((site) =>
    site["Site Name"] === clinic.name && street(site["Site Address"]) === street(clinic.address)
  );
}

function healthCenterServices(site) {
  const services = [];
  if (site["Health Center Type Description"].includes("Service Delivery Site")) {
    services.push("primary_care");
  }
  if (/\bHCH\b|shelter|soup kitchen/i.test(site["Site Name"])) {
    services.push("homeless");
  }
  if (/express care/i.test(site["Site Name"])) {
    services.push("walk_in");
  }
  const setting = site["Health Center Service Delivery Site Location Setting Description"];
  if (setting === "School") {
    services.push("school_based");
  } else if (setting === "Nursing Home") {
    services.push("nursing_home");
  }
  if (site["Health Center Location Type Description"] === "Mobile Van") {
    services.push("mobile");
  }
  return services;
}

async function main() {
  const clinicsPath = path.join(__dirname, "..", "data", "clinics.json");
  const clinics = JSON.parse(await fs.readFile(clinicsPath, "utf8"));
  const sites = await loadHrsaSites();
  const counts = {};

  for (const clinic of clinics) {
    let services = [];
    if (clinic.type === "health_center") {
      const site = findHrsaSite(sites, clinic);
      if (site) {
        services = healthCenterServices(site);
      } else {
        console.log("No HRSA site matches:", clinic.name, "-", clinic.address);
      }
    } else if (clinic.type === "urgent_care") {
      services = ["walk_in"];
    } else if (clinic.type === "free_clinic") {
      services = FREE_CLINIC_SERVICES[clinic.name] ?? [];
    }

    if (services.length > 0) {
      clinic.services = services;
    } else {
      delete clinic.services;
    }
    for (const service of services) {
      counts[service] = (counts[service] ?? 0) + 1;
    }
  }

  await fs.writeFile(clinicsPath, `${JSON.stringify(clinics, null, 2)}\n`, "utf8");
  console.log("Clinics with each service:", counts);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
