const fs = require("node:fs/promises");
const path = require("node:path");

const API_URL = "https://npiregistry.cms.hhs.gov/api/";
const TAXONOMY_CODE = "261QU0200X";
const PAGE_SIZE = 200;
const MAX_RECORDS = 1200;
const HEALTH_CENTER_CSV = "Health_Center_Service_Delivery_and_LookAlike_Sites.csv";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (insideQuotes) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        insideQuotes = false;
      } else {
        value += character;
      }
    } else if (character === '"' && value.length === 0) {
      insideQuotes = true;
    } else if (character === ",") {
      row.push(value.trim());
      value = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value.trim());
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (insideQuotes) {
    throw new Error("The health center CSV contains an unfinished quoted field.");
  }
  if (value.length > 0 || row.length > 0) {
    row.push(value.trim());
    rows.push(row);
  }

  const headers = rows.shift()?.map((header, index) =>
    (index === 0 ? header.replace(/^\uFEFF/, "") : header).trim()
  );
  if (!headers?.length) {
    throw new Error("The health center CSV is empty or has no header row.");
  }

  return rows
    .filter((cells) => cells.some((cell) => cell.length > 0))
    .map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])));
}

function makeAddress(parts) {
  return parts.filter(Boolean).join(", ");
}

function parseCoordinate(value) {
  if (!value) return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

function makeHealthCenterClinic(row) {
  const weeklyHours = row["Operating Hours per Week"];

  return {
    name: row["Site Name"],
    type: "health_center",
    address: makeAddress([
      row["Site Address"],
      row["Site City"],
      row["Site State Abbreviation"],
      row["Site Postal Code"]
    ]),
    lat: parseCoordinate(row["Geocoding Artifact Address Primary Y Coordinate"]),
    lng: parseCoordinate(row["Geocoding Artifact Address Primary X Coordinate"]),
    phone: row["Site Telephone Number"],
    hours: weeklyHours ? `${weeklyHours} hours per week` : "",
    website: row["Site Web Address"],
    cost: "",
    source: HEALTH_CENTER_CSV,
    last_verified: ""
  };
}

function makeUrgentCareClinic(record) {
  const location = record.addresses?.find((address) => address.address_purpose === "LOCATION") ?? {};
  const phone = location.telephone_number
    ?? record.addresses?.find((address) => address.telephone_number)?.telephone_number
    ?? "";

  return {
    name: record.basic?.organization_name ?? "",
    type: "urgent_care",
    address: makeAddress([
      location.address_1,
      location.address_2,
      location.city,
      location.state,
      location.postal_code
    ]),
    lat: null,
    lng: null,
    phone,
    hours: "",
    website: "",
    cost: "",
    source: "NPPES NPI Registry API v2.1",
    last_verified: ""
  };
}

async function readActiveNewHampshireSites(projectRoot) {
  const csvPath = path.join(projectRoot, "data", "raw", HEALTH_CENTER_CSV);
  const csvText = await fs.readFile(csvPath, "utf8");
  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    throw new Error("The health center CSV has no data rows.");
  }

  const requiredColumns = [
    "Site Name",
    "Site Address",
    "Site City",
    "Site State Abbreviation",
    "Site Postal Code",
    "Site Telephone Number",
    "Site Web Address",
    "Geocoding Artifact Address Primary Y Coordinate",
    "Geocoding Artifact Address Primary X Coordinate",
    "Site Status Description",
    "Operating Hours per Week"
  ];
  const missingColumns = requiredColumns.filter((column) => !(column in rows[0]));
  if (missingColumns.length > 0) {
    throw new Error(`Health center CSV is missing columns: ${missingColumns.join(", ")}`);
  }

  return rows.filter((row) =>
    row["Site State Abbreviation"].toUpperCase() === "NH"
    && row["Site Status Description"].toLowerCase() === "active"
  );
}

async function main() {
  const records = [];
  let apiResultCount = 0;

  // The API allows 200 results per request and skips up to 1,000 records.
  for (let skip = 0; skip < MAX_RECORDS; skip += PAGE_SIZE) {
    const parameters = new URLSearchParams({
      version: "2.1",
      state: "NH",
      address_purpose: "LOCATION",
      taxonomy_description: "Urgent Care",
      enumeration_type: "NPI-2",
      limit: String(PAGE_SIZE),
      skip: String(skip)
    });

    const response = await fetch(`${API_URL}?${parameters}`);
    if (!response.ok) {
      throw new Error(`NPI Registry request failed: ${response.status} ${response.statusText}`);
    }

    const page = await response.json();
    if (page.Errors) {
      const message = page.Errors.map((error) => error.description).join("; ");
      throw new Error(`NPI Registry returned an error: ${message}`);
    }

    const pageRecords = page.results ?? [];
    apiResultCount = page.result_count ?? 0;
    records.push(...pageRecords);

    if (pageRecords.length === 0 || skip + pageRecords.length >= apiResultCount) {
      break;
    }
  }

  // The API searches by taxonomy description, so match the exact code locally.
  const matchingRecords = records.filter((record) =>
    record.taxonomies?.some((taxonomy) => taxonomy.code === TAXONOMY_CODE)
  );

  const output = {
    source: "NPPES NPI Registry API v2.1",
    retrieved_at: new Date().toISOString(),
    query: {
      state: "NH",
      address_purpose: "LOCATION",
      taxonomy_description: "Urgent Care",
      enumeration_type: "NPI-2",
      taxonomy_code: TAXONOMY_CODE
    },
    api_result_count: apiResultCount,
    matching_record_count: matchingRecords.length,
    truncated: apiResultCount > records.length,
    results: matchingRecords
  };

  const projectRoot = path.resolve(__dirname, "..");
  const outputPath = path.join(projectRoot, "data", "raw", "npi-urgent-care.json");
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(`Saved ${matchingRecords.length} matching records to ${outputPath}`);
  if (output.truncated) {
    console.warn("The API's 1,200-record maximum was reached; the saved results may be incomplete.");
  }

  const activeNewHampshireSites = await readActiveNewHampshireSites(projectRoot);
  const clinics = [
    ...activeNewHampshireSites.map(makeHealthCenterClinic),
    ...matchingRecords.map(makeUrgentCareClinic)
  ];
  const clinicsPath = path.join(projectRoot, "data", "clinics.json");

  await fs.writeFile(clinicsPath, `${JSON.stringify(clinics, null, 2)}\n`, "utf8");
  console.log(`Saved ${activeNewHampshireSites.length} active NH health center sites and ${matchingRecords.length} urgent-care organizations (${clinics.length} total) to ${clinicsPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});