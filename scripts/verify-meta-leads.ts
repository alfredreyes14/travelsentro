/**
 * Stateless checks for lib/meta-leads/lead.ts (lead parsing and webhook
 * payload extraction). No network. Mirrors verify-messenger-webhook.ts.
 *
 * Run via `npm run verify:meta-leads`.
 */
import { extractLeadgenChanges, humanizeFieldName, parseMetaLead } from "../lib/meta-leads/lead";

type CheckResult = { name: string; pass: boolean; detail: string };

function check(name: string, pass: boolean, detail: string): CheckResult {
  return { name, pass, detail };
}

const results: CheckResult[] = [];

{
  const parsed = parseMetaLead(
    {
      id: "123",
      created_time: "2026-10-01T08:00:00+0000",
      form_id: "f1",
      campaign_name: "Japan Autumn",
      ad_name: "Carousel A",
      field_data: [
        { name: "full_name", values: ["Ana Cruz"] },
        { name: "email", values: ["ana@example.com"] },
        { name: "phone_number", values: ["+639171234567"] },
        { name: "when_are_you_planning_to_travel?", values: ["December"] },
        { name: "how_many_pax?", values: ["4"] },
      ],
    },
    "Japan Tour Form"
  );
  results.push(
    check("Standard fields map to contact columns",
      parsed.name === "Ana Cruz" && parsed.email === "ana@example.com" && parsed.phone === "+639171234567",
      JSON.stringify({ name: parsed.name, email: parsed.email, phone: parsed.phone })),
    check("Custom answers become readable message lines",
      parsed.message === "When are you planning to travel? December\nHow many pax? 4",
      JSON.stringify(parsed.message)),
    check("Source details keep form, campaign and ad",
      parsed.details.form_name === "Japan Tour Form" &&
        parsed.details.campaign_name === "Japan Autumn" &&
        parsed.details.ad_name === "Carousel A" &&
        !("adset_name" in parsed.details),
      JSON.stringify(parsed.details)),
    check("Meta's created time is kept", parsed.createdAt === "2026-10-01T08:00:00+0000", String(parsed.createdAt))
  );
}

{
  const parsed = parseMetaLead({
    id: "456",
    field_data: [
      { name: "first_name", values: ["Ben"] },
      { name: "last_name", values: ["Reyes"] },
      { name: "phone_number", values: ["09181234567"] },
      { name: "notes", values: [" "] },
      { name: "budget", values: ["50k"] },
    ],
  });
  results.push(
    check("first_name + last_name combine, blanks dropped, plain labels get a colon",
      parsed.name === "Ben Reyes" && parsed.email === null && parsed.message === "Budget: 50k",
      JSON.stringify(parsed))
  );
}

results.push(
  check("humanizeFieldName", humanizeFieldName("preferred__destination") === "Preferred destination",
    humanizeFieldName("preferred__destination"))
);

{
  const changes = extractLeadgenChanges({
    object: "page",
    entry: [
      {
        id: "446521218543410",
        changes: [
          { field: "leadgen", value: { leadgen_id: 999, form_id: "f1", page_id: "446521218543410" } },
          { field: "feed", value: { item: "post" } },
        ],
      },
      { id: "x", messaging: [{ sender: { id: "1" } }] },
    ],
  });
  results.push(
    check("Only leadgen changes are extracted, IDs as strings",
      changes.length === 1 && changes[0].leadgen_id === "999" && changes[0].page_id === "446521218543410",
      JSON.stringify(changes)),
    check("Garbage payload yields nothing", extractLeadgenChanges(null).length === 0 && extractLeadgenChanges({ entry: "x" }).length === 0, "ok")
  );
}

let failed = 0;
for (const r of results) {
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name} -- ${r.detail}`);
  if (!r.pass) failed++;
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
if (failed) process.exit(1);
