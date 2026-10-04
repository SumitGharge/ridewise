// ============================================================================
//  app.js — THE BRAIN 🧠   (this is where almost all the learning happens)
// ----------------------------------------------------------------------------
//  Read this file in sittings. Each SECTION is a small idea:
//    0. Helpers     — tiny tools every section uses (safety first)
//    1. Memory      — how the app remembers things after you close it
//    2. Math        — distance, time, and fare formulas
//    3. Learning    — how logged prices correct our estimates
//    4. Comparing   — build every option and rank them
//    5. Drawing     — turn numbers into things you can see
//    5B. Search     — type a place, get suggestions (like Uber/Ola)
//    6. Events      — react to taps, typing and sliding
//    7. Start       — switch the app on
// ============================================================================


// ============================================================================
//  SECTION 0 — HELPERS 🧰
// ============================================================================

// SECURITY: any text that came from OUTSIDE our code (the internet, the user,
// localStorage) must be "escaped" before it goes into innerHTML. Otherwise a
// place named  <img src=x onerror=alert(1)>  would run as code. This is called
// an XSS attack, and this one function blocks it.
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

// A unique id for each logged trip. randomUUID is ideal; old browsers fall back.
function makeId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Is it night-fare time right now? (Hours set in data.js)
function isNightNow() {
  const hour = new Date().getHours();
  return hour >= NIGHT_START && hour < NIGHT_END;
}


// ============================================================================
//  SECTION 1 — MEMORY 💾
//  localStorage = a small private drawer that survives closing the tab.
//  It can be locked (e.g. in a preview window), so we TEST it first and fall
//  back to temporary memory if locked.
// ============================================================================

const MEMORY_KEY = "ridewise.priceLog.v1";   // the drawer's label. v1 = version 1.

const storage = (function () {
  try {
    const testKey = "__ridewise_test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return {
      permanent: true,
      read: function (key) { return window.localStorage.getItem(key); },
      write: function (key, value) { window.localStorage.setItem(key, value); }
    };
  } catch (error) {
    let fakeDrawer = {};
    return {
      permanent: false,
      read: function (key) { return key in fakeDrawer ? fakeDrawer[key] : null; },
      write: function (key, value) { fakeDrawer[key] = value; }
    };
  }
})();

let priceLog = loadLog();

function loadLog() {
  const raw = storage.read(MEMORY_KEY);
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.map(upgradeEntry);           // make old entries fit the new shape
  } catch (error) {
    return [];                               // corrupted → start fresh, don't crash
  }
}

// DATA UPGRADE ("migration"): entries saved by the OLD version of the app don't
// have rawEstimate / surge. We fill in sensible values so nothing breaks.
function upgradeEntry(entry) {
  return {
    id: String(entry.id),                    // old ids were numbers → make strings
    at: entry.at,
    from: entry.from,
    to: entry.to,
    km: entry.km,
    app: entry.app,
    service: entry.service,
    productId: entry.productId,
    estimate: entry.estimate,                          // what we SHOWED
    rawEstimate: entry.rawEstimate || entry.estimate,  // formula only (no surge, no correction)
    surge: entry.surge || 1,
    actual: entry.actual
  };
}

function saveLog(log) {
  storage.write(MEMORY_KEY, JSON.stringify(log));
}

function commitLogChange() {
  saveLog(priceLog);
  drawLog();
  runComparison();     // prices may change now that we have new data
}


// ============================================================================
//  SECTION 2 — MATH 📐  (distance → time → money)
// ============================================================================

// Distance in km between two GPS points, as the crow flies (haversine formula).
function straightLineKm(a, b) {
  const EARTH_RADIUS_KM = 6371;
  const toRadians = function (degrees) { return degrees * Math.PI / 180; };

  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);

  const part1 =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(part1));
}

// ROAD_FACTOR lives in data.js now — it's a setting, not logic.
function roadKm(a, b) {
  return straightLineKm(a, b) * ROAD_FACTOR;
}

// How long the ride takes. Short trips crawl, long trips get a bit faster.
function rideMinutes(km) {
  let speedKmh = 12 + km * 0.8;
  if (speedKmh > 26) speedKmh = 26;   // cap: Mumbai is Mumbai
  return (km / speedKmh) * 60;
}

// The RAW rate-card price: base + km + min, floor, night charge.
// No surge, no learning. This is "what the formula alone believes".
function formulaFare(product, km, minutes, night) {
  let fare = product.base + (product.perKm * km) + (product.perMin * minutes);
  if (fare < product.minFare) fare = product.minFare;
  if (night && product.nightExtra) fare = fare * (1 + product.nightExtra);
  return fare;
}

// The price we SHOW: raw formula × surge × what we've learned.
function estimateFare(product, km, minutes, surge, correction, night) {
  let fare = formulaFare(product, km, minutes, night);
  if (!product.noSurge) fare = fare * surge;   // rush hour multiplier
  fare = fare * correction;                    // what we've learned
  return Math.round(fare);
}


// ============================================================================
//  SECTION 3 — LEARNING 🧠
//  For each logged trip we compare the REAL price against the RAW formula
//  (surge removed). WHY raw? If we compared against the already-corrected
//  number, every good correction would make the next ratio ≈ 1 and the app
//  would slowly "unlearn" itself. Comparing against the raw formula keeps
//  the lesson stable: "the formula is usually 20% too low for Uber Go".
// ============================================================================

function correctionFor(productId) {
  let totalRatio = 0;
  let count = 0;

  for (const entry of priceLog) {
    if (entry.productId !== productId || !(entry.rawEstimate > 0)) continue;

    // Take the surge back out of what you paid, so a rainy-day ride
    // doesn't teach the app that the base rates are high.
    const product = PRODUCTS.find(function (p) { return p.id === productId; });
    const surgeUsed = (product && product.noSurge) ? 1 : (entry.surge || 1);
    const actualWithoutSurge = entry.actual / surgeUsed;

    totalRatio = totalRatio + (actualWithoutSurge / entry.rawEstimate);
    count = count + 1;
  }

  if (count < 2) {
    return { factor: 1, dataPoints: count };   // not enough evidence → no change
  }

  let factor = totalRatio / count;

  // Clamp 0.5×–2× so one crazy entry can't wreck it.
  if (factor < 0.5) factor = 0.5;
  if (factor > 2.0) factor = 2.0;

  return { factor: factor, dataPoints: count };
}

// How close were the prices we SHOWED? Returns 0–100 %, or null if no data.
function accuracyPercent() {
  if (priceLog.length === 0) return null;

  let totalError = 0;
  for (const entry of priceLog) {
    const difference = Math.abs(entry.actual - entry.estimate);
    totalError = totalError + (difference / Math.max(entry.actual, 1));
  }

  const averageError = totalError / priceLog.length;
  return Math.max(0, Math.round((1 - averageError) * 100));   // never below 0%
}


// ============================================================================
//  SECTION 4 — COMPARING ⚖️
// ============================================================================

function compareAll(from, to, surge) {
  const km = roadKm(from, to);
  const minutes = rideMinutes(km);
  const night = isNightNow();
  const results = [];

  for (const product of PRODUCTS) {
    const learning = correctionFor(product.id);

    results.push({
      product: product,
      fare: estimateFare(product, km, minutes, surge, learning.factor, night), // shown
      rawFare: formulaFare(product, km, minutes, night),                       // for learning
      surge: product.noSurge ? 1 : surge,
      night: night && !!product.nightExtra,
      km: km,
      minutes: minutes,
      eta: Math.round(minutes + product.wait),
      learnedFactor: learning.factor,
      dataPoints: learning.dataPoints
    });
  }

  results.sort(function (x, y) { return x.fare - y.fare; });   // cheapest first
  return results;
}


// ============================================================================
//  SECTION 5 — DRAWING 🎨
// ============================================================================

const surgeSlider  = document.getElementById("surge");
const surgeValue   = document.getElementById("surgeValue");
const resultsBox   = document.getElementById("results");
const compareBtn   = document.getElementById("compareBtn");
const logStats     = document.getElementById("logStats");
const logListBox   = document.getElementById("logList");
const clearBtn     = document.getElementById("clearBtn");
const memoryNotice = document.getElementById("memoryNotice");

// THE single source of truth for the trip. Search (5B) changes these.
let selectedFrom = PLACES[3];   // Dadar Station (default)
let selectedTo   = PLACES[8];   // Mumbai Airport T2 (default)

// The latest comparison, so the "log a price" form knows what we estimated.
let lastResults = null;

// --- Deep links: open the real app with the route filled in ---
// Uber's format is documented; Ola/Rapido formats are unofficial — test on
// your phone and fix the strings here.
function deepLink(app, from, to) {
  if (app === "Uber") {
    return "uber://?action=setPickup" +
      "&pickup[latitude]=" + from.lat + "&pickup[longitude]=" + from.lng +
      "&pickup[nickname]=" + encodeURIComponent(from.name) +
      "&dropoff[latitude]=" + to.lat + "&dropoff[longitude]=" + to.lng +
      "&dropoff[nickname]=" + encodeURIComponent(to.name);
  }
  if (app === "Ola") {
    return "olacabs://app/launch?lat=" + from.lat + "&lng=" + from.lng +
           "&drop_lat=" + to.lat + "&drop_lng=" + to.lng;
  }
  if (app === "Rapido") {
    return "rapido://";   // opens the app only — route can't be passed (yet)
  }
  return "";              // the metered auto has no app
}

function webFallback(app) {
  if (app === "Uber")   return "https://m.uber.com/ul/?action=setPickup";
  if (app === "Ola")    return "https://book.olacabs.com/";
  if (app === "Rapido") return "https://www.rapido.bike/";
  return "";
}

// --- Build the HTML for one result row ---
function rowHtml(result, index, cheapest, priciest) {
  const product = result.product;

  let badge = "";
  if (index === 0) badge = '<div class="badge">CHEAPEST</div>';
  else if (index === 1) badge = '<div class="badge grey">RUNNER-UP</div>';

  const saving = priciest - result.fare;
  let savingLine;
  if (saving > 0) {
    savingLine = '<div class="save">Saves ₹' + saving + " vs the costliest option</div>";
  } else {
    savingLine = '<div class="extra">+₹' + (result.fare - cheapest) + " over the cheapest</div>";
  }

  // A range, not a fake-precise number. Prices wobble. Be honest.
  const low  = Math.round(result.fare * 0.92);
  const high = Math.round(result.fare * 1.15);

  let learnedLine = "";
  if (result.dataPoints >= 2) {
    learnedLine =
      '<div class="learned">🧠 Corrected ×' + result.learnedFactor.toFixed(2) +
      " using your " + result.dataPoints + " logged trips</div>";
  }

  const nightLine = result.night
    ? '<div class="night-note">🌙 Night fare included (+' + Math.round(product.nightExtra * 100) + "%)</div>"
    : "";

  const openButton = deepLink(product.app, selectedFrom, selectedTo)
    ? '<button class="open" data-app="' + product.app + '">Open ' + product.app + " " + product.emoji + "</button>"
    : '<button class="open" disabled>No app available</button>';

  const logButton = '<button class="log-btn" data-pid="' + product.id + '">✓ Log real price</button>';

  return (
    '<div class="row" style="border-left-color:' + product.color + '">' +
      badge +
      '<div class="top">' +
        '<div class="name">' + product.emoji + " " + product.app + " " + product.service + "</div>" +
        '<div class="price">₹' + result.fare + "</div>" +
      "</div>" +
      '<div class="meta">likely ₹' + low + "–₹" + high + " · " +
        result.km.toFixed(1) + " km · ride ~" + Math.round(result.minutes) + " min · " +
        product.wait + " min pickup wait · reach B in ~" + result.eta + " min</div>" +
      savingLine + learnedLine + nightLine +
      '<div class="row-btns">' + openButton + logButton + "</div>" +
      '<div id="logbox-' + product.id + '"></div>' +
    "</div>"
  );
}

// --- Put the whole result list on the page ---
function drawResults(from, to, results) {
  const cheapest = results[0].fare;
  const priciest = results[results.length - 1].fare;

  const header =
    '<div class="card">' +
      '<div class="route-title">' + escapeHtml(from.name) + " → " + escapeHtml(to.name) + "</div>" +
      '<div class="stats route-stats">' +
        "About " + results[0].km.toFixed(1) + " km by road · cheapest = " +
        results[0].product.app + " " + results[0].product.service + " at ₹" + cheapest +
        " · you save ₹" + (priciest - cheapest) + " vs the costliest option" +
      "</div>" +
    "</div>";

  let rowsHtml = "";
  for (let i = 0; i < results.length; i++) {
    rowsHtml = rowsHtml + rowHtml(results[i], i, cheapest, priciest);
  }

  resultsBox.innerHTML = header + rowsHtml;
  wireRowButtons();
}

// --- Attach click handlers to the buttons we just created ---
function wireRowButtons() {
  for (const button of resultsBox.querySelectorAll(".open")) {
    button.addEventListener("click", function () {
      const app = button.getAttribute("data-app");
      if (!app) return;
      const link = deepLink(app, selectedFrom, selectedTo);
      const web = webFallback(app);

      // Try the app; if not installed, open the website after 1.2 s.
      window.location.href = link;
      setTimeout(function () {
        if (!document.hidden && web) window.open(web, "_blank");
      }, 1200);
    });
  }

  for (const button of resultsBox.querySelectorAll(".log-btn")) {
    button.addEventListener("click", function () {
      openLogForm(button.getAttribute("data-pid"));
    });
  }
}

// --- The "what did it really cost?" form, inside a result row ---
function openLogForm(productId) {
  // Find by ID, never by position: moving the slider re-sorts the list,
  // so position 3 might be a different vehicle a second later.
  const result = lastResults && lastResults.find(function (r) { return r.product.id === productId; });
  if (!result) return;

  // Freeze a snapshot NOW. Even if the list redraws, we save what the user saw.
  const snapshot = {
    from: selectedFrom.name,
    to: selectedTo.name,
    km: Math.round(result.km * 10) / 10,
    product: result.product,
    estimate: result.fare,
    rawEstimate: Math.round(result.rawFare),
    surge: result.surge
  };

  const box = document.getElementById("logbox-" + productId);
  box.innerHTML =
    '<div class="logform">' +
      "<label>What did " + snapshot.product.app + " " + snapshot.product.service + " actually charge? (₹)</label>" +
      '<input type="number" inputmode="decimal" min="1" step="1" id="input-' + productId + '" placeholder="e.g. 145" />' +
      '<div class="logform-btns">' +
        '<button class="save" id="save-' + productId + '">Save to my log</button>' +
        '<button class="cancel" id="cancel-' + productId + '">Cancel</button>' +
      "</div>" +
    "</div>";

  const input = document.getElementById("input-" + productId);
  input.focus();

  document.getElementById("cancel-" + productId).addEventListener("click", function () {
    box.innerHTML = "";
  });

  function save() {
    const actual = parseFloat(input.value);
    if (!actual || actual <= 0 || actual > 100000) {
      input.style.borderColor = "#ff6b6b";
      input.value = "";
      input.placeholder = "Type a real amount, e.g. 145";
      return;
    }

    priceLog.push({
      id: makeId(),
      at: new Date().toISOString(),
      from: snapshot.from,
      to: snapshot.to,
      km: snapshot.km,
      app: snapshot.product.app,
      service: snapshot.product.service,
      productId: snapshot.product.id,
      estimate: snapshot.estimate,          // what we showed  → accuracy %
      rawEstimate: snapshot.rawEstimate,    // formula only    → learning
      surge: snapshot.surge,                // surge at the time
      actual: Math.round(actual)
    });

    commitLogChange();
  }

  document.getElementById("save-" + productId).addEventListener("click", save);
  input.addEventListener("keydown", function (e) { if (e.key === "Enter") save(); });
}

// --- Draw the price log section ---
function drawLog() {
  if (priceLog.length === 0) {
    logStats.textContent = "No trips logged yet. After a ride, tap “Log real price” on the option you took.";
    logListBox.innerHTML = "";
    clearBtn.classList.add("hidden");
    return;
  }

  const accuracy = accuracyPercent();
  let statsText = "🎯 <b>" + priceLog.length + "</b> trip" + (priceLog.length === 1 ? "" : "s") + " logged";
  if (accuracy !== null) statsText += " · average accuracy <b>" + accuracy + "%</b>";
  if (!storage.permanent) {
    statsText += ' · <span class="warn-text">temporary memory (won\'t survive reload)</span>';
  }
  logStats.innerHTML = statsText;

  let html = "";
  for (const entry of priceLog.slice().reverse()) {     // newest first
    const difference = entry.actual - entry.estimate;
    let diffText;
    if (difference === 0) {
      diffText = '<span class="diff-good">spot on</span>';
    } else if (difference > 0) {
      diffText = '<span class="diff-bad">we said ₹' + entry.estimate + ", +₹" + difference + "</span>";
    } else {
      diffText = '<span class="diff-good">we said ₹' + entry.estimate + ", −₹" + Math.abs(difference) + "</span>";
    }

    const dayText = new Date(entry.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

    // Everything that came from storage gets escaped (Section 0).
    html +=
      '<div class="log-item">' +
        '<div class="l-left"><b>' + escapeHtml(entry.app + " " + entry.service) + "</b><br>" +
          escapeHtml(entry.from) + " → " + escapeHtml(entry.to) + " · " + escapeHtml(entry.km) + " km</div>" +
        '<div class="l-right">₹' + escapeHtml(entry.actual) + " · " + diffText + "<br>" + dayText +
          ' <button class="del" data-id="' + escapeHtml(entry.id) + '" title="Delete">✕</button></div>' +
      "</div>";
  }

  logListBox.innerHTML = html;
  clearBtn.classList.remove("hidden");

  for (const button of logListBox.querySelectorAll(".del")) {
    button.addEventListener("click", function () {
      const id = button.getAttribute("data-id");      // ids are strings now
      priceLog = priceLog.filter(function (entry) { return entry.id !== id; });
      commitLogChange();
    });
  }
}

// --- THE MAIN ACTION: read the inputs, compute, draw ---
function runComparison() {
  const from = selectedFrom;
  const to = selectedTo;

  if (!from || !to) {
    resultsBox.innerHTML = '<div class="empty">Pick both a pickup (A) and a drop (B) to compare. 🔍</div>';
    lastResults = null;
    return;
  }

  if (from.name === to.name || straightLineKm(from, to) < 0.1) {
    resultsBox.innerHTML = '<div class="empty">Pickup and drop are the same place. 😄</div>';
    lastResults = null;
    return;
  }

  const surge = parseFloat(surgeSlider.value);
  lastResults = compareAll(from, to, surge);
  drawResults(from, to, lastResults);
}


// ============================================================================
//  SECTION 5B — LOCATION SEARCH 🔍  (type → suggestions → pick)
//  Two sources: ⭐ PLACES from data.js (instant) and 📍 OpenStreetMap
//  "Nominatim" (free, any address). "Debounce": wait until typing pauses
//  for 350 ms before calling the API, so we don't call it on every letter.
// ============================================================================

const MUMBAI_BOX = "72.75,19.35,73.15,18.85";   // lng_left, lat_top, lng_right, lat_bottom
const recentPlaces = [];

function localMatches(query) {
  const q = query.trim().toLowerCase();
  if (!q) return PLACES.slice(0, 8);
  return PLACES.filter(function (p) { return p.name.toLowerCase().includes(q); });
}

async function searchOnline(query) {
  const url = "https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6" +
    "&countrycodes=in&viewbox=" + MUMBAI_BOX + "&bounded=1&q=" + encodeURIComponent(query);
  const response = await fetch(url, { headers: { "Accept-Language": "en" } });
  if (!response.ok) throw new Error("search failed");
  const data = await response.json();

  return data.map(function (item) {
    const parts = item.display_name.split(", ");
    return {
      name: parts[0],
      detail: parts.slice(1, 4).join(", "),
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon)
    };
  });
}

async function reverseLookup(lat, lng) {
  try {
    const url = "https://nominatim.openstreetmap.org/reverse?format=json&zoom=17&lat=" + lat + "&lon=" + lng;
    const data = await (await fetch(url)).json();
    const parts = (data.display_name || "").split(", ");
    return parts.slice(0, 2).join(", ") || "Current location";
  } catch (e) {
    return "Current location";
  }
}

// One search box = one input + one suggestion list. Used twice (A and B).
function makeSearchBox(input, list, onPick) {
  let items = [];
  let activeIndex = -1;
  let timer = null;
  let requestNo = 0;       // ignore slow, out-of-date API answers

  function setOpen(open) {
    list.classList.toggle("open", open);
    input.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function render(local, online, note) {
    items = [];
    let html = "";
    const add = function (place, icon) {
      for (const it of items) if (straightLineKm(it, place) < 0.05) return;   // no duplicates
      items.push(place);
      html += '<div class="sugg" role="option" data-i="' + (items.length - 1) + '">' +
        '<span class="ic">' + icon + '</span><div>' +
        '<div class="t1">' + escapeHtml(place.name) + '</div>' +
        (place.detail ? '<div class="t2">' + escapeHtml(place.detail) + '</div>' : "") +
        '</div></div>';
    };
    if (!input.value.trim()) recentPlaces.forEach(function (p) { add(p, "🕘"); });
    local.forEach(function (p) { add(p, "⭐"); });
    online.forEach(function (p) { add(p, "📍"); });
    if (note) html += '<div class="sugg-note">' + note + '</div>';

    list.innerHTML = html;
    setOpen(html !== "");
    activeIndex = -1;
  }

  function pick(place) {
    input.value = place.name;
    setOpen(false);
    const clean = { name: place.name, lat: place.lat, lng: place.lng, detail: place.detail };
    for (let i = recentPlaces.length - 1; i >= 0; i--) {
      if (recentPlaces[i].name === clean.name) recentPlaces.splice(i, 1);
    }
    recentPlaces.unshift(clean);
    if (recentPlaces.length > 3) recentPlaces.pop();
    onPick(clean);
  }

  function update() {
    const q = input.value;
    const local = localMatches(q);
    clearTimeout(timer);

    if (q.trim().length < 3) {
      requestNo++;                                   // cancel any pending answer
      render(local, [], q.trim() ? "Keep typing to search all of Mumbai…" : "");
      return;
    }
    render(local, [], "Searching…");
    const myNo = ++requestNo;
    timer = setTimeout(async function () {
      try {
        const online = await searchOnline(q);
        if (myNo !== requestNo) return;
        render(local, online, online.length || local.length ? "" : "No places found. Try another name.");
      } catch (e) {
        if (myNo !== requestNo) return;
        render(local, [], "⚠️ Online search unavailable — showing saved places only.");
      }
    }, 350);
  }

  input.addEventListener("input", update);
  input.addEventListener("focus", function () { input.select(); update(); });

  list.addEventListener("mousedown", function (e) {   // mousedown fires before blur
    const row = e.target.closest(".sugg");
    if (row) { e.preventDefault(); pick(items[+row.dataset.i]); }
  });

  input.addEventListener("blur", function () {
    setTimeout(function () { setOpen(false); }, 150);
  });

  input.addEventListener("keydown", function (e) {
    const rows = list.querySelectorAll(".sugg");
    if (!rows.length) return;
    if (e.key === "ArrowDown") activeIndex = Math.min(activeIndex + 1, rows.length - 1);
    else if (e.key === "ArrowUp") activeIndex = Math.max(activeIndex - 1, 0);
    else if (e.key === "Enter") { e.preventDefault(); pick(items[Math.max(activeIndex, 0)]); return; }
    else if (e.key === "Escape") { setOpen(false); return; }
    else return;
    e.preventDefault();
    rows.forEach(function (r, i) { r.classList.toggle("active", i === activeIndex); });
    rows[activeIndex].scrollIntoView({ block: "nearest" });
  });

  return { pick: pick };
}

function setupLocationSearch() {
  const fromInput = document.getElementById("fromInput");
  const toInput   = document.getElementById("toInput");

  fromInput.value = selectedFrom.name;
  toInput.value   = selectedTo.name;

  const boxA = makeSearchBox(fromInput, document.getElementById("fromSuggest"), function (place) {
    selectedFrom = place;
    runComparison();
  });
  makeSearchBox(toInput, document.getElementById("toSuggest"), function (place) {
    selectedTo = place;
    runComparison();
  });

  // ◎ = use my GPS location as pickup
  document.getElementById("locateBtn").addEventListener("click", function () {
    if (!navigator.geolocation) { alert("Your browser can't share location."); return; }
    fromInput.value = "Finding you…";
    navigator.geolocation.getCurrentPosition(async function (pos) {
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      const name = await reverseLookup(lat, lng);
      boxA.pick({ name: "📍 " + name, lat: lat, lng: lng });
    }, function () {
      fromInput.value = selectedFrom ? selectedFrom.name : "";
      alert("Couldn't get your location. Allow location access and try again.");
    }, { enableHighAccuracy: true, timeout: 10000 });
  });

  // ⇅ swap A and B
  document.getElementById("swapBtn").addEventListener("click", function () {
    const temp = selectedFrom; selectedFrom = selectedTo; selectedTo = temp;
    fromInput.value = selectedFrom ? selectedFrom.name : "";
    toInput.value   = selectedTo ? selectedTo.name : "";
    runComparison();
  });
}


// ============================================================================
//  SECTION 6 — EVENTS ⚡  ("when X happens, do Y")
// ============================================================================

compareBtn.addEventListener("click", runComparison);

surgeSlider.addEventListener("input", function () {
  surgeValue.textContent = parseFloat(surgeSlider.value).toFixed(1) + "×";
  runComparison();
});

clearBtn.addEventListener("click", function () {
  const sure = window.confirm("Delete all " + priceLog.length + " logged trips? This cannot be undone.");
  if (sure) {
    priceLog = [];
    commitLogChange();
  }
});


// ============================================================================
//  SECTION 7 — START 🚀
// ============================================================================

setupLocationSearch();   // wire up the A and B search boxes
drawLog();               // show whatever we remembered from last time
runComparison();         // show prices immediately

if (!storage.permanent) {
  memoryNotice.className = "banner info";
  memoryNotice.innerHTML =
    "ℹ️ <b>Preview mode:</b> this window can't save to your browser's memory, so " +
    "logged prices will vanish when you reload. Open the page from a normal browser " +
    "tab (or a local server) and your log becomes permanent.";
}
