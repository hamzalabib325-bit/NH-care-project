const fs = require("node:fs/promises");
const path = require("node:path");

const APD_EXPRESS_CARE_SOURCE = "https://www.alicepeckday.org/services/express-care";
const EXPRESSMED_SOURCE = "https://expressmednh.com/";

function hasCoordinates(clinic) {
  return Number.isFinite(clinic.lat) && Number.isFinite(clinic.lng);
}

function normalizeAddress(address) {
  const parts = String(address ?? "")
    .toUpperCase()
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (/^\d{5}(?:-?\d{4})?$/.test(parts.at(-1) ?? "")) {
    parts.pop();
  }

  return parts
    .map((part) => part
      .replace(/\b(?:SUITE|STE|UNIT|APT|APARTMENT|#)\s*[A-Z0-9-]+\b/g, "")
      .replace(/\bROAD\b/g, "RD")
      .replace(/\bSTREET\b/g, "ST")
      .replace(/\bHIGHWAY\b/g, "HWY")
      .replace(/\bROUTE\b/g, "RTE")
      .replace(/[^A-Z0-9]/g, ""))
    .join(",");
}

function reviewItem(clinic, reason, remainsInClinics = true, sourceUrl = "") {
  return {
    name: clinic.name,
    type: clinic.type,
    address: clinic.address,
    phone: clinic.phone,
    source: clinic.source,
    verification_source_url: sourceUrl,
    status: "needs_review",
    remains_in_clinics: remainsInClinics,
    reason
  };
}

function createClinic(name, type, address, lat, lng, phone, hours, source) {
  const website = source.split(" (", 1)[0];
  return {
    name,
    type,
    address,
    lat,
    lng,
    phone,
    hours,
    website,
    cost: "",
    source,
    last_verified: ""
  };
}

async function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const clinicsPath = path.join(projectRoot, "data", "clinics.json");
  const checklistPath = path.join(projectRoot, "data", "to-verify.json");
  const clinics = JSON.parse(await fs.readFile(clinicsPath, "utf8"));

  if (!Array.isArray(clinics)) {
    throw new Error("data/clinics.json must contain an array of clinic records.");
  }
  if (await fs.access(checklistPath).then(() => true, () => false)) {
    throw new Error("data/to-verify.json already exists; review it before replacing it.");
  }

  const checklist = [];
  const removedCounts = { out_of_state: 0, school_sites: 0, mobile_sites: 0, administrative_sites: 0, dental_sites: 0 };
  const schoolAddressesUnderReview = new Set();

  for (const clinic of clinics) {
    if (/ELEMENTARY|MIDDLE SCHOOL|HIGH SCHOOL|ACADEMY|SCHOOL/i.test(clinic.name)) {
      const addressKey = normalizeAddress(clinic.address);
      if (!schoolAddressesUnderReview.has(addressKey)) {
        checklist.push(reviewItem(
          clinic,
          "School-named health center; confirm whether it is open to the general public before removing it.",
          true
        ));
        schoolAddressesUnderReview.add(addressKey);
      }
    }

    if (/SEACOAST BUSINESS & HEALTH CLINIC/i.test(clinic.name)) {
      checklist.push(reviewItem(
        clinic,
        "Urgent care is believed to be real, but the listed 396 High St address is associated with permanently closed Seacoast Redicare. Current patient-facing address is unverified.",
        false,
        "https://www.bing.com/search?q=Seacoast+Redicare+Somersworth+NH+urgent+care+address"
      ));
    }

    if (clinic.name === "HealthFirst - Franklin HQ") {
      checklist.push(reviewItem(clinic, "Confirm whether this headquarters address is open to patients."));
    } else if (clinic.name === "Manchester Mobile Health Care") {
      checklist.push(reviewItem(clinic, "Confirm whether patients can visit this fixed address or whether care is mobile."));
    } else if (clinic.name === "Project Drive") {
      checklist.push(reviewItem(clinic, "Confirm whether this seasonal site is school-restricted before listing publicly."));
    } else if (/^(?:AMERICAN CURRENT CARE P\.A\.|OCCUPATIONAL HEALTH CENTERS OF THE SOUTHWEST P\.A\.)$/i.test(clinic.name)
      && /156 HARVEY/i.test(clinic.address)) {
      checklist.push(reviewItem(clinic, "Confirm the current patient-facing urgent-care identity and address for this NPI record."));
    } else if (/^(?:APPOLIC LLC|GORRYN LLC|KORRYN LLC)$/i.test(clinic.name)) {
      checklist.push(reviewItem(clinic, "Confirm that this NPI entity operates a public walk-in clinic at this suite."));
    } else if (clinic.name === "FRISBIE MEMORIAL HOSPITAL") {
      checklist.push(reviewItem(clinic, "Confirm this is a separate urgent-care service, not the hospital emergency department."));
    } else if (clinic.name === "ELLIOT PHYSICIANS NETWORK") {
      checklist.push(reviewItem(clinic, "Confirm whether this address is a patient-facing urgent-care clinic."));
    }
  }

  let curated = clinics.filter((clinic) => {
    if (clinic.name === "CLEARCHOICEMD, PLLC" && /BERLIN, VT/i.test(clinic.address)) {
      removedCounts.out_of_state += 1;
      return false;
    }
    if (clinic.name === "VITALCARE HEALTH SERVICES PC" && /LEHI, UT/i.test(clinic.address)) {
      removedCounts.out_of_state += 1;
      return false;
    }
    if ([
      "Harbor Care Health and Wellness Center Mobile Unit 1",
      "Lamprey Health Care Mobile Health Unit",
      "Mobile Van 1"
    ].includes(clinic.name)) {
      removedCounts.mobile_sites += 1;
      return false;
    }
    if (["Lamprey Health Care - Administration II", "Harbor Homes, Inc. Headquarters"].includes(clinic.name)) {
      removedCounts.administrative_sites += 1;
      return false;
    }
    if (["Mid-State Health Center - Littleton Dental Clinic", "Coos County Family Dental - Colebrook Site"].includes(clinic.name)) {
      removedCounts.dental_sites += 1;
      return false;
    }
    if (/SEACOAST BUSINESS & HEALTH CLINIC/i.test(clinic.name)) return false;
    if (/ALICE PECK DAY MEMORIAL HOSPITAL/i.test(clinic.name)) return false;
    if (/^(?:EXPRESSMED|EXPRESSMED, LLC|EXPRESS MED AT SALEM, LLC)$/i.test(clinic.name)) return false;
    return true;
  });

  const apdSourceRecord = clinics.find((clinic) =>
    /ALICE PECK DAY MEMORIAL HOSPITAL/i.test(clinic.name)
    && /5 ALICE PECK DAY DR/i.test(clinic.address)
  );
  if (apdSourceRecord) {
    curated.push(createClinic(
      "Alice Peck Day Express Care",
      "urgent_care",
      "5 Alice Peck Day Drive, Lebanon, NH 03766",
      apdSourceRecord.lat,
      apdSourceRecord.lng,
      "603-308-0055",
      "Mon-Fri 8:00 AM-8:00 PM; Sat-Sun 9:00 AM-3:00 PM",
      APD_EXPRESS_CARE_SOURCE
    ));
  }

  const salemRecord = clinics.find((clinic) =>
    /^EXPRESS MED AT SALEM, LLC$/i.test(clinic.name)
    && /159 N(?:ORTH)? BROADWAY/i.test(clinic.address)
  );
  const expressLocations = [
    createClinic(
      "ExpressMED",
      "urgent_care",
      "35 Kosciuszko St, Manchester, NH 03101",
      null,
      null,
      "603-627-8053",
      "Monday, Wednesday, Thursday, Friday 8:00 AM-6:00 PM; Tuesday 1:00 PM-6:00 PM; closed Saturday and Sunday",
      `${EXPRESSMED_SOURCE} (hours supplied by user)`
    ),
    createClinic(
      "ExpressMED",
      "urgent_care",
      "159 N Broadway, Salem, NH 03079",
      salemRecord?.lat ?? null,
      salemRecord?.lng ?? null,
      "603-898-0961",
      "Monday-Friday 8:00 AM-6:00 PM; Saturday 9:00 AM-4:00 PM; closed Sunday",
      `${EXPRESSMED_SOURCE} (hours supplied by user)`
    )
  ];
  curated.push(...expressLocations);

  const convenientEntries = curated.filter((clinic) => /^CONVENIENTMD/i.test(clinic.name));
  curated = curated.filter((clinic) => !/^CONVENIENTMD/i.test(clinic.name));
  const convenientGroups = new Map();

  for (const clinic of convenientEntries) {
    const key = normalizeAddress(clinic.address);
    const group = convenientGroups.get(key) ?? [];
    group.push(clinic);
    convenientGroups.set(key, group);
  }

  const convenientMissingCoordinates = [];
  for (const entries of convenientGroups.values()) {
    const coordinateEntry = entries.find(hasCoordinates);
    const preferredEntry = coordinateEntry ?? entries[0];
    const phones = [...new Set(entries.map((entry) => entry.phone).filter(Boolean))];
    const merged = {
      ...preferredEntry,
      name: "ConvenientMD",
      lat: coordinateEntry?.lat ?? null,
      lng: coordinateEntry?.lng ?? null,
      phone: phones.length === 1 ? phones[0] : "",
      source: "NPPES NPI Registry API v2.1"
    };

    if (phones.length > 1) {
      checklist.push(reviewItem(merged, `NPI records at this location list conflicting phone numbers: ${phones.join("; ")}.`));
    }
    curated.push(merged);
    if (!hasCoordinates(merged)) {
      convenientMissingCoordinates.push({ name: merged.name, address: merged.address });
    }
  }

  const checklistFile = {
    description: "Clinics and source records awaiting human verification.",
    items: checklist
  };

  await fs.writeFile(clinicsPath, `${JSON.stringify(curated, null, 2)}\n`, "utf8");
  await fs.writeFile(checklistPath, `${JSON.stringify(checklistFile, null, 2)}\n`, "utf8");

  console.log(`Saved ${curated.length} curated clinic records to data/clinics.json.`);
  console.log("Removed records:", JSON.stringify(removedCounts));
  console.log(`Added ${checklist.length} verification checklist items to data/to-verify.json.`);
  console.log("ConvenientMD locations still missing coordinates:");
  for (const location of convenientMissingCoordinates) {
    console.log(`- ${location.address}`);
  }
}


    const bakersvilleRows = curated.filter((clinic) =>
      clinic.name === "Amoskeag Health at Bakersville Elementary School"
    );
    if (bakersvilleRows.length > 1) {
      const phoneNumbers = [...new Set(bakersvilleRows.map((clinic) => clinic.phone).filter(Boolean))];
      const weeklyHours = [...new Set(bakersvilleRows.map((clinic) => clinic.hours).filter(Boolean))];
      const mergedBakersville = {
        ...bakersvilleRows[0],
        phone: phoneNumbers.length === 1 ? phoneNumbers[0] : "",
        hours: weeklyHours.length === 1 ? weeklyHours[0] : "",
        website: bakersvilleRows.find((clinic) => clinic.website)?.website ?? ""
      };
      curated = curated.filter((clinic) =>
        clinic.name !== "Amoskeag Health at Bakersville Elementary School"
      );
      curated.push(mergedBakersville);
    }
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});