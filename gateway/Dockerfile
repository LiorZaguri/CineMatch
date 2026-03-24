# ==========================================
# STAGE 1: Builder
# ==========================================

# Use the official lightweight Node.js 22 Alpine image as the build environment.
FROM node:22-alpine AS builder

# Set the working directory inside the container.
WORKDIR /app

# Copy package manifests and the Prisma schema first to leverage Docker layer caching.
COPY package*.json ./
COPY prisma ./prisma

# Install all dependencies (including devDependencies) exactly as specified in package-lock.json.
RUN npm ci

# Copy the rest of the application source code into the container.
COPY . .

# Generate the Prisma Client required for database access.
RUN npx prisma generate

# Compile the application (e.g., TypeScript to JavaScript) into the /dist directory.
RUN npm run build

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

# Install only production dependencies, omitting devDependencies to keep the image small.
RUN npm ci --omit=dev

# Generate the Prisma Client again for the production environment.
RUN npx prisma generate

# Copy the compiled build artifacts from the builder stage.
# Change ownership to the built-in, non-root 'node' user for security.
COPY --from=builder --chown=node:node /app/dist ./dist

# Switch to the non-root 'node' user to prevent the app from running with root privileges.
USER node

# Expose the port the gateway service listens on.
EXPOSE 3000

# Specify the command to start the application.
CMD ["node", "dist/main.js"]