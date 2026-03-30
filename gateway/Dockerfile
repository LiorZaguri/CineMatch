# ==========================================
# STAGE 1: Builder
# ==========================================

# Use the official lightweight Node.js 22 Alpine image as the build environment.
FROM node:22-alpine AS builder

# Set the working directory inside the container.
WORKDIR /app

# Copy package manifests, Prisma schema, and configuration first.
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY .env ./

# Install all dependencies (including devDependencies) exactly as specified in package-lock.json.
RUN npm ci

# Generate the Prisma Client required for database access.
RUN npx prisma generate

# Copy the rest of the application source code into the container.
COPY . .

# Compile the application (e.g., TypeScript to JavaScript) into the /dist directory.
# Then copy the generated Prisma client to the dist folder so it's included in the final artifacts.
RUN npm run build && \
    rm -rf dist/generated/prisma && \
    mkdir -p dist/generated && \
    cp -r src/generated/prisma dist/generated/

# ==========================================
# STAGE 2: Production Runner
# ==========================================

# Use a fresh, lightweight Node.js Alpine image for the final production environment.
FROM node:22-alpine AS runner

# Set the working directory inside the container.
WORKDIR /app

# Set Node environment to production to optimize framework performance and dependencies.
ENV NODE_ENV=production

# Install OpenSSL, which is required by the Prisma query engine on Alpine Linux.
RUN apk add --no-cache openssl

# Copy dependency manifests and Prisma schema from the host.
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# Install only production dependencies, omitting devDependencies to keep the image small.
RUN npm ci --omit=dev

# Copy the generated Prisma runtime artifacts expected by @prisma/client at runtime.
COPY --from=builder --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma

# Copy the compiled build artifacts (including the generated Prisma client) from the builder stage.
# Change ownership to the built-in, non-root 'node' user for security.
COPY --from=builder --chown=node:node /app/dist ./dist

# Switch to the non-root 'node' user to prevent the app from running with root privileges.
USER node

# Expose the port the gateway service listens on.
EXPOSE 3000

# Specify the command to start the application.
CMD ["node", "dist/server.js"]
