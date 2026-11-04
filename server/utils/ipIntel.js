/**
 * Real IP intelligence.
 * Fetches genuine geographic and ISP telemetry.
 * If accessed locally (localhost / private network), determines the host's actual public IP
 * so genuine real-world location and carrier telemetry is always presented (no dummy/fictional data).
 */
const net = require('net');

// Cache to prevent duplicate lookups
const cache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let cachedPublicIp = null;
let lastPublicIpFetch = 0;

function normalizeIp(raw = '') {
  let ip = String(raw).trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  return ip;
}

function getIpVersion(ip) {
  if (net.isIPv6(ip)) return 'IPv6';
  return 'IPv4';
}

function isPrivateIp(ip) {
  if (!net.isIP(ip)) return true;
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  const l = ip.toLowerCase();
  return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80');
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** Fetches real public IP of this machine when requests originate from localhost */
async function getRealPublicIp() {
  if (cachedPublicIp && Date.now() - lastPublicIpFetch < 3600000) {
    return cachedPublicIp;
  }
  try {
    const data = await fetchJson('https://api.ipify.org?format=json');
    if (data?.ip) {
      cachedPublicIp = data.ip;
      lastPublicIpFetch = Date.now();
      return data.ip;
    }
  } catch {
    // fallback
    try {
      const data2 = await fetchJson('https://ipapi.co/json/');
      if (data2?.ip) {
        cachedPublicIp = data2.ip;
        lastPublicIpFetch = Date.now();
        return data2.ip;
      }
    } catch {
      /* ignore */
    }
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

async function lookupIp(rawIp) {
  let ip = normalizeIp(rawIp);

  // If local / private IP, determine the actual public IP of the user's connection
  if (isPrivateIp(ip)) {
    const realIp = await getRealPublicIp();
    if (realIp) {
      ip = realIp;
    }
  }

  // Check cache
  const cached = cache.get(ip);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const ipVersion = getIpVersion(ip);

  // Try ipapi.co first for detailed real data
  try {
    const d = await fetchJson(`https://ipapi.co/${encodeURIComponent(ip)}/json/`);
    if (d && !d.error && d.city) {
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
        lng: Number.isFinite(d.longitude) ? d.longitude : undefined
      };
      cache.set(ip, { timestamp: Date.now(), data: result });
      return result;
    }
  } catch (err) {
    console.warn('[ipIntel] ipapi.co lookup failed, trying fallback:', err.message);
  }

  // Try IPinfo fallback
  try {
    const tokenParam = process.env.IPINFO_TOKEN ? `?token=${encodeURIComponent(process.env.IPINFO_TOKEN)}` : '';
    const d = await fetchJson(`https://ipinfo.io/${encodeURIComponent(ip)}/json${tokenParam}`);
    if (d && d.city) {
      const [lat, lng] = String(d.loc || '').split(',').map(Number);
      const [asn, ...ispParts] = String(d.org || '').split(' ');
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
        isp: ispParts.join(' ') || d.org || 'Internet Service Provider',
        org: d.org || undefined,
        asn: asn?.startsWith('AS') ? asn : undefined,
        lat: Number.isFinite(lat) ? lat : undefined,
        lng: Number.isFinite(lng) ? lng : undefined
      };
      cache.set(ip, { timestamp: Date.now(), data: result });
      return result;
    }
  } catch (err) {
    console.warn('[ipIntel] ipinfo.io lookup failed:', err.message);
  }

  // Fallback if network lookup failed
  return {
    ip,
    ipVersion,
    ipSource: 'unavailable',
    city: 'Location service unavailable',
    region: 'Network offline',
    country: 'Unknown'
  };
}

module.exports = { lookupIp, normalizeIp, isPrivateIp, getIpVersion, getRealPublicIp };
