/**
 * OpenStreetMap Nominatim Reverse Geocoding Service
 * 
 * Public usage policy:
 * - Maximum 1 request per second
 * - Cache results to avoid unnecessary requests
 * - Provide valid User-Agent/Referer
 * - Attribution: © OpenStreetMap contributors
 * 
 * API Documentation: https://nominatim.openstreetmap.org/reverse
 */

const NOMINATIM_API = 'https://nominatim.openstreetmap.org/reverse';
const MIN_REQUEST_INTERVAL = 1100; // 1.1 seconds to respect 1 req/sec limit

// Cache to avoid redundant requests for same coordinates
const cache = new Map();
let lastRequestTime = 0;

/**
 * Generate a cache key from coordinates (rounded to 4 decimal places ~11m accuracy)
 */
function getCacheKey(lat, lng) {
  const roundedLat = Math.round(lat * 10000) / 10000;
  const roundedLng = Math.round(lng * 10000) / 10000;
  return `${roundedLat},${roundedLng}`;
}

/**
 * Throttle requests to respect API rate limit
 */
async function throttle() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastRequestTime = Date.now();
}

/**
 * Reverse geocode GPS coordinates to human-readable address
 * 
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<Object>} Address object with formatted data
 */
export async function reverseGeocode(lat, lng) {
  // Validate coordinates
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    throw new Error('Invalid coordinates: lat and lng must be numbers');
  }
  if (lat < -90 || lat > 90) {
    throw new Error('Invalid latitude: must be between -90 and 90');
  }
  if (lng < -180 || lng > 180) {
    throw new Error('Invalid longitude: must be between -180 and 180');
  }

  // Check cache first
  const cacheKey = getCacheKey(lat, lng);
  if (cache.has(cacheKey)) {
    console.log('[Geocoding] Cache hit:', cacheKey);
    return cache.get(cacheKey);
  }

  // Throttle to respect rate limit
  await throttle();

  console.log('[Geocoding] Requesting address for:', { lat, lng });

  try {
    const url = new URL(NOMINATIM_API);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', lat.toString());
    url.searchParams.set('lon', lng.toString());
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('extratags', '0');
    url.searchParams.set('namedetails', '0');

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'CamShield/1.0 (GPS tracking app)',
        'Referer': window.location.origin,
      },
    });

    if (!response.ok) {
      throw new Error(`Nominatim API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Extract and structure the address
    const address = data.address || {};
    const result = {
      // Raw data
      raw: data,
      
      // Formatted display name
      displayName: data.display_name || 'Unknown location',
      
      // Detailed address components (may be undefined if not available)
      road: address.road,
      neighbourhood: address.neighbourhood,
      suburb: address.suburb,
      village: address.village,
      town: address.town,
      city: address.city,
      municipality: address.municipality,
      county: address.county,
      district: address.district,
      state: address.state,
      state_district: address.state_district,
      postcode: address.postcode,
      country: address.country,
      country_code: address.country_code,
      
      // Best available locality name (prioritized)
      locality: address.city || 
                address.town || 
                address.village || 
                address.municipality ||
                address.suburb ||
                address.county ||
                'Unknown',
      
      // Coordinates echoed back
      coordinates: {
        lat: parseFloat(data.lat) || lat,
        lng: parseFloat(data.lon) || lng,
      },
      
      // Place type and class
      type: data.type,
      category: data.category,
      
      // Timestamp
      timestamp: new Date().toISOString(),
    };

    // Cache the result
    cache.set(cacheKey, result);
    console.log('[Geocoding] Success:', result.locality, result.displayName);

    return result;

  } catch (error) {
    console.error('[Geocoding] Error:', error.message);
    
    // Return minimal data on error
    return {
      error: error.message,
      displayName: 'Address lookup failed',
      locality: 'Unknown',
      coordinates: { lat, lng },
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Format address into concise string
 */
export function formatAddress(geocodedData) {
  if (!geocodedData || geocodedData.error) {
    return 'Address unavailable';
  }

  const parts = [];
  const a = geocodedData;
  
  if (a.road) parts.push(a.road);
  if (a.neighbourhood) parts.push(a.neighbourhood);
  if (a.suburb && a.suburb !== a.neighbourhood) parts.push(a.suburb);
  if (a.locality !== 'Unknown') parts.push(a.locality);
  if (a.postcode) parts.push(a.postcode);
  if (a.state) parts.push(a.state);
  if (a.country) parts.push(a.country);

  return parts.length > 0 ? parts.join(', ') : geocodedData.displayName || 'Unknown location';
}

/**
 * Clear geocoding cache (useful when testing)
 */
export function clearGeocodingCache() {
  cache.clear();
  console.log('[Geocoding] Cache cleared');
}
