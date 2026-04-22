/**
 * Reverse geocoding utility using Google Maps Geocoding API.
 *
 * WHY: Google Maps' formatted_address string is unreliable for postal codes —
 * landmarks, neighborhoods, and many non-US locations omit it. The only
 * authoritative way to get a postal code from a map pin is to reverse-geocode
 * the lat/lng and extract the typed `postal_code` component.
 *
 * IMPORTANT: This must NEVER throw or reject — a geocoding failure must never
 * block the main request. It always resolves, returning null on any failure.
 */

const GEOCODING_API_URL = "https://maps.googleapis.com/maps/api/geocode/json";

/**
 * Extract the postal code from a Google Geocoding API result set.
 * Iterates all results from most-specific to least-specific.
 *
 * Edge cases handled:
 * - Multiple results returned (use first one that has postal_code)
 * - result.address_components is undefined or empty
 * - Location genuinely has no postal code (returns null, not an error)
 */
const extractPostalCode = (results) => {
  if (!Array.isArray(results) || results.length === 0) return null;

  for (const result of results) {
    const components = result.address_components;
    if (!Array.isArray(components)) continue;

    const postalComponent = components.find(
      (c) => Array.isArray(c.types) && c.types.includes("postal_code")
    );

    if (postalComponent && postalComponent.long_name) {
      return postalComponent.long_name;
    }
  }

  return null;
};

/**
 * Reverse geocode lat/lng to get the postal code.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<string|null>} postal code string or null
 *
 * Edge cases handled:
 * - Missing API key → returns null immediately (no crash)
 * - Invalid coordinates (NaN, out of range) → returns null
 * - Network error / timeout → returns null
 * - Google API status not OK (ZERO_RESULTS, OVER_QUERY_LIMIT, etc.) → returns null
 * - Location has no postal code in any result → returns null
 * - Unexpected response shape → returns null
 */
const getPostalCodeFromCoords = async (latitude, longitude) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey || apiKey === "YOUR_GOOGLE_MAPS_API_KEY_HERE") {
    return null;
  }

  // Validate coordinates before making a network call
  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);

  if (
    isNaN(lat) || isNaN(lng) ||
    lat < -90 || lat > 90 ||
    lng < -180 || lng > 180
  ) {
    return null;
  }

  try {
    const url = `${GEOCODING_API_URL}?latlng=${lat},${lng}&key=${apiKey}`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000), // 5-second timeout — never block the main request
    });

    if (!response.ok) return null;

    const data = await response.json();

    // Google returns status in the body, not the HTTP status code
    if (data.status !== "OK") {
      // ZERO_RESULTS means no data for this location — expected for remote areas
      // OVER_QUERY_LIMIT / REQUEST_DENIED are config issues, not bugs
      return null;
    }

    return extractPostalCode(data.results);
  } catch (_err) {
    // Network failure, timeout, JSON parse error, etc.
    // Silently return null — postal code enrichment must never block the main flow
    return null;
  }
};

module.exports = { getPostalCodeFromCoords };
