// Cost helper page logic. Shared helpers (findPlace, clinicLinks, distanceMiles, ...) live in common.js.
// Nothing typed on this page is saved or sent anywhere; it is only used in this browser.

// 2026 HHS poverty guidelines for the 48 contiguous states, by household size.
// Source: https://aspe.hhs.gov/topics/poverty-economic-mobility/poverty-guidelines
const POVERTY_GUIDELINES_2026 = [15960, 21640, 27320, 33000, 38680, 44360, 50040, 55720];
const EXTRA_PERSON_2026 = 5680;

function povertyGuideline(householdSize) {
  if (householdSize <= POVERTY_GUIDELINES_2026.length) {
    return POVERTY_GUIDELINES_2026[householdSize - 1];
  }
  return POVERTY_GUIDELINES_2026.at(-1) + (householdSize - POVERTY_GUIDELINES_2026.length) * EXTRA_PERSON_2026;
}

// Federally funded health centers must give a sliding-fee discount to patients at or
// below 200% of the poverty guideline, with the full discount at or below 100%
// (HRSA Health Center Program requirements).
const FULL_DISCOUNT_PERCENT = 100;
const SLIDING_FEE_LIMIT_PERCENT = 200;

// NH Medicaid (Granite Advantage) covers adults up to 138% of the poverty guideline.
// Source: NH DHHS; apply at NH EASY.
const MEDICAID_ADULT_LIMIT_PERCENT = 138;

// How well each clinic fits someone's costs. "rank" decides the order on the page.
const FIT_LEVELS = {
  good: { rank: 0, label: t("Best fit"), heading: t("Best fit for your costs") },
  check: { rank: 1, label: t("Call to check cost"), heading: t("Call first to check the cost") },
  costly: { rank: 2, label: t("Likely costly"), heading: t("Likely to cost more") }
};

const INSURANCE_NAMES = { medicaid: "Medicaid", medicare: "Medicare" };

// Decide how good a fit a clinic is, with a short reason in plain language.
// povertyPercent is null when the user chose not to share their income.
function costFit(clinic, insurance, povertyPercent) {
  const uninsured = insurance === "none" || insurance === "unsure";
  const lowIncome = povertyPercent !== null && povertyPercent <= SLIDING_FEE_LIMIT_PERCENT;

  if (clinic.type === "free_clinic") {
    return uninsured
      ? { level: "good", reason: t("Free care. Call to ask whether you qualify and how to get an appointment.") }
      : { level: "check", reason: t("Free clinics often focus on people without insurance. Call to ask if they can see you.") };
  }

  // A sliding-scale clinic that isn't federally funded (like a hospital clinic) has no
  // required discount rules, so we only repeat what its own listing says.
  if (clinic.type === "health_center" && clinic.federally_funded === false) {
    if (insurance === "medicaid" || insurance === "medicare") {
      return { level: "good", reason: t("Listed as accepting {insurance}. Call to confirm before your visit.", { insurance: INSURANCE_NAMES[insurance] }) };
    }
    return { level: "check", reason: t("Offers sliding-scale fees based on income. Call to ask what you would pay.") };
  }

  if (clinic.type === "health_center") {
    if (insurance === "medicaid" || insurance === "medicare") {
      return { level: "good", reason: t("Community health centers accept {insurance}.", { insurance: INSURANCE_NAMES[insurance] }) };
    }
    if (lowIncome) {
      return { level: "good", reason: t("At your income, health centers must offer you a discount on their fees.") };
    }
    if (povertyPercent === null) {
      return { level: "check", reason: t("Fees are based on income. Bring proof of income to ask for a discount.") };
    }
    return uninsured
      ? { level: "check", reason: t("At your income you may pay full price, but health centers can't turn you away because you can't pay.") }
      : { level: "check", reason: t("Accepts many insurance plans. Call to check that yours is accepted.") };
  }

  if (clinic.type === "urgent_care") {
    if (uninsured) {
      return { level: "costly", reason: t("Without insurance you will likely pay full price. Ask for the self-pay price before your visit.") };
    }
    if (insurance === "private") {
      return { level: "check", reason: t("Most insurance plans cover urgent care with a copay. Check that it's in your plan's network.") };
    }
    return { level: "check", reason: t("Many urgent care centers accept {insurance}, but not all. Call to check.", { insurance: INSURANCE_NAMES[insurance] }) };
  }

  return { level: "check", reason: t("Call to ask about costs before your visit.") };
}

// Tips shown above the clinic list, based on the answers.
function costTips(insurance, povertyPercent) {
  const tips = [];
  const uninsured = insurance === "none" || insurance === "unsure";
  const hasPublicCoverage = insurance === "medicaid" || insurance === "medicare";

  // Sliding-fee discounts matter most to people paying out of their own pocket.
  if (povertyPercent !== null && !hasPublicCoverage) {
    if (povertyPercent <= FULL_DISCOUNT_PERCENT) {
      tips.push(t("At your income, community health centers must give you their largest discount. You may only pay a small fee."));
    } else if (povertyPercent <= SLIDING_FEE_LIMIT_PERCENT) {
      tips.push(t("At your income, community health centers must give you a partial discount based on what you earn."));
    } else {
      tips.push(t("Your income is above the level for health center discounts, so you may be charged their regular price."));
    }
  }

  if (uninsured && povertyPercent !== null && povertyPercent <= MEDICAID_ADULT_LIMIT_PERCENT) {
    tips.push({
      text: t("You may qualify for NH Medicaid, which offers free or low-cost health coverage. Apply anytime at "),
      link: { href: "https://nheasy.nh.gov/", text: "NH EASY" },
      after: t(" or call 1-844-275-3447.")
    });
  } else if (uninsured) {
    tips.push({
      text: t("Children can qualify for NH Medicaid at higher incomes than adults. Check at "),
      link: { href: "https://nheasy.nh.gov/", text: "NH EASY" },
      after: "."
    });
  }

  if (uninsured) {
    tips.push(t("If you are 65 or older, you may qualify for Medicare."));
  }

  if (insurance === "private") {
    tips.push({
      text: t("Compare what your insurance plan pays at different places with "),
      link: { href: "https://nhhealthcost.nh.gov/", text: "NH HealthCost" },
      after: t(", the state's official price tool.")
    });
  }

  // Prescriptions. Medicare's Extra Help program is run by Social Security (ssa.gov).
  if (insurance === "medicare") {
    tips.push({
      text: t("If your income and savings are limited, Medicare's Extra Help program can lower your prescription costs. Apply at "),
      link: { href: "https://www.ssa.gov/medicare/part-d-extra-help", text: "SSA.gov" },
      after: t(" or call 1-800-772-1213.")
    });
  } else if (insurance !== "medicaid") {
    tips.push(t("Ask community health centers about lower-cost prescriptions. Many offer discounted medicines to their patients through a federal program called 340B."));
  }

  // Rides. Each NH Medicaid plan books rides to covered appointments; the numbers are on help.html.
  if (insurance === "medicaid") {
    tips.push({
      text: t("Need a ride? Your NH Medicaid plan may give you a free ride to medical appointments. Find your plan's ride number on "),
      link: { href: "help.html#rides", text: t("More help"), sameTab: true },
      after: "."
    });
  } else {
    tips.push({
      text: t("Need a ride? Dial 2-1-1 to ask about transportation programs near you, or see "),
      link: { href: "help.html#rides", text: t("More help"), sameTab: true },
      after: "."
    });
  }

  tips.push(t("Always call ahead and ask what your visit will cost. Prices here are a guide, not a quote."));
  return tips;
}

// --- Page set-up ---------------------------------------------------------

let clinics = [];
let places = [];
// Set when the user taps "Use my location"; cleared when they type a place instead.
let deviceSpot = null;

const form = document.getElementById("cost-form");
const placeInput = document.getElementById("cost-place");
const locationButton = document.getElementById("use-location");
const locationStatus = document.getElementById("location-status");
const incomeInput = document.getElementById("income");
const incomeSkip = document.getElementById("income-skip");
const formError = document.getElementById("form-error");
const results = document.getElementById("results");

// "I'd rather not say" turns off the income box.
incomeSkip.addEventListener("change", () => {
  incomeInput.disabled = incomeSkip.checked;
  if (incomeSkip.checked) {
    incomeInput.value = "";
  }
});

locationButton.addEventListener("click", () => {
  locationButton.disabled = true;
  locationStatus.textContent = t("Finding your location…");
  getUserLocation(
    (lat, lng) => {
      locationButton.disabled = false;
      deviceSpot = { lat, lng, label: t("your location") };
      placeInput.value = "";
      locationStatus.textContent = t("Using your current location.");
    },
    (message) => {
      locationButton.disabled = false;
      locationStatus.textContent = message;
    }
  );
});

placeInput.addEventListener("input", () => {
  if (deviceSpot) {
    deviceSpot = null;
    locationStatus.textContent = "";
  }
});

function showError(message, field) {
  formError.textContent = message;
  if (field) {
    field.focus();
  }
}

form.addEventListener("submit", (event) => {
  // Stop the browser from reloading the page when the form is sent.
  event.preventDefault();
  formError.textContent = "";

  const insurance = form.elements.insurance.value;
  if (!insurance) {
    showError(t("Please answer question 1: what insurance do you have?"), form.elements.insurance[0]);
    return;
  }

  const householdSize = Math.round(Number(form.elements.household.value));
  if (!(householdSize >= 1 && householdSize <= 20)) {
    showError(t("Please enter how many people live in your household (1 to 20)."), form.elements.household);
    return;
  }

  let povertyPercent = null;
  if (!incomeSkip.checked) {
    // Allow "$45,000" as well as "45000".
    const income = Number(incomeInput.value.replace(/[$,\s]/g, ""));
    if (incomeInput.value.trim() === "" || !(income >= 0)) {
      showError(t("Please enter your yearly household income, or check \"I'd rather not say\"."), incomeInput);
      return;
    }
    povertyPercent = (income / povertyGuideline(householdSize)) * 100;
  }

  let spot = deviceSpot;
  if (placeInput.value.trim()) {
    const place = findPlace(places, placeInput.value);
    if (!place) {
      showError(placeNotFoundMessage(placeInput.value), placeInput);
      return;
    }
    spot = { lat: place.lat, lng: place.lng, label: placeLabel(place) };
  }
  if (!spot) {
    showError(t("Please type your ZIP code or town, or tap \"Use my location\"."), placeInput);
    return;
  }

  showResults(insurance, povertyPercent, spot);
});

// --- Results -------------------------------------------------------------

const CLINICS_PER_GROUP = 3;

function showResults(insurance, povertyPercent, spot) {
  // Score every clinic, then keep the closest few in each fit group.
  const scored = clinics
    .filter((clinic) => Number.isFinite(clinic.lat) && Number.isFinite(clinic.lng))
    .map((clinic) => ({
      clinic,
      miles: distanceMiles(spot.lat, spot.lng, clinic.lat, clinic.lng),
      ...costFit(clinic, insurance, povertyPercent)
    }))
    .sort((a, b) => a.miles - b.miles);

  results.replaceChildren();

  const heading = document.createElement("h2");
  heading.textContent = t("Your options near {place}", { place: spot.label });
  heading.tabIndex = -1;
  results.append(heading);

  const tipList = document.createElement("ul");
  tipList.className = "tips";
  for (const tip of costTips(insurance, povertyPercent)) {
    const item = document.createElement("li");
    if (typeof tip === "string") {
      item.textContent = tip;
    } else {
      // Links to other sites open in a new tab; links to our own pages don't.
      item.append(tip.text, makeLink(tip.link.href, tip.link.text, !tip.link.sameTab), tip.after);
    }
    tipList.append(item);
  }
  results.append(tipList);

  for (const [level, info] of Object.entries(FIT_LEVELS)) {
    const group = scored.filter((entry) => entry.level === level).slice(0, CLINICS_PER_GROUP);
    if (!group.length) {
      continue;
    }
    const groupHeading = document.createElement("h3");
    groupHeading.className = `fit-heading fit-${level}`;
    groupHeading.textContent = info.heading;
    results.append(groupHeading);

    const list = document.createElement("ol");
    list.className = "result-list";
    for (const entry of group) {
      list.append(resultCard(entry, info));
    }
    results.append(list);
  }

  results.hidden = false;
  // Move focus to the results so screen readers announce them and phones scroll there.
  heading.focus();
}

function resultCard(entry, info) {
  const { clinic } = entry;
  const card = document.createElement("li");
  card.className = `result-card fit-${entry.level}`;

  const badge = document.createElement("span");
  badge.className = "fit-badge";
  badge.textContent = info.label;

  const name = document.createElement("strong");
  name.className = "result-name";
  name.textContent = displayName(clinic.name);

  const meta = document.createElement("p");
  meta.className = "result-meta";
  meta.textContent = t("{type} · {miles} miles away", { type: clinicType(clinic).label, miles: entry.miles.toFixed(1) });

  const reason = document.createElement("p");
  reason.textContent = entry.reason;

  const address = document.createElement("p");
  address.className = "result-address";
  address.textContent = displayAddress(clinic.address);
  card.append(badge, name, meta, reason, address);

  if (clinic.hours) {
    const hours = document.createElement("p");
    hours.className = "result-address";
    hours.textContent = t("Hours: {hours}", { hours: displayHours(clinic.hours) });
    card.append(hours);
  }

  for (const text of serviceLines(clinic)) {
    const line = document.createElement("p");
    line.className = "result-address";
    line.textContent = text;
    card.append(line);
  }

  const links = document.createElement("div");
  links.className = "result-links";
  // The map page reads lat and lng from the link, then zooms to this clinic's pin.
  links.append(
    makeLink(`map.html?lat=${clinic.lat}&lng=${clinic.lng}`, t("Show on map"), false),
    ...clinicLinks(clinic)
  );
  card.append(links);
  return card;
}

async function loadData() {
  try {
    [clinics, places] = await Promise.all([loadJson("data/clinics.json"), loadJson("data/places.json")]);
    fillTownSuggestions(places, "cost-town-list");
  } catch (error) {
    console.error("Could not load data:", error);
    formError.textContent = t("Sorry, the clinic list didn't load. Please refresh the page.");
  }
}

loadData();
