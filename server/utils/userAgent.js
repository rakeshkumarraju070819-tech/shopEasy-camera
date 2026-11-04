/** Tiny, dependency-free user-agent parser (browser, OS, device type). */
function parseUserAgent(ua = '') {
  let browser = 'Unknown';
  if (/Edg(e|A|iOS)?\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/SamsungBrowser/.test(ua)) browser = 'Samsung Internet';
  else if (/Firefox\/|FxiOS/.test(ua)) browser = 'Firefox';
  else if (/Chrome\/|CriOS/.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua)) browser = 'Safari';

  let os = 'Unknown';
  if (/Windows NT/.test(ua)) os = 'Windows';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  let deviceType = 'desktop';
  if (/iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) deviceType = 'tablet';
  else if (/Mobi|iPhone|Android/.test(ua)) deviceType = 'mobile';

  return { browser, os, deviceType };
}

module.exports = { parseUserAgent };
