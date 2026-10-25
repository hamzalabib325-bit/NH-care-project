const fs = require("node:fs/promises");
const path = require("node:path");

// Urgent care location pages that have a "Save Your Spot" / online check-in button,
// checked by hand on 2026-10-24. The app links to the clinic's own page (where the
// button is), not to the booking service behind it, so the link keeps working if the
// clinic changes booking companies.
const VERIFIED_ON = "2026-10-24";
const CHECK_IN_PAGES = [
  // ConvenientMD: "Save Your Spot" on every location page (same page template).
  "https://convenientmd.com/locations/concord-nh-urgent-care/",
  "https://convenientmd.com/locations/littleton-nh-urgent-care/",
  "https://convenientmd.com/locations/keene-nh-urgent-care/",
  "https://convenientmd.com/locations/manchester-nh-urgent-care/",
  "https://convenientmd.com/locations/windham-nh-urgent-care/",
  "https://convenientmd.com/locations/plaistow-nh-urgent-care/",
  "https://convenientmd.com/locations/nashua-nh-urgent-care/",
  "https://convenientmd.com/locations/bedford-nh-urgent-care/",
  "https://convenientmd.com/locations/stratham-nh-urgent-care/",
  "https://convenientmd.com/locations/belmont-nh-urgent-care/",
  "https://convenientmd.com/locations/portsmouth-nh-urgent-care/",
  "https://convenientmd.com/locations/merrimack-nh-urgent-care/",
  "https://convenientmd.com/locations/dover-nh-urgent-care/",
  "https://convenientmd.com/locations/londonderry-nh-urgent-care/",
  "https://convenientmd.com/locations/west-lebanon/",
  // ClearChoiceMD: "Save Your Spot in Line".
  "https://ccmdcenters.com/locations/goffstown-nh",
  "https://ccmdcenters.com/locations/plaistow-nh",
  "https://ccmdcenters.com/locations/alton-nh",
  "https://ccmdcenters.com/locations/epping-nh",
  "https://ccmdcenters.com/locations/gilford-nh",
  "https://ccmdcenters.com/locations/hooksett-nh",
  "https://ccmdcenters.com/locations/lebanon-nh",
  "https://ccmdcenters.com/locations/nashua-nh",
  "https://ccmdcenters.com/locations/rochester-nh",
  "https://ccmdcenters.com/locations/seabrook-nh",
  "https://ccmdcenters.com/locations/tilton-nh",
  // Elliot Urgent Care: "check in online" to reserve a place in line.
  "https://www.elliothospital.org/locations/elliot-urgent-care-rivers-edge",
  "https://www.elliothospital.org/locations/elliot-urgent-care-bedford",
  "https://www.elliothospital.org/locations/elliot-urgent-care-londonderry",
  // AFC Urgent Care: "Book Appointment" for walk-in visits.
  "https://www.afcurgentcare.com/hudson/",
  // MaineHealth: "Reserve your place in line".
  "https://www.mainehealth.org/services/walk-and-urgent-care/mainehealth-urgent-care-north-conway"
];

async function main() {
  const clinicsPath = path.join(__dirname, "..", "data", "clinics.json");
  const clinics = JSON.parse(await fs.readFile(clinicsPath, "utf8"));
  const pages = new Set(CHECK_IN_PAGES);
  const used = new Set();
  let added = 0;

  for (const clinic of clinics) {
    if (clinic.type === "urgent_care" && pages.has(clinic.website)) {
      clinic.check_in_url = clinic.website;
      clinic.check_in_verified = VERIFIED_ON;
      used.add(clinic.website);
      added += 1;
    }
  }

  await fs.writeFile(clinicsPath, `${JSON.stringify(clinics, null, 2)}\n`, "utf8");
  console.log(`Added check-in links to ${added} clinics.`);
  for (const page of CHECK_IN_PAGES.filter((page) => !used.has(page))) {
    console.log("No clinic uses this page:", page);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
