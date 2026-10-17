FROM node:22.22.0-alpine@sha256:e4bf2a82ad0a4037d28035ae71529873c069b13eb0455466ae0bc13363826e34
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY app ./app
COPY components ./components
COPY lib ./lib
COPY public ./public
COPY middleware.ts next.config.js tsconfig.json tailwind.config.js postcss.config.js ./
COPY scripts/isolated-e2e/gateway.mjs ./gateway.mjs
ENV NEXT_TELEMETRY_DISABLED=1
CMD ["node", "gateway.mjs"]
