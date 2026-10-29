const test = require("node:test");
const assert = require("node:assert/strict");
const {
  BOOKMARK_TIMEOUT_MS,
  MAX_PAGE_BYTES,
  fetchBookmarkMetadata,
  isPrivateAddress,
  parseBookmarkMetadata,
  parseBookmarkUrl,
} = require("../../electron/bookmarkMetadata.cjs");

const PNG_BYTES = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

// A fetch that answers from `routes`, keyed by URL, and records each request.
function stubFetch(routes) {
  const requests = [];
  const fetch = async (url, options) => {
    requests.push({ url, options });
    const route = routes[url];
    if (!route) {
      return new Response("missing", { status: 404 });
    }
    return typeof route === "function" ? route(options) : route();
  };
  return { fetch, requests };
}

const html = (body, headers = {}) => () =>
  new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8", ...headers } });

test("caps a bookmark read at 5 seconds and 1 MB", () => {
  assert.equal(BOOKMARK_TIMEOUT_MS, 5000);
  assert.equal(MAX_PAGE_BYTES, 1024 * 1024);
});

test("reads Open Graph fields in any attribute order and quoting", () => {
  const metadata = parseBookmarkMetadata(`
    <html><head>
      <title>Fallback title</title>
      <meta content="Open &amp; shut" property="og:title">
      <meta property='og:description' content='A &quot;quoted&quot; description &#8212; with &#x2019;entities&#x2019;'>
      <meta property=og:site_name content=Example>
      <meta property="og:image" content="/images/card.png">
    </head></html>`, "https://example.com/articles/1");

  assert.deepEqual(metadata, {
    title: "Open & shut",
    description: "A \"quoted\" description \u2014 with \u2019entities\u2019",
    siteName: "Example",
    imageUrl: "https://example.com/images/card.png",
  });
});

test("falls back to the title tag and the meta description", () => {
  const metadata = parseBookmarkMetadata(`
    <!-- <meta property="og:title" content="Commented out"> -->
    <TITLE>
      Plain   page
    </TITLE>
    <meta name="Description" content="What the page is about">`, "https://example.com/");

  assert.equal(metadata.title, "Plain page");
  assert.equal(metadata.description, "What the page is about");
  assert.equal(metadata.siteName, "");
  assert.equal(metadata.imageUrl, "");
});

test("keeps only an http(s) preview image and caps long text", () => {
  const long = "word ".repeat(400);
  const metadata = parseBookmarkMetadata(
    `<meta property="og:image" content="javascript:alert(1)"><meta property="og:description" content="${long}">`,
    "https://example.com/",
  );

  assert.equal(metadata.imageUrl, "");
  assert.ok(metadata.description.length <= 600);
  assert.ok(metadata.description.endsWith("…"));
});

test("accepts public http and https addresses", () => {
  assert.equal(parseBookmarkUrl(" https://example.com/a?b=1 ").href, "https://example.com/a?b=1");
  assert.equal(parseBookmarkUrl("http://93.184.216.34/").hostname, "93.184.216.34");
});

test("refuses other schemes, credentials and local or private hosts", () => {
  for (const url of [
    "ftp://example.com/",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "notepane-asset://local/abc.png",
    "https://user:secret@example.com/",
    "http://localhost:5173/",
    "http://printer.local/",
    "http://127.0.0.1/",
    "http://10.0.0.8/",
    "http://172.20.1.1/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://100.64.0.1/",
    "http://0.0.0.0/",
    "http://[::1]/",
    "http://[fe80::1]/",
    "http://[fd00::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:7f00:1]/",
    "not a url",
  ]) {
    assert.throws(() => parseBookmarkUrl(url), Error, url);
  }
});

test("tells private and public addresses apart", () => {
  for (const address of ["127.0.0.1", "10.1.2.3", "172.31.255.255", "192.168.0.1", "169.254.1.1", "224.0.0.1", "::1", "::", "fc00::1", "fe80::1", "::ffff:10.0.0.1", "64:ff9b::a00:1"]) {
    assert.equal(isPrivateAddress(address), true, address);
  }
  for (const address of ["93.184.216.34", "172.32.0.1", "8.8.8.8", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
    assert.equal(isPrivateAddress(address), false, address);
  }
});

test("fetches a page and stores its preview image as an asset", async () => {
  const { fetch, requests } = stubFetch({
    "https://example.com/post": html(
      '<title>Post</title><meta property="og:image" content="https://cdn.example.com/card.png">',
    ),
    "https://cdn.example.com/card.png": () =>
      new Response(PNG_BYTES, { status: 200, headers: { "content-type": "image/png" } }),
  });
  const stored = [];

  const metadata = await fetchBookmarkMetadata("https://example.com/post", {
    fetch,
    lookup: publicLookup,
    storeImage: (buffer, mimeType) => {
      stored.push({ buffer, mimeType });
      return "notepane-asset://local/card.png";
    },
  });

  assert.equal(metadata.title, "Post");
  assert.equal(metadata.imageUrl, "notepane-asset://local/card.png");
  assert.deepEqual(stored.map(({ buffer, mimeType }) => [Buffer.from(buffer).equals(PNG_BYTES), mimeType]), [[true, "image/png"]]);
  assert.equal(requests[0].options.redirect, "manual");
});

test("skips a preview image that is SVG", async () => {
  const { fetch } = stubFetch({
    "https://example.com/": html('<meta property="og:image" content="https://example.com/card.svg">'),
    "https://example.com/card.svg": () =>
      new Response("<svg/>", { status: 200, headers: { "content-type": "image/svg+xml" } }),
  });
  const metadata = await fetchBookmarkMetadata("https://example.com/", {
    fetch,
    lookup: publicLookup,
    storeImage: () => assert.fail("an SVG must not be stored"),
  });

  assert.equal(metadata.imageUrl, "");
});

test("refuses a host name that resolves to a private address", async () => {
  const { fetch, requests } = stubFetch({});
  await assert.rejects(
    fetchBookmarkMetadata("https://intranet.example.com/", {
      fetch,
      lookup: async () => [{ address: "10.0.0.5", family: 4 }],
    }),
    /Private network/,
  );
  assert.equal(requests.length, 0);
});

test("checks every redirect and refuses one to a private address", async () => {
  const { fetch, requests } = stubFetch({
    "https://example.com/go": () =>
      new Response(null, { status: 302, headers: { location: "http://127.0.0.1:8080/admin" } }),
  });

  await assert.rejects(fetchBookmarkMetadata("https://example.com/go", { fetch, lookup: publicLookup }), /Private network/);
  assert.deepEqual(requests.map(({ url }) => url), ["https://example.com/go"]);
});

test("follows a redirect to a public page", async () => {
  const { fetch } = stubFetch({
    "https://example.com/old": () => new Response(null, { status: 301, headers: { location: "/new" } }),
    "https://example.com/new": html("<title>New home</title>"),
  });

  const metadata = await fetchBookmarkMetadata("https://example.com/old", { fetch, lookup: publicLookup });
  assert.equal(metadata.title, "New home");
});

test("reads only the first megabyte of a long page", async () => {
  let pulledBytes = 0;
  const chunk = new TextEncoder().encode("x".repeat(64 * 1024));
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("<title>Long page</title>"));
    },
    pull(controller) {
      pulledBytes += chunk.byteLength;
      controller.enqueue(chunk);
    },
  });
  const { fetch } = stubFetch({
    "https://example.com/long": () => new Response(body, { status: 200, headers: { "content-type": "text/html" } }),
  });

  const metadata = await fetchBookmarkMetadata("https://example.com/long", { fetch, lookup: publicLookup });
  assert.equal(metadata.title, "Long page");
  assert.ok(pulledBytes <= MAX_PAGE_BYTES + chunk.byteLength * 2, `read ${pulledBytes} bytes`);
});

test("gives up when the page does not answer in time", async () => {
  const fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason));
  });

  await assert.rejects(
    fetchBookmarkMetadata("https://example.com/slow", { fetch, lookup: publicLookup, timeoutMs: 20 }),
    (error) => error.name === "TimeoutError",
  );
});

test("reports an HTTP error", async () => {
  const { fetch } = stubFetch({
    "https://example.com/gone": () => new Response("gone", { status: 410 }),
  });

  await assert.rejects(fetchBookmarkMetadata("https://example.com/gone", { fetch, lookup: publicLookup }), /HTTP 410/);
});
