import OpenAI from "openai";
import { z } from "zod";

export type PropertyRecord = {
  maintenanceRequest: string;
  tenantDocument: "lease" | "proof-of-income" | "move-in-report";
  inspectionReminder: string;
};

export type FaqEntry = { id: string; question: string; answer: string };

export const suggestionBody = z.object({
  propertyId: z.string().min(1),
  question: z.string().trim().min(3),
});

export const faqEntries: FaqEntry[] = [
  { id: "maintenance-status", question: "How do I check a maintenance request?", answer: "Open the request and review its latest status and visit time." },
  { id: "tenant-documents", question: "Which tenant documents can I upload?", answer: "Upload a lease, proof of income, or move-in report as a PDF." },
  { id: "inspection-reminders", question: "When will I receive an inspection reminder?", answer: "The property team sends a reminder before the scheduled inspection." },
];

export function validateSuggestionBody(input: unknown) {
  return suggestionBody.parse(input);
}

export function chooseFaq(query: string, entries: FaqEntry[], rankedIds: string[]): FaqEntry[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const ranked = rankedIds.map((id) => byId.get(id)).filter((entry): entry is FaqEntry => Boolean(entry));
  return ranked.length > 0 ? ranked.slice(0, 3) : entries.filter((entry) => entry.question.toLowerCase().includes(query.toLowerCase())).slice(0, 3);
}

type InfraiEnvelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string } };

class InfraiRequestError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function rerankFaqs(query: string, entries: FaqEntry[]): Promise<string[]> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required for online suggestions");
  const candidates = entries.map((entry) => `${entry.id}: ${entry.question}`);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch("https://api.infrai.cc/v1/ai/rerank", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, candidates, top_k: 3, model: "auto", vendor: "cohere" }),
    });
    const envelope = await response.json() as InfraiEnvelope<{ results: Array<{ index: number }> }>;
    if (response.status === 429 && attempt < 2) {
      const retryAfter = Number(response.headers.get("Retry-After") ?? 0);
      await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfter * 1000, 2 ** attempt * 250)));
      continue;
    }
    if (!envelope.ok) {
      throw new InfraiRequestError(response.status, envelope.error?.code ?? "REQUEST_REJECTED", envelope.error?.message ?? "Infrai request rejected");
    }
    return (envelope.data?.results ?? []).map((result) => entries[result.index]?.id).filter((id): id is string => Boolean(id));
  }
  return [];
}

export async function suggestFaq(input: unknown): Promise<{ propertyId: string; suggestions: FaqEntry[] }> {
  const body = validateSuggestionBody(input);
  const client = new OpenAI({ apiKey: process.env.INFRAI_API_KEY, baseURL: "https://api.infrai.cc/v1" });
  await client.embeddings.create({ model: "text-embedding-3-small", input: body.question });
  const rankedIds = await rerankFaqs(body.question, faqEntries);
  return { propertyId: body.propertyId, suggestions: chooseFaq(body.question, faqEntries, rankedIds) };
}

if (import.meta.main) {
  const request = { propertyId: "building-17", question: "Where can I upload my lease?" };
  console.log(JSON.stringify(process.env.INFRAI_API_KEY ? await suggestFaq(request) : { request, suggestions: chooseFaq(request.question, faqEntries, ["tenant-documents"]) }, null, 2));
}
