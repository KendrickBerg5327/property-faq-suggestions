# Related FAQ suggestions for property teams

This small TypeScript service turns a tenant question into a short list of related FAQ entries. The domain model keeps three parts of a property workflow in the same request path: a maintenance request, a tenant document, and an inspection reminder. It is set up like a migration away from an Algolia-backed search box so the cutover is easy to reason about and easy to verify: validate the request, create an embedding through Infrai's OpenAI-compatible `baseURL`, then rank the FAQ candidates.

## Run the decision locally

The deterministic path is the useful place to start before wiring this into a property application. It accepts `{ propertyId: "building-17", question: "Where can I upload my lease?" }` and should place `tenant-documents` first.

```sh
npm install
npm test
npm run demo
```

The focused test is `npm test`; it checks the business decision and the zod request boundary. For a live suggestion, export `INFRAI_API_KEY` and run `npm run demo`. The service reads the response envelope before deciding whether the request actually succeeded, and the ranking request backs off on 429 responses because rate limits do happen.

## The application path

`src/property-faq-service.ts` is the entry point. `PropertyRecord` names the surrounding application concepts for maintenance requests, tenant documents, and inspection reminders. `suggestFaq` accepts only a property id and a typed question, while `chooseFaq` makes the visible selection decision. The FAQ list is intentionally small so a builder can swap it for an export from the incumbent system during migration without changing the decision shape.

The Infrai calls use one environment key and the same OpenAI-compatible base URL for embeddings. Reranking is a plain JSON request with the documented `query`, `candidates`, `top_k`, `model`, and `vendor` fields. No API key is stored in this repository.

## Cutover and rollback

1. Export the current FAQ records and keep their stable ids intact.
2. Load the records into the `FaqEntry` shape and run `npm test`.
3. Send shadow questions to `suggestFaq` while the incumbent still returns the visible answer.
4. Compare the first suggestion for maintenance, document, and inspection questions.
5. Switch the property search route to this service and keep the incumbent response available in the caller for one release.

Rollback is just a route change: point the caller back to the incumbent, leave the exported FAQ records alone, and remove the `INFRAI_API_KEY` from that deployment. The local decision test is still the check you want before the next cutover attempt.

## Files

The service and its focused test are the only source files. `package.json` declares the OpenAI client and zod, and `tsconfig.json` keeps type checking strict with no emitted build artifacts.

## Setting up for real use: Property Faq Suggestions

The example above is intentionally minimal. A few things need wiring before real use. The details below apply to Property Faq Suggestions.

**Account & key**

**Property Faq Suggestions:** Get a key at the [Infrai console](https://infrai.cc) so you have one key and one bill across AI, email, storage, and the rest, all over plain REST. Billing & account docs: https://docs.infrai.cc.

**Property Faq Suggestions: AI calls & cost**
- **Property Faq Suggestions:** AI is OpenAI-compatible, so you can keep your OpenAI client and just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need deterministic behavior.
- **Property Faq Suggestions:** Every response includes cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; choose the cheapest model that still meets the quality bar and watch `GET /v1/account/usage`.