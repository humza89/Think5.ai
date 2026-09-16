/**
 * Generate the 15 team headshots with fal.ai (FLUX), one consistent studio
 * look for the whole series, and save them to public/team/<slug>.jpg.
 *
 *   FAL_KEY=... node scripts/generate-team-headshots.mjs            # all 15
 *   FAL_KEY=... node scripts/generate-team-headshots.mjs elena-varga # one
 *
 * Reads FAL_KEY from the environment or from .env.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
if (!process.env.FAL_KEY && fs.existsSync(path.join(root, ".env"))) {
  for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*FAL_KEY\s*=\s*"?([^"\s]+)"?\s*$/);
    if (m) process.env.FAL_KEY = m[1];
  }
}
const KEY = process.env.FAL_KEY;
if (!KEY) {
  console.error("FAL_KEY is not set (put FAL_KEY=... in .env or the environment).");
  process.exit(1);
}

const MODEL = process.env.FAL_MODEL || "fal-ai/flux-pro/v1.1-ultra"; // "raw" mode = candid, unprocessed realism

/** Same studio, same lens, same wardrobe rule for everyone. Only the person changes. */
const STYLE =
  "Unretouched company staff headshot of a real, ordinary office worker at a mid-size tech company, taken by a colleague with a mirrorless " +
  "camera against the plain warm light-grey wall in the office (#e4e0d7), flat even indoor lighting, slight natural shadow. " +
  "Head and shoulders, body square to the camera, chin level, eyes on the lens, relaxed neutral expression or a small polite smile. " +
  "Genuinely average appearance: not a model, plain everyday haircut, real skin with pores, blemishes and uneven tone, slight under-eye " +
  "shadows, natural asymmetry, no makeup, no styling, no retouching. Photorealistic candid documentary quality, neutral colour, sharp, " +
  "no props, no text, no watermark.";

const PEOPLE = [
  { slug: "elena-varga", who: "a Hungarian woman in her early 40s, dark shoulder-length hair with some grey, tired but friendly eyes", wear: "a navy cardigan over a white t-shirt" },
  { slug: "marcus-oyelaran", who: "a Nigerian-British man in his late 30s, short hair, closely trimmed beard, rectangular glasses", wear: "a light blue oxford shirt, top button open" },
  { slug: "sofia-lindqvist", who: "a Swedish woman in her early 50s, greying blonde hair tied back, lined face", wear: "a grey crew-neck sweater" },
  { slug: "rahul-menon", who: "an Indian man in his mid 40s, receding hairline, stubble, thin-framed glasses", wear: "a maroon polo shirt" },
  { slug: "claire-dubois", who: "a French woman in her late 30s, chestnut bob, slightly crooked smile", wear: "a black blazer over a striped top" },
  { slug: "tomas-ferreira", who: "a Brazilian man in his late 30s, dark curly hair, full beard, a bit heavyset", wear: "a plaid flannel shirt" },
  { slug: "amaka-nwosu", who: "a Nigerian woman in her early 40s, natural short hair, round face", wear: "a teal blouse" },
  { slug: "jonas-weber", who: "a German man in his early 40s, short thinning light-brown hair, clean-shaven, pale", wear: "a charcoal quarter-zip pullover" },
  { slug: "hannah-mcallister", who: "a Scottish woman in her mid 40s, auburn hair, freckles, reading glasses", wear: "a dark green sweater" },
  { slug: "diego-salazar", who: "a Colombian man in his early 30s, dark hair, trimmed beard, slightly gap-toothed smile", wear: "a denim shirt" },
  { slug: "yuki-tanaka", who: "a Japanese woman in her mid 30s, straight black hair, no makeup, slight smile", wear: "a beige knit top" },
  { slug: "samuel-adeyemi", who: "a Nigerian man in his late 40s, shaved head, grey-flecked beard, round glasses", wear: "a white shirt with a navy sweater vest" },
  { slug: "ingrid-holm", who: "a Norwegian woman in her late 30s, blonde hair in a loose low bun, tired eyes", wear: "a black turtleneck" },
  { slug: "leila-haddad", who: "a Lebanese woman in her mid 30s, dark curly hair, thick eyebrows, small mole on cheek", wear: "a mustard-yellow blouse" },
  { slug: "owen-fitzgerald", who: "an Irish man in his early 50s, short grey hair, ruddy complexion, clean-shaven", wear: "a light grey shirt under a navy blazer" },
];

const only = process.argv.slice(2);
const targets = only.length ? PEOPLE.filter((p) => only.includes(p.slug)) : PEOPLE;
if (!targets.length) {
  console.error(`Unknown slug(s): ${only.join(", ")}`);
  process.exit(1);
}

async function generate(person, index) {
  const prompt = `${STYLE} Subject: ${person.who}, wearing ${person.wear}.`;
  const submit = await fetch(`https://queue.fal.run/${MODEL}`, {
    method: "POST",
    headers: { Authorization: `Key ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      num_images: 1,
      seed: 5100 + index + Number(process.env.FAL_SEED_OFFSET || 0), // fixed per person; FAL_SEED_OFFSET re-rolls
      safety_tolerance: "2",
      output_format: "jpeg",
      ...(MODEL.includes("ultra")
        ? { aspect_ratio: "4:5", raw: true } // raw mode: less processed, candid realism
        : { image_size: { width: 896, height: 1152 } }),
    }),
  });
  if (!submit.ok) throw new Error(`${person.slug}: submit ${submit.status} ${await submit.text()}`);
  const { request_id, status_url, response_url } = await submit.json();

  // Poll the queue
  for (let i = 0; i < 120; i++) {
    const st = await fetch(status_url, { headers: { Authorization: `Key ${KEY}` } });
    const s = await st.json();
    if (s.status === "COMPLETED") break;
    if (s.status === "FAILED") throw new Error(`${person.slug}: generation failed (${request_id})`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  const res = await fetch(response_url, { headers: { Authorization: `Key ${KEY}` } });
  if (!res.ok) throw new Error(`${person.slug}: result ${res.status} ${await res.text()}`);
  const data = await res.json();
  const url = data.images?.[0]?.url;
  if (!url) throw new Error(`${person.slug}: no image in response ${JSON.stringify(data).slice(0, 200)}`);

  const img = await fetch(url);
  const buf = Buffer.from(await img.arrayBuffer());
  const out = path.join(root, "public/team", `${person.slug}.jpg`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, buf);
  console.log(`✓ ${person.slug} (${Math.round(buf.length / 1024)} KB)`);
}

for (const [i, p] of targets.entries()) {
  const idx = PEOPLE.indexOf(p);
  try {
    await generate(p, idx);
  } catch (e) {
    console.error(`✗ ${e.message}`);
  }
}
