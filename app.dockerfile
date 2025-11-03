FROM node:20.18.0-slim AS builder

WORKDIR /home/perplexica

# Install build dependencies
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --network-timeout 600000

COPY tsconfig.json next.config.mjs next-env.d.ts postcss.config.js drizzle.config.ts tailwind.config.ts ./
COPY src ./src
COPY public ./public

RUN mkdir -p /home/perplexica/data

# Build the application (don't set NODE_ENV=production yet to keep dev deps)
RUN yarn build

# Build the migrator
RUN yarn add --dev @vercel/ncc
RUN yarn ncc build ./src/lib/db/migrate.ts -o migrator

FROM node:20.18.0-slim

WORKDIR /home/perplexica

COPY --from=builder /home/perplexica/public ./public
COPY --from=builder /home/perplexica/.next/static ./public/_next/static

COPY --from=builder /home/perplexica/.next/standalone ./
COPY --from=builder /home/perplexica/data ./data
COPY drizzle ./drizzle
COPY --from=builder /home/perplexica/migrator/build ./build
COPY --from=builder /home/perplexica/migrator/index.js ./migrate.js

RUN mkdir /home/perplexica/uploads

# Set environment variables for Next.js standalone server
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh
CMD ["./entrypoint.sh"]