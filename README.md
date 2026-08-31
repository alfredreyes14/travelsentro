This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

### Poster import (Claude vision)

The admin package screen can pre-fill a new package from a marketing poster
image. Requires:

| Variable | Required | Default | Notes |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | yes | — | Without it the button returns "Poster import isn't configured yet." |
| `POSTER_EXTRACTION_MODEL` | no | `claude-opus-5` | Set to `claude-haiku-4-5` for ~5x lower cost per poster, at some accuracy cost on cluttered posters. |

Roughly $0.08 (~₱4.50) per poster on the default model. The button appears
only on a package that has never been saved. Nothing is written to the
database by the import — it fills the form, and the admin saves as usual.

Verify the mapping rules offline (no API calls, no key needed):

    npm run verify:poster-extraction

Check a real poster end to end (one billed API call, needs `ANTHROPIC_API_KEY`
in `.env.local`):

    npm run verify:poster-extraction:live -- ./poster.jpg

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
