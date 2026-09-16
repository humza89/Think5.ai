# Team headshots

Two-step pipeline, both scripts in `scripts/`:

1. `generate-team-headshots.mjs` — fal.ai (FLUX Pro 1.1), one studio
   description for the whole series (black blazer, warm light-grey seamless
   backdrop, flat corporate lighting), fixed seed per person. Needs `FAL_KEY`
   in `.env`. Writes raw 896×1152 images to `public/team/`.
2. `frame-headshots.swift` — detects each face (macOS Vision) and crops every
   image to the same head-and-shoulders geometry relative to the face, so the
   framing and pose read as one session. Writes 720×900 JPEGs.

Regenerate one person, then re-frame:

    FAL_SEED_OFFSET=800 node scripts/generate-team-headshots.mjs elena-varga
    swift scripts/frame-headshots.swift public/team public/team

Filenames match the `slug` of each person in `app/about/page.tsx`; the page
shows a generated placeholder for any slug without a file.
