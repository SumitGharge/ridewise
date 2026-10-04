// ============================================================================
//  data.js  —  THE FACT BOOK  🗂️
// ----------------------------------------------------------------------------
//  This file holds ONLY data. No logic, no look, no buttons. Just facts.
//
//  WHY we keep facts in their own file:
//  You will change these numbers hundreds of times while tuning the app.
//  If data is mixed with logic, every edit is scary. Separated, editing is safe.
//  (Real companies do this too: "data layer" vs "business logic".)
// ============================================================================


// ---------------------------------------------------------------------------
//  0. SETTINGS — tuning knobs. Change a number here, the whole app changes.
// ---------------------------------------------------------------------------

// Roads bend. Detour factor = road distance ÷ straight-line distance.
// Measured: Dadar → Airport is ~8.3 km straight but ~15 km by road ≈ 1.8×.
// 1.5 is a fair city-wide average. Your easiest tuning knob.
const ROAD_FACTOR = 1.5;

// Night hours for metered autos (24-hour clock). 0 = midnight, 5 = 5 AM.
// Between NIGHT_START and NIGHT_END, products with `nightExtra` cost more.
const NIGHT_START = 0;
const NIGHT_END = 5;


// ---------------------------------------------------------------------------
//  1. PLACES — popular pickup/drop points. They show up instantly as ⭐ in
//     the search box (no internet needed). Any other address is found online.
//     lat = north/south position, lng = east/west position. (Real GPS numbers.)
// ---------------------------------------------------------------------------
const PLACES = [
  { name: "Gateway of India, Colaba",   lat: 18.9220, lng: 72.8347 },
  { name: "CSMT Station",               lat: 18.9398, lng: 72.8355 },
  { name: "Marine Drive",               lat: 18.9540, lng: 72.8140 },
  { name: "Dadar Station",              lat: 19.0180, lng: 72.8440 },
  { name: "Lower Parel (Phoenix)",      lat: 18.9960, lng: 72.8250 },
  { name: "Worli Sea Face",             lat: 19.0100, lng: 72.8150 },
  { name: "Bandra Station",             lat: 19.0540, lng: 72.8400 },
  { name: "BKC (Bandra Kurla Complex)", lat: 19.0650, lng: 72.8680 },
  { name: "Mumbai Airport T2",          lat: 19.0896, lng: 72.8656 },
  { name: "Andheri Station",            lat: 19.1190, lng: 72.8460 },
  { name: "Powai (Hiranandani)",        lat: 19.1170, lng: 72.9050 },
  { name: "Juhu Beach",                 lat: 19.0970, lng: 72.8260 },
  { name: "Ghatkopar Station",          lat: 19.0860, lng: 72.9080 },
  { name: "Chembur",                    lat: 19.0520, lng: 72.9000 },
  { name: "Malad Station",              lat: 19.1870, lng: 72.8480 },
  { name: "Borivali Station",           lat: 19.2300, lng: 72.8570 },
  { name: "Thane Station",              lat: 19.1860, lng: 72.9750 },
  { name: "Vashi, Navi Mumbai",         lat: 19.0770, lng: 72.9990 }
];


// ---------------------------------------------------------------------------
//  2. PRODUCTS — one "product" = one vehicle type on one app.
//     Each product needs a unique `id` (e.g. "rapido-bike") — a "primary key".
//
//     base       = fixed charge the moment you sit in the vehicle (₹)
//     perKm      = charge for every kilometre (₹)
//     perMin     = charge for every minute (₹)
//     minFare    = the floor. The bill can never be lower than this (₹)
//     wait       = minutes until the driver reaches YOU
//     color      = the coloured stripe on the result card
//     noSurge    = true → does NOT multiply during rush hour (metered autos)
//     nightExtra = extra share added at night (0.25 = +25%). Optional.
//
//  ⚠️ THESE ARE LEARNING NUMBERS, NOT VERIFIED RATES.
//     Last checked: NOT YET — compare with real app quotes and write the date
//     here, e.g. "Last checked: 12 Oct 2026". Your price log also corrects them.
// ---------------------------------------------------------------------------
const PRODUCTS = [
  { id: "rapido-bike",  app: "Rapido", service: "Bike",        emoji: "🏍️", color: "#f5c518", base: 20, perKm: 6.0,  perMin: 0.6, minFare: 25,  wait: 3 },
  { id: "rapido-auto",  app: "Rapido", service: "Auto",        emoji: "🛺", color: "#f5c518", base: 30, perKm: 11.0, perMin: 0.8, minFare: 35,  wait: 5 },
  { id: "rapido-cab",   app: "Rapido", service: "Cab Economy", emoji: "🚗", color: "#f5c518", base: 50, perKm: 14.0, perMin: 1.2, minFare: 70,  wait: 7 },

  { id: "ola-bike",     app: "Ola",    service: "Bike",        emoji: "🏍️", color: "#8ed14b", base: 25, perKm: 7.0,  perMin: 0.7, minFare: 30,  wait: 4 },
  { id: "ola-mini",     app: "Ola",    service: "Mini",        emoji: "🚗", color: "#8ed14b", base: 60, perKm: 13.0, perMin: 1.3, minFare: 85,  wait: 6 },
  { id: "ola-prime",    app: "Ola",    service: "Prime Sedan", emoji: "🚙", color: "#8ed14b", base: 80, perKm: 16.0, perMin: 1.8, minFare: 120, wait: 6 },

  { id: "uber-moto",    app: "Uber",   service: "Moto",        emoji: "🏍️", color: "#4ea8f5", base: 25, perKm: 7.0,  perMin: 0.7, minFare: 30,  wait: 3 },
  { id: "uber-go",      app: "Uber",   service: "Go",          emoji: "🚗", color: "#4ea8f5", base: 65, perKm: 13.5, perMin: 1.5, minFare: 90,  wait: 5 },
  { id: "uber-premier", app: "Uber",   service: "Premier",     emoji: "🚙", color: "#4ea8f5", base: 95, perKm: 17.0, perMin: 2.0, minFare: 140, wait: 8 },

  { id: "meter-auto",   app: "Meter",  service: "Auto (meter)", emoji: "🛺", color: "#c88bf5", base: 31, perKm: 17.0, perMin: 0, minFare: 31, wait: 2, noSurge: true, nightExtra: 0.25 }
];
