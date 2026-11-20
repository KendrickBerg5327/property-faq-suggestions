import assert from "node:assert/strict";
import test from "node:test";
import { chooseFaq, faqEntries, validateSuggestionBody } from "./property-faq-service.ts";

test("a lease question selects the tenant document FAQ first", () => {
  const body = validateSuggestionBody({ propertyId: "building-17", question: "Where can I upload my lease?" });
  const suggestions = chooseFaq(body.question, faqEntries, ["tenant-documents", "maintenance-status"]);
  assert.equal(suggestions[0]?.id, "tenant-documents");
  assert.match(suggestions[0]?.answer ?? "", /lease/);
});
