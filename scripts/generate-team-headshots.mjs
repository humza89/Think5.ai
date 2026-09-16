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

const MODEL = process.env.FAL_MODEL || "fal-ai/flux-pro/v1.1";

/** Same studio, same lens, same wardrobe rule for everyone. Only the person changes. */
const STYLE =
  "Professional corporate headshot, tight waist-up framing with the head in the upper third and shoulders filling the frame width, centered, looking directly at camera with a relaxed confident expression, " +
  "wearing a black blazer over a plain black crew-neck top (always black, never beige, never white). " +
  "Backdrop: a plain seamless warm light-grey studio paper (#e4e0d7), evenly lit, exactly the same for every portrait; " +
  "not blue, not dark, not white, no gradient, no vignette. Soft key light from the upper left, gentle rim light, natural skin texture, " +
  "no retouching artifacts. Shot on 85mm lens at f/2.8, shallow depth of field, editorial magazine quality, photorealistic, " +
  "no props, no text, no watermark.";

const PEOPLE = [
  { slug: "elena-varga", who: "a woman in her early 40s, Hungarian, dark shoulder-length hair, warm assured smile" },
  { slug: "marcus-oyelaran", who: "a Nigerian-British man in his late 30s, short hair, closely trimmed beard, calm focused expression" },
  { slug: "sofia-lindqvist", who: "a Swedish woman in her early 50s, silver-blonde hair tied back, composed friendly expression" },
  { slug: "rahul-menon", who: "an Indian man in his mid 40s, short black hair, light stubble, thin-framed glasses, easy smile" },
  { slug: "claire-dubois", who: "a French woman in her late 30s, chestnut bob, subtle smile" },
  { slug: "tomas-ferreira", who: "a Brazilian man in his late 30s, dark wavy hair, full beard, open smile" },
  { slug: "amaka-nwosu", who: "a Nigerian woman in her early 40s, natural short hair, warm confident smile" },
  { slug: "jonas-weber", who: "a German man in his early 40s, short light-brown hair, clean-shaven, steady expression" },
  { slug: "hannah-mcallister", who: "a Scottish woman in her mid 40s, auburn hair, freckles, direct friendly look" },
  { slug: "diego-salazar", who: "a Colombian man in his early 30s, dark hair swept back, trimmed beard, energetic smile" },
  { slug: "yuki-tanaka", who: "a Japanese woman in her mid 30s, straight black hair, small smile, minimal earrings" },
  { slug: "samuel-adeyemi", who: "a Nigerian man in his late 40s, shaved head, grey-flecked beard, thoughtful expression, round glasses" },
  { slug: "ingrid-holm", who: "a Norwegian woman in her late 30s, blonde hair in a low bun, calm expression" },
  { slug: "leila-haddad", who: "a Lebanese woman in her mid 30s, long dark curly hair, bright smile" },
  { slug: "owen-fitzgerald", who: "an Irish man in his early 50s, short grey hair, clean-shaven, measured expression" },
];

const only = process.argv.slice(2);
const targets = only.length ? PEOPLE.filter((p) => only.includes(p.slug)) : PEOPLE;
if (!targets.length) {
  console.error(`Unknown slug(s): ${only.join(", ")}`);
  process.exit(1);
}

async function generate(person, index) {
  const prompt = `${STYLE} Subject: ${person.who}.`;
  const submit = await fetch(`https://queue.fal.run/${MODEL}`, {
    method: "POST",
    headers: { Authorization: `Key ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      image_size: { width: 896, height: 1152 }, // 4:5, matches the card crop
      num_images: 1,
      seed: 5100 + index + Number(process.env.FAL_SEED_OFFSET || 0), // fixed per person; FAL_SEED_OFFSET re-rolls
      safety_tolerance: "2",
      output_format: "jpeg",
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
