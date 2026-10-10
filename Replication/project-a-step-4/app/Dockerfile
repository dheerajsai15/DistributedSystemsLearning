FROM oven/bun:1
WORKDIR /app

# Dependencies first, so a code change does not run the install again
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY index.ts tsconfig.json ./

EXPOSE 3000
CMD ["bun", "index.ts"]
