import assert from "node:assert/strict";
import test from "node:test";

async function loadBackend() {
	try {
		return await import("./you-search.ts");
	} catch (error) {
		assert.fail(`You.com search backend is not implemented: ${String(error)}`);
	}
}

test("buildSearchQuery preserves operators while keeping site out of the provider query", async () => {
	const { buildSearchQuery } = await loadBackend();
	const built = buildSearchQuery({
		query: "  climate   policy ",
		exactPhrases: ["\"carbon tax\""],
		excludeTerms: ["opinion", "press release"],
		site: "https://Sub.Example.com:443/reports?q=1",
	});

	assert.deepEqual(built, {
		query:
		'climate policy "carbon tax" -opinion -"press release" site:sub.example.com',
		providerQuery: 'climate policy "carbon tax" -opinion -"press release"',
		baseQuery: "climate policy",
		exactPhrases: ["carbon tax"],
		excludeTerms: ["opinion", "press release"],
		site: "sub.example.com",
	});
});

test("buildSearchQuery requires query or exactPhrases", async () => {
	const { buildSearchQuery } = await loadBackend();

	assert.throws(
		() => buildSearchQuery({ excludeTerms: ["noise"] }),
		/At least one of 'query' or 'exactPhrases' is required/,
	);
	assert.equal(
		buildSearchQuery({ exactPhrases: ["standalone phrase"] }).providerQuery,
		'"standalone phrase"',
	);
});

test("normalizeSite extracts a lowercase domain from bare and URL-like values", async () => {
	const { normalizeSite } = await loadBackend();

	assert.equal(normalizeSite("Example.COM/path"), "example.com");
	assert.equal(normalizeSite("site: https://WWW.Example.com/articles"), "www.example.com");
	assert.equal(normalizeSite("//docs.Example.com/guide"), "docs.example.com");
	assert.equal(normalizeSite("   "), undefined);
});

test("youSearch sends the exact POST body and API headers", async () => {
	const { youSearch } = await loadBackend();
	const originalFetch = globalThis.fetch;
	let capturedInput: string | URL | Request | undefined;
	let capturedInit: RequestInit | undefined;
	globalThis.fetch = async (input, init) => {
		capturedInput = input;
		capturedInit = init;
		return Response.json({ results: { web: [] } });
	};

	try {
		await youSearch(
			'climate policy "carbon tax" -opinion',
			3,
			"test-key",
			"example.com",
		);
	} finally {
		globalThis.fetch = originalFetch;
	}

	assert.equal(capturedInput, "https://ydc-index.io/v1/search");
	assert.equal(capturedInit?.method, "POST");
	assert.deepEqual(capturedInit?.headers, {
		"Content-Type": "application/json",
		"X-API-Key": "test-key",
	});
	assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
		query: 'climate policy "carbon tax" -opinion',
		count: 3,
		include_domains: ["example.com"],
	});
});

test("youSearch omits include_domains when no site is provided", async () => {
	const { youSearch } = await loadBackend();
	const originalFetch = globalThis.fetch;
	let requestBody: unknown;
	globalThis.fetch = async (_input, init) => {
		requestBody = JSON.parse(String(init?.body));
		return Response.json({ results: { web: [] } });
	};

	try {
		await youSearch("weather", 5, "test-key");
	} finally {
		globalThis.fetch = originalFetch;
	}

	assert.deepEqual(requestBody, { query: "weather", count: 5 });
});

test("youSearch normalizes only web results, falls back to snippets, deduplicates URLs, and applies count", async () => {
	const { youSearch } = await loadBackend();
	const originalFetch = globalThis.fetch;
	globalThis.fetch = async () =>
		Response.json({
			results: {
				web: [
					{
						title: " First ",
						url: "https://example.com/one",
						description: "Line one\nline two",
						snippets: ["ignored fallback"],
					},
					{
						title: "Duplicate",
						url: "https://example.com/one",
						description: "duplicate",
					},
					{
						title: "Second",
						url: "https://example.com/two",
						description: " ",
						snippets: ["", "  Useful\nfallback  ", { text: "not simple" }],
					},
					{
						title: "Third",
						url: "https://example.com/three",
						description: "beyond requested count",
					},
				],
				news: [
					{
						title: "Ignored news",
						url: "https://example.com/news",
						description: "not a web result",
					},
				],
			},
		});

	try {
		assert.deepEqual(await youSearch("test", 2, "test-key"), [
			{
				title: "First",
				url: "https://example.com/one",
				snippet: "Line one line two",
			},
			{
				title: "Second",
				url: "https://example.com/two",
				snippet: "Useful fallback",
			},
		]);
	} finally {
		globalThis.fetch = originalFetch;
	}
});
