/**
 * Real IP intelligence & Geolocation module.
 *
 * Extracts the genuine visitor IP from trusted reverse proxy headers (Vercel Edge, Render Load Balancer, Nginx),
 * validates IPv4/IPv6 format, checks for private/loopback addresses, and performs geolocation via IPinfo API.
 *
 * NOTE: The server's own hosting IP is NEVER used as the visitor IP.
 */
const net = require('net');

// Cache to prevent duplicate lookups (TTL 24 hours)
const cache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Strips IPv6-mapped IPv4 prefix (::ffff:) and whitespace.
 */
function normalizeIp(raw = '') {
  let ip = String(raw).trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  // Strip port if present in IPv4 (e.g. 1.2.3.4:5678)
  if (ip.includes(':') && ip.includes('.')) {
    const parts = ip.split(':');
    if (parts.length === 2 && net.isIPv4(parts[0])) {
      ip = parts[0];
    }
  }
  return ip;
}

/**
 * Checks if a string is a valid IPv4 or IPv6 address.
 */
function isValidIp(ip) {
  return Boolean(ip && net.isIP(ip));
}

/**
 * Returns IP version ('IPv4' or 'IPv6').
 */
function getIpVersion(ip) {
  if (net.isIPv6(ip)) return 'IPv6';
  return 'IPv4';
}

/**
 * Determines whether an IP is in a private, loopback, link-local, carrier-grade NAT,
 * or documentation subnet (RFC 1918, RFC 3927, RFC 6598, RFC 5737).
 */
function isPrivateIp(ip) {
  if (!isValidIp(ip)) return true;

  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;
    return (
      a === 0 || // "This" network
      a === 10 || // 10.0.0.0/8 private
      a === 127 || // 127.0.0.0/8 loopback
      (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12 private
      (a === 192 && b === 168) || // 192.168.0.0/16 private
      (a === 169 && b === 254) || // 169.254.0.0/16 link-local
      (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 Carrier-grade NAT
      (a === 192 && b === 0 && parts[2] === 2) || // TEST-NET-1
      (a === 198 && b === 51 && parts[2] === 100) || // TEST-NET-2
      (a === 203 && b === 0 && parts[2] === 113) // TEST-NET-3
    );
  }

  const l = ip.toLowerCase();
  return (
    l === '::1' || // loopback
    l === '::' || // unspecified
    l.startsWith('fc') || // unique local (fc00::/7)
    l.startsWith('fd') || // unique local (fc00::/7)
    l.startsWith('fe80') || // link-local (fe80::/10)
    l.startsWith('2001:db8') // documentation
  );
}

function isValidPublicIp(ip) {
  return isValidIp(ip) && !isPrivateIp(ip);
}

/**
 * Extracts the true visitor client IP from reverse proxy headers.
 * Order of inspection:
 * 1. x-vercel-forwarded-for (Set directly by Vercel Edge for incoming client)
 * 2. x-real-ip (Standard reverse proxy client header)
 * 3. cf-connecting-ip (Cloudflare edge header)
 * 4. x-forwarded-for (First valid public IP in the chain)
 * 5. req.ip (Express trust proxy value)
 * 6. req.socket.remoteAddress (Fallback TCP socket)
 */
function extractClientIp(req) {
  const headers = req.headers || {};

  // 1. Vercel edge forwarded header
  const vercelForwarded = headers['x-vercel-forwarded-for'];
  if (typeof vercelForwarded === 'string' && vercelForwarded.trim()) {
    const list = vercelForwarded.split(',').map((s) => normalizeIp(s.trim())).filter(Boolean);
    for (const cand of list) {
      if (isValidPublicIp(cand)) return cand;
    }
  }

  // 2. X-Real-IP
  const realIp = headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    const cand = normalizeIp(realIp.trim());
    if (isValidPublicIp(cand)) return cand;
  }

  // 3. Cloudflare Connecting IP
  const cfIp = headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp.trim()) {
    const cand = normalizeIp(cfIp.trim());
    if (isValidPublicIp(cand)) return cand;
  }

  // 4. Standard X-Forwarded-For: parse left-to-right to find original client public IP
  const xForwardedFor = headers['x-forwarded-for'];
  if (typeof xForwardedFor === 'string' && xForwardedFor.trim()) {
    const list = xForwardedFor.split(',').map((s) => normalizeIp(s.trim())).filter(Boolean);
    for (const cand of list) {
      if (isValidPublicIp(cand)) return cand;
    }
    // If all are private, return the leftmost valid IP (e.g. testing in private network)
    for (const cand of list) {
      if (isValidIp(cand)) return cand;
    }
  }

  // 5. Express req.ip (when trust proxy is enabled)
  if (req.ip) {
    const cand = normalizeIp(req.ip);
    if (isValidIp(cand)) return cand;
  }

  // 6. Direct socket remoteAddress
  if (req.socket?.remoteAddress) {
    const cand = normalizeIp(req.socket.remoteAddress);
    if (isValidIp(cand)) return cand;
  }

  return null;
}

function countryName(code) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) CamShield-Security-Console'
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/**
 * Performs IP geolocation using IPinfo with ipapi.co and Vercel edge headers as fallbacks.
 *
 * @param {string} rawIp The visitor IP address.
 * @param {object} [reqHeaders={}] Request headers for edge geo metadata fallback.
 */
async function lookupIp(rawIp, reqHeaders = {}) {
  const ip = normalizeIp(rawIp);

  // 1. Check for missing / unavailable IP
  if (!ip || !isValidIp(ip)) {
    console.warn('[ipIntel] No valid client IP could be determined from request.');
    return {
      ip: 'IP unavailable',
      ipVersion: 'Unknown',
      ipSource: 'unavailable',
      city: 'IP location unavailable',
      region: 'Unavailable',
      country: 'Unavailable',
      isp: 'Carrier unavailable',
      isApproximate: true
    };
  }

  // 2. If private/localhost IP: DO NOT call external APIs from the server!
  // Doing so would report the server hosting datacenter (e.g. AWS Boardman, Oregon) instead of visitor.
  if (isPrivateIp(ip)) {
    console.log(`[ipIntel] Detected local/private IP: ${ip} (No external server polling performed)`);
    return {
      ip,
      ipVersion: getIpVersion(ip),
      ipSource: 'local',
      city: 'Local Network',
      region: 'Private Address Space',
      country: 'Localhost / LAN',
      countryCode: 'LOC',
      isp: 'Private Network',
      org: 'Local Network',
      isApproximate: true
    };
  }

  // 3. Check memory cache for this public IP
  const cached = cache.get(ip);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const ipVersion = getIpVersion(ip);
  console.log(`[ipIntel] Performing real visitor IP lookup: ip=${ip} (${ipVersion})`);

  // 4. Primary: IPinfo API
  try {
    const tokenParam = process.env.IPINFO_TOKEN ? `?token=${encodeURIComponent(process.env.IPINFO_TOKEN)}` : '';
    const d = await fetchJson(`https://ipinfo.io/${encodeURIComponent(ip)}/json${tokenParam}`);

    if (d && !d.error && (d.city || d.country)) {
      const [lat, lng] = String(d.loc || '').split(',').map(Number);
      const [asn, ...ispParts] = String(d.org || '').split(' ');
      const ispName = ispParts.join(' ').trim() || d.org || 'Internet Service Provider';

      const result = {
        ip: d.ip || ip,
        ipVersion,
        ipSource: 'ipinfo',
        city: d.city || 'Unknown',
        region: d.region || 'Unknown',
        country: countryName(d.country) || d.country || 'Unknown',
        countryCode: d.country || undefined,
        postal: d.postal || undefined,
        timezone: d.timezone || undefined,
        isp: ispName,
        org: d.org || undefined,
        asn: asn?.startsWith('AS') ? asn : undefined,
        lat: Number.isFinite(lat) ? lat : undefined,
        lng: Number.isFinite(lng) ? lng : undefined,
        isApproximate: true
      };

      console.log(`[ipIntel] IPinfo lookup succeeded: ${result.city}, ${result.country} | ISP: ${result.isp}`);
      cache.set(ip, { timestamp: Date.now(), data: result });
      return result;
    }
  } catch (err) {
    console.warn(`[ipIntel] IPinfo lookup failed for ${ip}:`, err.message);
  }

  // 5. Fallback 1: ipapi.co
  try {
    const d = await fetchJson(`https://ipapi.co/${encodeURIComponent(ip)}/json/`);
    if (d && !d.error && (d.city || d.country_name)) {
      const result = {
        ip: d.ip || ip,
        ipVersion: d.version || ipVersion,
        ipSource: 'ipapi',
        city: d.city || 'Unknown',
        region: d.region || 'Unknown',
        country: d.country_name || countryName(d.country) || 'Unknown',
        countryCode: d.country || d.country_code || undefined,
        postal: d.postal || undefined,
        timezone: d.timezone || undefined,
        isp: d.org || d.isp || 'Internet Service Provider',
        org: d.org || undefined,
        asn: d.asn || undefined,
        lat: Number.isFinite(d.latitude) ? d.latitude : undefined,
        lng: Number.isFinite(d.longitude) ? d.longitude : undefined,
        isApproximate: true
      };

      console.log(`[ipIntel] ipapi.co fallback succeeded: ${result.city}, ${result.country} | ISP: ${result.isp}`);
      cache.set(ip, { timestamp: Date.now(), data: result });
      return result;
    }
  } catch (err) {
    console.warn(`[ipIntel] ipapi.co fallback failed for ${ip}:`, err.message);
  }

  // 6. Fallback 2: Vercel Edge Geolocation Headers (if routed through Vercel)
  if (reqHeaders['x-vercel-ip-country']) {
    const vCountry = reqHeaders['x-vercel-ip-country'];
    const vRegion = reqHeaders['x-vercel-ip-country-region'] || 'Unknown';
    const vCity = reqHeaders['x-vercel-ip-city']
      ? decodeURIComponent(reqHeaders['x-vercel-ip-city'])
      : 'Unknown';
    const vLat = Number(reqHeaders['x-vercel-ip-latitude']);
    const vLng = Number(reqHeaders['x-vercel-ip-longitude']);

    const result = {
      ip,
      ipVersion,
      ipSource: 'vercel-edge',
      city: vCity,
      region: vRegion,
      country: countryName(vCountry) || vCountry,
      countryCode: vCountry,
      postal: reqHeaders['x-vercel-ip-postal-code'] || undefined,
      timezone: reqHeaders['x-vercel-ip-timezone'] || undefined,
      isp: 'Carrier via Vercel Edge',
      lat: Number.isFinite(vLat) ? vLat : undefined,
      lng: Number.isFinite(vLng) ? vLng : undefined,
      isApproximate: true
    };

    console.log(`[ipIntel] Vercel Edge geo headers used: ${result.city}, ${result.country}`);
    cache.set(ip, { timestamp: Date.now(), data: result });
    return result;
  }

  // 7. Final fallback: IP determined but external geolocation service offline
  return {
    ip,
    ipVersion,
    ipSource: 'unavailable',
    city: 'IP location unavailable',
    region: 'Network lookup offline',
    country: 'Unknown',
    isp: 'ISP unavailable',
    isApproximate: true
  };
}

module.exports = {
  lookupIp,
  normalizeIp,
  isValidIp,
  isValidPublicIp,
  isPrivateIp,
  getIpVersion,
  extractClientIp
};
