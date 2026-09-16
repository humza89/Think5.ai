# Team headshots

Generated with fal.ai (FLUX Pro 1.1) by `scripts/generate-team-headshots.mjs`,
one fixed studio description for the whole series so every portrait shares the
same backdrop, wardrobe and lighting. Filenames match the `slug` of each person
in `app/about/page.tsx`; the page shows a generated placeholder for any slug
without a file.

Regenerate one person (needs `FAL_KEY` in `.env`):

    FAL_SEED_OFFSET=300 node scripts/generate-team-headshots.mjs elena-varga

Change `FAL_SEED_OFFSET` to re-roll; omit the slug to regenerate all 15.
