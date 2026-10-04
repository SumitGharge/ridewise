# RideWise 🛺

A mobile-friendly Mumbai ride-fare estimation project built with HTML, CSS and vanilla JavaScript.

## Features
- Search pickup and drop locations; choose from saved landmarks or online results.
- Compare illustrative estimates for Uber, Ola, Rapido and metered autos.
- Adjust a simulated surge multiplier.
- Log actual fares locally and calibrate future estimates.
- GPS pickup and route swapping.

## Files
| File | Purpose |
| --- | --- |
| `index.html` | Page structure |
| `styles.css` | Responsive dark theme |
| `data.js` | Places, illustrative rate cards and settings |
| `app.js` | Search, estimates, logging and interface logic |

## Run locally
Keep all four files together and open `index.html` in a browser. Alternatively, with Python installed:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`. GPS requires HTTPS or localhost and permission from the browser.

## Deploy with GitHub Pages
1. Upload these files to the root of a GitHub repository.
2. Open **Settings → Pages**.
3. Choose **Deploy from a branch**, then **main** and **/ (root)**.
4. Save and wait for GitHub to provide the site URL.

## Important limitations before public use
- Prices and pickup waits are illustrative, not live quotes or verified tariffs. Service availability is not checked.
- Distances use straight-line distance multiplied by a detour factor, not actual road routing.
- App deep links require testing on real phones.
- Logs stay in this browser's localStorage; they are not synced or uploaded to GitHub.
- The current online search uses the public Nominatim endpoint. Its usage policy prohibits client-side autocomplete. Before enabling public autocomplete, replace `searchOnline()` with a provider that explicitly supports it (and add required attribution and appropriate API-key restrictions). Alternatively, remove live online autocomplete and retain the local landmark search. See https://operations.osmfoundation.org/policies/nominatim/ . A debounce alone does not satisfy that policy.
- Night-fare settings are illustrative and use the browser's local clock.

Do not commit API secrets, credentials, or personal ride logs to the repository.
