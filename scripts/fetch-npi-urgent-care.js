const fs = require("node:fs/promises");
const path = require("node:path");

const API_URL = "https://npiregistry.cms.hhs.gov/api/";
const TAXONOMY_CODE = "261QU0200X";
const PAGE_SIZE = 200;
const MAX_RECORDS = 1200;

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
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});