const dns = require("dns");
const net = require("net");

// Reads a web page's title, description, site name and preview image for a bookmark card. The
// URL comes from note content, which can be pasted or imported, so only public http(s) hosts are
// fetched: a bookmark must not become a way to probe the local network or this machine. Every
// redirect is checked again, and each read is capped in time and size.

const BOOKMARK_TIMEOUT_MS = 5000;
const MAX_PAGE_BYTES = 1024 * 1024;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const MAX_TITLE_LENGTH = 300;
const MAX_DESCRIPTION_LENGTH = 600;
// SVG is left out: a preview image never needs to be a document that can carry scripts.
const PREVIEW_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);

class BookmarkUrlError extends Error {}

// IPv4 ranges that are not the public internet: this network, private, carrier-grade NAT,
// loopback, link-local, IETF protocol assignments, benchmarking, multicast and reserved.
const PRIVATE_IPV4_RANGES = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function ipv4ToNumber(address) {
  return address.split(".").reduce((value, part) => value * 256 + Number(part), 0);
}

function isPrivateIpv4(address) {
  const value = ipv4ToNumber(address);
  return PRIVATE_IPV4_RANGES.some(([base, bits]) => {
    const size = 2 ** (32 - bits);
    const start = ipv4ToNumber(base);
    return value >= start && value < start + size;
  });
}

// The eight 16-bit groups of an IPv6 address, with `::` expanded and a trailing dotted IPv4 part
// turned into two groups.
function ipv6Groups(address) {
  let text = address.toLowerCase().replace(/%.*$/, "");
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted) {
    const value = ipv4ToNumber(dotted[1]);
    text = text.slice(0, -dotted[1].length) + `${(value >>> 16).toString(16)}:${(value & 0xffff).toString(16)}`;
  }
  const [head, tail] = text.split("::");
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail ? tail.split(":") : [];
  const missing = text.includes("::") ? 8 - headGroups.length - tailGroups.length : 0;
  return [...headGroups, ...Array(missing).fill("0"), ...tailGroups].map((group) => Number.parseInt(group, 16) || 0);
}

function isPrivateIpv6(address) {
  const groups = ipv6Groups(address);
  const [first] = groups;
  const isZeroPrefix = (count) => groups.slice(0, count).every((group) => group === 0);
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible addresses are judged by their IPv4 part.
  if (isZeroPrefix(5) && (groups[5] === 0xffff || groups[5] === 0)) {
    if (groups[5] === 0 && groups[6] === 0 && groups[7] <= 1) {
      return true;
    }
    const v4 = `${groups[6] >>> 8}.${groups[6] & 0xff}.${groups[7] >>> 8}.${groups[7] & 0xff}`;
    return isPrivateIpv4(v4);
  }
  // NAT64 (64:ff9b::/96) embeds an IPv4 address too.
  if (first === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every((group) => group === 0)) {
    const v4 = `${groups[6] >>> 8}.${groups[6] & 0xff}.${groups[7] >>> 8}.${groups[7] & 0xff}`;
    return isPrivateIpv4(v4);
  }
  return (
    (first & 0xfe00) === 0xfc00 || // unique local fc00::/7
    (first & 0xffc0) === 0xfe80 || // link-local fe80::/10
    (first & 0xffc0) === 0xfec0 || // site-local fec0::/10
    (first & 0xff00) === 0xff00 || // multicast ff00::/8
    first === 0x2001 && groups[1] === 0x0db8 // documentation 2001:db8::/32
  );
}

function isPrivateAddress(address) {
  const family = net.isIP(address);
  if (family === 4) {
    return isPrivateIpv4(address);
  }
  if (family === 6) {
    return isPrivateIpv6(address);
  }
  return true;
}

// The parsed URL when it may be fetched as a bookmark; throws otherwise. Host names are checked
// again once resolved (see assertPublicHost).
function parseBookmarkUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url ?? "").trim());
  } catch {
    throw new BookmarkUrlError("This is not a web address.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new BookmarkUrlError("Only http and https addresses can be bookmarked.");
  }
  if (parsed.username || parsed.password) {
    throw new BookmarkUrlError("Addresses with a user name or password cannot be bookmarked.");
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new BookmarkUrlError("Local addresses cannot be bookmarked.");
  }
  if (net.isIP(host) && isPrivateAddress(host)) {
    throw new BookmarkUrlError("Private network addresses cannot be bookmarked.");
  }
  return parsed;
}

async function assertPublicHost(parsed, lookup) {
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) {
    return;
  }
  const addresses = await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new BookmarkUrlError("Private network addresses cannot be bookmarked.");
  }
}

// Fetches `url` following at most MAX_REDIRECTS redirects, each to a public http(s) host.
async function fetchPublic(url, { fetch, lookup, signal, accept }) {
  let current = parseBookmarkUrl(url);
  for (let redirects = 0; ; redirects += 1) {
    await assertPublicHost(current, lookup);
    const response = await fetch(current.href, {
      redirect: "manual",
      signal,
      headers: { accept, "user-agent": "NotePane bookmark preview" },
    });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel().catch(() => {});
      if (redirects >= MAX_REDIRECTS) {
        throw new Error("Too many redirects.");
      }
      current = parseBookmarkUrl(new URL(location, current).href);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`The page answered with HTTP ${response.status}.`);
    }
    return { response, finalUrl: current.href };
  }
}

// Reads at most `maxBytes` of the body. A page longer than that is cut, since its head comes
// first; `rejectLarger` makes a longer body an error instead, for an image.
async function readCapped(response, maxBytes, { rejectLarger = false } = {}) {
  const chunks = [];
  let total = 0;
  if (!response.body) {
    return Buffer.alloc(0);
  }
  const reader = response.body.getReader();
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) {
      return Buffer.concat(chunks, total);
    }
    chunks.push(value);
    total += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  if (rejectLarger) {
    throw new Error("The preview image is too large.");
  }
  return Buffer.concat(chunks, total).subarray(0, maxBytes);
}

function contentType(response) {
  return response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
}

function decodeHtml(buffer, response) {
  const charset = /charset=["']?([\w-]+)/i.exec(response.headers.get("content-type") ?? "")?.[1]
    ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(buffer.subarray(0, 4096).toString("latin1"))?.[1]
    ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name) => {
    if (name[0] === "#") {
      const codePoint = name[1].toLowerCase() === "x" ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
      return codePoint > 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity;
    }
    return NAMED_ENTITIES[name.toLowerCase()] ?? entity;
  });
}

function cleanText(text, maxLength) {
  const clean = decodeEntities(String(text ?? "")).replace(/\s+/g, " ").trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1).trimEnd()}…` : clean;
}

// The attributes of one tag, names lower-cased. Values may be double-, single- or unquoted.
function tagAttributes(tag) {
  const attributes = {};
  for (const [, name, doubleQuoted, singleQuoted, bare] of tag.matchAll(
    /([^\s"'<>/=]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g,
  )) {
    attributes[name.toLowerCase()] ??= doubleQuoted ?? singleQuoted ?? bare ?? "";
  }
  return attributes;
}

/**
 * The bookmark fields found in an HTML page: Open Graph values first, then the page's own title
 * and description. `pageUrl` resolves a relative image address. A small regular-expression reader
 * is enough here, since only the head's title and meta tags are read and nothing is rendered.
 */
function parseBookmarkMetadata(html, pageUrl) {
  const source = String(html ?? "").replace(/<!--[\s\S]*?-->/g, "");
  const meta = {};
  for (const [tag] of source.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = tagAttributes(tag.slice(5, -1));
    const key = (attributes.property ?? attributes.name ?? "").toLowerCase();
    if (key && attributes.content !== undefined && !(key in meta)) {
      meta[key] = attributes.content;
    }
  }
  const titleTag = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(source)?.[1] ?? "";
  let imageUrl = "";
  const image = meta["og:image"] ?? meta["og:image:url"] ?? meta["og:image:secure_url"] ?? meta["twitter:image"];
  if (image) {
    try {
      const resolved = new URL(decodeEntities(image.trim()), pageUrl);
      imageUrl = resolved.protocol === "http:" || resolved.protocol === "https:" ? resolved.href : "";
    } catch {
      imageUrl = "";
    }
  }
  return {
    title: cleanText(meta["og:title"] ?? meta["twitter:title"] ?? titleTag, MAX_TITLE_LENGTH),
    description: cleanText(
      meta["og:description"] ?? meta.description ?? meta["twitter:description"] ?? "",
      MAX_DESCRIPTION_LENGTH,
    ),
    siteName: cleanText(meta["og:site_name"] ?? "", MAX_TITLE_LENGTH),
    imageUrl,
  };
}

// A signal that aborts after `ms`, with a timer that keeps the process waiting for it, unlike
// AbortSignal.timeout. `clear` stops it once the read is done.
function timeoutSignal(ms) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException("The page did not answer in time.", "TimeoutError")),
    ms,
  );
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function readPage(url, { fetch, lookup, timeoutMs }) {
  const { signal, clear } = timeoutSignal(timeoutMs);
  try {
    const { response, finalUrl } = await fetchPublic(url, {
      fetch,
      lookup,
      signal,
      accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
    });
    const type = contentType(response);
    if (type !== "text/html" && type !== "application/xhtml+xml") {
      await response.body?.cancel().catch(() => {});
      return { title: "", description: "", siteName: "", imageUrl: "" };
    }
    return parseBookmarkMetadata(decodeHtml(await readCapped(response, MAX_PAGE_BYTES), response), finalUrl);
  } finally {
    clear();
  }
}

// The preview image's bytes and type, or null for an image that is not a usable raster image.
async function readPreviewImage(url, { fetch, lookup, timeoutMs }) {
  const { signal, clear } = timeoutSignal(timeoutMs);
  try {
    const { response } = await fetchPublic(url, { fetch, lookup, signal, accept: "image/*" });
    const type = contentType(response);
    if (!PREVIEW_IMAGE_TYPES.has(type)) {
      await response.body?.cancel().catch(() => {});
      return null;
    }
    const bytes = await readCapped(response, MAX_IMAGE_BYTES, { rejectLarger: true });
    return bytes.length ? { bytes, type } : null;
  } finally {
    clear();
  }
}

/**
 * Fetches the bookmark fields for `url`. The preview image is downloaded too and handed to
 * `storeImage(buffer, mimeType)`, which gives the URL the card shows, so a note never hot-links
 * a remote image. A missing or unusable image leaves `imageUrl` empty rather than failing.
 */
async function fetchBookmarkMetadata(url, {
  fetch = globalThis.fetch,
  lookup = dns.promises.lookup,
  storeImage,
  timeoutMs = BOOKMARK_TIMEOUT_MS,
} = {}) {
  const metadata = await readPage(url, { fetch, lookup, timeoutMs });
  let imageUrl = "";
  if (metadata.imageUrl && storeImage) {
    try {
      const image = await readPreviewImage(metadata.imageUrl, { fetch, lookup, timeoutMs });
      imageUrl = image ? await storeImage(image.bytes, image.type) : "";
    } catch {
      // The card is still useful without its image.
      imageUrl = "";
    }
  }
  return { ...metadata, imageUrl };
}

module.exports = {
  BOOKMARK_TIMEOUT_MS,
  BookmarkUrlError,
  MAX_PAGE_BYTES,
  fetchBookmarkMetadata,
  isPrivateAddress,
  parseBookmarkMetadata,
  parseBookmarkUrl,
};
