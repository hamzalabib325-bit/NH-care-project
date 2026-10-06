const fs = require("node:fs/promises");
const path = require("node:path");

const CENSUS_GEOCODER_URL = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";
const BENCHMARK = "Public_AR_Current";
const REQUEST_DELAY_MS = 250;

function hasCoordinates(clinic) {
  return Number.isFinite(clinic.lat) && Number.isFinite(clinic.lng);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function normalizeAddressForGeocoder(address) {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  const street = parts.shift() ?? "";
  const locationParts = parts.filter((part) =>
    !/^(?:SUITE|STE|UNIT|APARTMENT|APT|#)\b/i.test(part)
  );
  const postalIndex = locationParts.length - 1;

  if (postalIndex >= 0) {
    const postalCode = locationParts[postalIndex].replace(/\D/g, "");
    if (postalCode.length >= 5) {
      locationParts[postalIndex] = postalCode.slice(0, 5);
    }
  }

  const normalizedStreet = street
    .replace(/\b(?:SUITE|STE|UNIT|APARTMENT|APT|#)\s*[A-Z0-9-]+\b/gi, "")
    .replace(/\bDW\s+HWY\b/gi, "Daniel Webster Highway")
    .replace(/\bNH\s*[- ]\s*104\b/gi, "Route 104")
    .replace(/\s+/g, " ")
    .trim();

  return [normalizedStreet, ...locationParts].filter(Boolean).join(", ");
}

async function findAddressMatch(address) {
  const parameters = new URLSearchParams({
    address,
    benchmark: BENCHMARK,
    format: "json"
  });
  const response = await fetch(`${CENSUS_GEOCODER_URL}?${parameters}`, {
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error(`Census Geocoder request failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  return result.result?.addressMatches ?? [];
}

async function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const clinicsPath = path.join(projectRoot, "data", "clinics.json");
  const unmatchedPath = path.join(projectRoot, "data", "raw", "census-geocoder-unmatched.json");
  const clinics = JSON.parse(await fs.readFile(clinicsPath, "utf8"));

  if (!Array.isArray(clinics)) {
    throw new Error("data/clinics.json must contain an array of clinic records.");
  }

  const clinicsNeedingCoordinates = clinics.filter((clinic) => !hasCoordinates(clinic));
  const unmatched = [];
  let matchedCount = 0;

  for (let index = 0; index < clinicsNeedingCoordinates.length; index += 1) {
    const clinic = clinicsNeedingCoordinates[index];
    const address = clinic.address?.trim();

    if (!address) {
      unmatched.push({ name: clinic.name, address: "", reason: "No address was provided." });
      continue;
    }

    try {
      const geocodingAddress = normalizeAddressForGeocoder(address);
      const matches = await findAddressMatch(geocodingAddress);

      if (matches.length === 0) {
        unmatched.push({ name: clinic.name, address, geocoding_address: geocodingAddress, reason: "The Census Geocoder returned no matches." });
      } else if (matches.length > 1) {
        unmatched.push({ name: clinic.name, address, geocoding_address: geocodingAddress, reason: `The Census Geocoder returned ${matches.length} matches; left unresolved to avoid choosing one arbitrarily.` });
      } else {
        const match = matches[0];
        const matchState = match.addressComponents?.state;
        const longitude = match.coordinates?.x;
        const latitude = match.coordinates?.y;

        if (matchState !== "NH") {
          unmatched.push({ name: clinic.name, address, geocoding_address: geocodingAddress, reason: `The only match was not confirmed as New Hampshire (state: ${matchState ?? "unknown"}).` });
        } else if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          unmatched.push({ name: clinic.name, address, geocoding_address: geocodingAddress, reason: "The Census Geocoder match did not include valid coordinates." });
        } else {
          clinic.lat = latitude;
          clinic.lng = longitude;
          matchedCount += 1;
        }
      }
    } catch (error) {
      unmatched.push({
        name: clinic.name,
        address,
        geocoding_address: normalizeAddressForGeocoder(address),
        reason: error.message
      });
    }

    if (index < clinicsNeedingCoordinates.length - 1) {
      await wait(REQUEST_DELAY_MS);
    }
  }

  const report = {
    source: "U.S. Census Geocoder",
    benchmark: BENCHMARK,
    created_at: new Date().toISOString(),
    unmatched_count: unmatched.length,
    unmatched
  };

  await fs.writeFile(clinicsPath, `${JSON.stringify(clinics, null, 2)}\n`, "utf8");
  await fs.writeFile(unmatchedPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`Added Census coordinates to ${matchedCount} of ${clinicsNeedingCoordinates.length} clinics.`);
  if (unmatched.length === 0) {
    console.log("All addresses were matched.");
  } else {
    console.log("Addresses needing review:");
    for (const item of unmatched) {
      console.log(`- ${item.name || "Unnamed clinic"}: ${item.address || "(missing address)"} (${item.reason})`);
    }
  }
  console.log(`Unmatched-address report: ${unmatchedPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});