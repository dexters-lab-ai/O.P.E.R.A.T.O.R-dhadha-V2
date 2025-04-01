FROM node:20
RUN npm install -g pnpm@10.7.0
WORKDIR /monorepo
# Copy workspace config and lockfile
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml* ./
# Copy all package.json files from workspace directories
COPY packages/@aident/shared/package.json ./packages/@aident/shared/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/prettier-config/package.json ./packages/prettier-config/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY apps/web/package.json ./apps/web/
# Install dependencies at the root (this sets up the workspace)
RUN pnpm install
# Copy the rest of the monorepo
COPY packages ./packages/
COPY apps ./apps/
# Set working directory to the web app
WORKDIR /monorepo/apps/web
# Running with verbose logging
CMD ["pnpm", "run", "next-dev", "--", "--log-level=debug"]