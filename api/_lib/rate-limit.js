/**
 * Simple in-memory rate limiter for Vercel serverless functions.
 *
 * Each limiter instance maintains a Map of IP → { count, resetTime }.
 * Because Vercel reuses warm function instances, this provides
 * reasonable throttling without external infrastructure.
 *
 * Limits and body-size caps are read from config.json at module load.
 *
 * Usage:
 *   const limiter = createRateLimiter('guestRespond');
 *   // in handler:
 *   if (limiter.check(req, res)) return;  // already sent 429
 */

const fs = require('fs');
const path = require('path');

let config = {};
try {
  config = JSON.parse(fs.readFileSync(path.join(__dirname, '../../config.json'), 'utf8'));
} catch (e) { /* use defaults */ }

const rateLimits = config.rateLimits || {};
const DEFAULT_WINDOW_MS = 60 * 1000;
const DEFAULT_MAX = 30;
const DEFAULT_MAX_BODY = config.maxBodyBytes || 65536;

/**
 * Create a rate limiter.
 * @param {string|{windowMs?: number, max?: number}} nameOrOpts
 *   Config key (e.g. 'guestRespond') or explicit { windowMs, max }.
 */
function createRateLimiter(nameOrOpts) {
  const opts = typeof nameOrOpts === 'string'
    ? (rateLimits[nameOrOpts] || {})
    : (nameOrOpts || {});
  const windowMs = opts.windowMs || DEFAULT_WINDOW_MS;
  const max = opts.max || DEFAULT_MAX;
  const hits = new Map();

  return {
    /**
     * Check rate limit. Returns true (and sends 429) if blocked.
     */
    check(req, res) {
      const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
      const now = Date.now();
      let entry = hits.get(ip);

      if (!entry || now > entry.resetTime) {
        entry = { count: 0, resetTime: now + windowMs };
        hits.set(ip, entry);
      }

      entry.count++;

      if (entry.count > max) {
        res.status(429).json({ error: 'Too many requests, please try again later' });
        return true;
      }
      return false;
    }
  };
}

/**
 * Check request body size. Returns true (and sends 413) if too large.
 * @param {number} [maxBytes] - override from config.maxBodyBytes
 */
function checkBodySize(req, res, maxBytes) {
  const limit = maxBytes || DEFAULT_MAX_BODY;
  const contentLength = parseInt(req.headers['content-length'], 10);

  if (contentLength > limit) {
    res.status(413).json({ error: 'Request body too large' });
    return true;
  }

  // Fallback: check serialized body size (Vercel pre-parses JSON)
  if (req.body && JSON.stringify(req.body).length > limit) {
    res.status(413).json({ error: 'Request body too large' });
    return true;
  }

  return false;
}

module.exports = { createRateLimiter, checkBodySize };
