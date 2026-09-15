export interface SearchResult {
	title: string;
	url: string;
	snippet: string;
}

export interface StructuredSearchArgs {
	query?: string;
	exactPhrases?: string[];
	excludeTerms?: string[];
	site?: string;
	count?: number;
}

export interface BuiltSearchQuery {
	query: string;
	providerQuery: string;
	baseQuery?: string;
	exactPhrases: string[];
	excludeTerms: string[];
	site?: string;
}

interface YouWebResult {
	title?: unknown;
	url?: unknown;
	description?: unknown;
	snippets?: unknown;
}

function stripWrappingQuotes(value: string): string {
	return value.length >= 2 && value.startsWith('"') && value.endsWith('"')
		? value.slice(1, -1).trim()
		: value;
}

function cleanItems(values?: string[]): string[] {
	if (!values) return [];
	return values
		.map((value) => stripWrappingQuotes(value.trim().replace(/\s+/g, " ")))
		.filter(Boolean);
}

function cleanQuery(value?: string): string | undefined {
	if (typeof value !== "string") return undefined;
	const cleaned = value.trim().replace(/\s+/g, " ");
	return cleaned || undefined;
}

export function normalizeSite(site?: string): string | undefined {
	if (typeof site !== "string") return undefined;

	const value = site.trim().replace(/^site:/i, "").trim();
	if (!value) return undefined;

	try {
		const candidate = value.startsWith("//")
			? `https:${value}`
			: /^[a-z][a-z\d+.-]*:\/\//i.test(value)
				? value
				: `https://${value}`;
		const hostname = new URL(candidate).hostname
			.toLowerCase()
			.replace(/\.$/, "");
		return hostname || undefined;
	} catch {
		return undefined;
	}
}

function quoteForSearch(value: string): string {
	return `"${value.replace(/"/g, '\\"')}"`;
}

export function buildSearchQuery(
	args: StructuredSearchArgs,
): BuiltSearchQuery {
	const baseQuery = cleanQuery(args.query);
	const exactPhrases = cleanItems(args.exactPhrases);
	const excludeTerms = cleanItems(args.excludeTerms);
	const site = normalizeSite(args.site);

	if (!baseQuery && exactPhrases.length === 0) {
		throw new Error(
			"At least one of 'query' or 'exactPhrases' is required.",
		);
	}

	const parts: string[] = [];
	if (baseQuery) parts.push(baseQuery);
	for (const phrase of exactPhrases) {
		parts.push(quoteForSearch(phrase));
	}
	for (const term of excludeTerms) {
		parts.push(`-${term.includes(" ") ? quoteForSearch(term) : term}`);
	}

	const providerQuery = parts.join(" ");
	return {
		query: site ? `${providerQuery} site:${site}` : providerQuery,
		providerQuery,
		baseQuery,
		exactPhrases,
		excludeTerms,
		site,
	};
}

function normalizeText(value: unknown): string {
	return typeof value === "string"
		? value.trim().replace(/\s+/g, " ")
		: "";
}

function resultSnippet(result: YouWebResult): string {
	const description = normalizeText(result.description);
	if (description) return description;

	if (typeof result.snippets === "string") {
		return normalizeText(result.snippets);
	}
	if (Array.isArray(result.snippets)) {
		for (const snippet of result.snippets) {
			const normalized = normalizeText(snippet);
			if (normalized) return normalized;
		}
	}
	return "";
}

export async function youSearch(
	query: string,
	count: number,
	apiKey: string,
	site?: string,
	signal?: AbortSignal,
): Promise<SearchResult[]> {
	const body: {
		query: string;
		count: number;
		include_domains?: string[];
	} = { query, count };
	if (site) body.include_domains = [site];

	const response = await fetch("https://ydc-index.io/v1/search", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-API-Key": apiKey,
		},
		body: JSON.stringify(body),
		signal,
	});
	if (!response.ok) {
		const responseBody = await response.text();
		throw new Error(
			`You.com API ${response.status}: ${responseBody.slice(0, 200)}`,
		);
	}

	const data = (await response.json()) as {
		results?: { web?: unknown };
	};
	const webResults = data.results?.web;
	if (!Array.isArray(webResults)) return [];

	const results: SearchResult[] = [];
	const seenUrls = new Set<string>();
	for (const rawResult of webResults) {
		if (!rawResult || typeof rawResult !== "object") continue;
		const result = rawResult as YouWebResult;
		const url = normalizeText(result.url);
		if (!url || seenUrls.has(url)) continue;

		seenUrls.add(url);
		results.push({
			title: normalizeText(result.title),
			url,
			snippet: resultSnippet(result),
		});
		if (results.length >= count) break;
	}
	return results;
}
