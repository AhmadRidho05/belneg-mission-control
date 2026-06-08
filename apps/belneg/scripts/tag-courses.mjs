// AI-powered O*NET skill tagger for course_catalog.
//
// Strategy:
//   1. Fetch untagged courses (LIMIT --max, default 250)
//   2. Fetch full O*NET taxonomy (35 skills + 33 knowledge = 68 elements)
//   3. Build one Batch API request per course: a tool_use forced response
//      whose input is { tags: [{element_id, coverage, confidence}, ...] }
//   4. Submit the batch (Anthropic Batch API gives ~50% discount)
//   5. Poll until status='ended'
//   6. Stream results, INSERT into course_skill_tags, UPDATE tagged_at
//
// Cost (Claude Haiku 4.5, batch discount): ~$0.30–$0.50 for 200 courses.
//
// Usage:
//   ANTHROPIC_API_KEY=... node apps/belneg/scripts/tag-courses.mjs [--max 100] [--force]
//   --force re-tags courses that already have tagged_at set
//
// Requires: ANTHROPIC_API_KEY in env (shell or .env.local).

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@libsql/client";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("✗ ANTHROPIC_API_KEY required (export in shell or add to .env.local)");
  process.exit(1);
}
if (!process.env.TURSO_DATABASE_URL) {
  console.error("✗ TURSO_DATABASE_URL missing — load .env.local first");
  process.exit(1);
}

// ─── CLI args ───
let maxCourses = 250;
let force = false;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--max" && process.argv[i + 1]) maxCourses = parseInt(process.argv[++i], 10);
  if (process.argv[i] === "--force") force = true;
}

const MODEL = "claude-haiku-4-5";
const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_MIN = 30;

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── 1. Fetch untagged courses ───
console.log("\n[1/6] Fetching untagged courses …");
const courseQ = force
  ? `SELECT id, title, provider, description FROM course_catalog WHERE active = 1 LIMIT ?`
  : `SELECT id, title, provider, description FROM course_catalog
     WHERE active = 1 AND (tagged_at IS NULL OR tagged_at < datetime('now','-30 days'))
     LIMIT ?`;
const coursesRes = await db.execute({ sql: courseQ, args: [maxCourses] });
const courses = coursesRes.rows;
console.log(`  found ${courses.length} courses to tag`);
if (courses.length === 0) {
  console.log("✓ Nothing to do.");
  await db.close();
  process.exit(0);
}

// ─── 2. Fetch O*NET taxonomy ───
console.log("\n[2/6] Fetching O*NET taxonomy …");
const skillsRes = await db.execute(
  `SELECT element_id, element_name, category, 'skill' AS kind FROM onet_skills`
);
const knowRes = await db.execute(
  `SELECT element_id, element_name, category, 'knowledge' AS kind FROM onet_knowledge`
);
const taxonomy = [...skillsRes.rows, ...knowRes.rows];
console.log(`  ${taxonomy.length} elements (${skillsRes.rows.length} skills + ${knowRes.rows.length} knowledge)`);
const validElementIds = new Set(taxonomy.map(t => t.element_id));

const taxonomyText = taxonomy.map(t =>
  `${t.element_id} (${t.kind}): ${t.element_name}${t.category ? ` — ${t.category}` : ""}`
).join("\n");

// ─── 3. Build batch requests ───
console.log("\n[3/6] Building batch requests …");
const tool = {
  name: "submit_tags",
  description: "Submit O*NET skill/knowledge tags identifying what this course teaches.",
  input_schema: {
    type: "object",
    properties: {
      tags: {
        type: "array",
        description: "List of O*NET elements this course teaches. Include 3–10 tags, ranked by relevance.",
        items: {
          type: "object",
          properties: {
            element_id: {
              type: "string",
              description: "Exact element_id from the provided taxonomy (e.g. '2.A.1.a').",
            },
            coverage: {
              type: "string",
              enum: ["foundational", "developing", "proficient"],
              description: "How deeply this course covers the element. foundational = first exposure / intro; developing = practical mid-level; proficient = course will make student competent.",
            },
            confidence: {
              type: "number",
              description: "Confidence 0.0–1.0 that this element is genuinely taught by this course.",
            },
          },
          required: ["element_id", "coverage", "confidence"],
        },
        minItems: 1,
      },
    },
    required: ["tags"],
  },
};

const requests = courses.map(c => ({
  custom_id: c.id,
  params: {
    model: MODEL,
    max_tokens: 1024,
    tools: [tool],
    tool_choice: { type: "tool", name: "submit_tags" },
    system: [
      "You are a precise O*NET career-skill tagger.",
      "Given a course's metadata, identify which O*NET skills/knowledge elements the course actually teaches.",
      "Be conservative — only include elements the course materially covers, not adjacent ones.",
      "Use ONLY element_ids from the provided taxonomy. Never invent ids.",
      "",
      "O*NET TAXONOMY (68 elements):",
      taxonomyText,
    ].join("\n"),
    messages: [{
      role: "user",
      content: `Course title: ${c.title}\nProvider: ${c.provider}\nDescription: ${c.description}\n\nTag this course.`,
    }],
  },
}));
console.log(`  ${requests.length} requests prepared`);

// ─── 4. Submit batch ───
console.log("\n[4/6] Submitting Batch API request …");
const batch = await anthropic.messages.batches.create({ requests });
console.log(`  batch_id: ${batch.id}, processing_status: ${batch.processing_status}`);

// ─── 5. Poll ───
console.log("\n[5/6] Polling batch status …");
const start = Date.now();
let current = batch;
while (current.processing_status !== "ended") {
  if ((Date.now() - start) / 60000 > MAX_POLL_MIN) {
    console.error(`✗ Batch did not complete within ${MAX_POLL_MIN} minutes. batch_id: ${batch.id}`);
    process.exit(2);
  }
  await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  current = await anthropic.messages.batches.retrieve(batch.id);
  const elapsed = Math.round((Date.now() - start) / 1000);
  const counts = current.request_counts || {};
  process.stdout.write(`\r  ${elapsed}s elapsed — status: ${current.processing_status} · processing: ${counts.processing ?? "?"} · succeeded: ${counts.succeeded ?? "?"} · errored: ${counts.errored ?? "?"}    `);
}
console.log("\n  ✓ batch ended");
console.log("  request_counts:", current.request_counts);

// ─── 6. Stream results + INSERT tags ───
console.log("\n[6/6] Streaming results + inserting tags …");
let tagInserted = 0;
let succeeded = 0;
let errored = 0;
const taggedCourseIds = [];

for await (const r of await anthropic.messages.batches.results(batch.id)) {
  const courseId = r.custom_id;
  if (r.result.type !== "succeeded") {
    errored++;
    console.error(`  ✗ ${courseId}: ${r.result.type} — ${JSON.stringify(r.result.error || {}).slice(0, 100)}`);
    continue;
  }
  succeeded++;
  const msg = r.result.message;
  // Find the tool_use block
  const toolUse = msg.content.find(b => b.type === "tool_use" && b.name === "submit_tags");
  if (!toolUse) {
    console.error(`  ✗ ${courseId}: no tool_use found in response`);
    continue;
  }
  const tags = toolUse.input?.tags || [];
  if (tags.length === 0) {
    console.warn(`  ⚠ ${courseId}: zero tags returned`);
    continue;
  }

  // Filter to valid element_ids only (defend against hallucinated ids)
  const validTags = tags.filter(t => validElementIds.has(t.element_id));
  if (validTags.length === 0) {
    console.warn(`  ⚠ ${courseId}: all ${tags.length} tags had unknown element_ids`);
    continue;
  }
  if (validTags.length < tags.length) {
    console.warn(`  ⚠ ${courseId}: dropped ${tags.length - validTags.length} unknown element_ids`);
  }

  // Replace existing tags for this course
  await db.execute({ sql: `DELETE FROM course_skill_tags WHERE course_id = ?`, args: [courseId] });
  const stmts = validTags.map(t => ({
    sql: `INSERT OR REPLACE INTO course_skill_tags (course_id, onet_element_id, coverage, confidence)
          VALUES (?,?,?,?)`,
    args: [courseId, t.element_id, t.coverage, Number(t.confidence) || 0.5],
  }));
  await db.batch(stmts, "write");
  tagInserted += validTags.length;
  taggedCourseIds.push(courseId);
}

// Update tagged_at for successfully tagged courses
if (taggedCourseIds.length > 0) {
  const idPlaceholders = taggedCourseIds.map(() => "?").join(",");
  await db.execute({
    sql: `UPDATE course_catalog SET tagged_at = CURRENT_TIMESTAMP WHERE id IN (${idPlaceholders})`,
    args: taggedCourseIds,
  });
}

console.log(`\n✓ Done.`);
console.log(`  courses_succeeded: ${succeeded}`);
console.log(`  courses_errored: ${errored}`);
console.log(`  tags_inserted: ${tagInserted}`);

const u = current.usage || {};
console.log(`\n  Token usage (whole batch):`);
console.log(`    input_tokens:  ${u.input_tokens ?? "?"}`);
console.log(`    output_tokens: ${u.output_tokens ?? "?"}`);

await db.close();
