# ==========================================
# STAGE 1: Builder
# ==========================================

# Use the official lightweight Node.js 22 Alpine image as the build environment
FROM node:22-alpine AS builder

# Set the working directory inside the container
WORKDIR /app

# Copy package manifests first to leverage Docker layer caching
COPY package*.json ./

# Cleanly install all dependencies exactly as specified in package-lock.json
RUN npm ci

# Copy the rest of the application source code into the container
COPY . .

# Build the Angular application with the production flag for strict optimization and minification
RUN npm run build -- --configuration production


# ==========================================
# STAGE 2: Production Runtime (Nginx)
# ==========================================

# Use a lightweight Nginx image for the final production environment
FROM nginx:1.27-alpine AS runtime

# Clear out any default Nginx placeholder files
RUN rm -rf /usr/share/nginx/html/*

# Copy the compiled Angular app from the builder stage into Nginx's serving directory
COPY --from=builder /app/dist/frontend/browser /usr/share/nginx/html

# Copy custom Nginx routing configuration from the host
COPY nginx.conf /etc/nginx/conf.d/default.conf

# ==========================================
# SECURITY: Run Nginx as a non-root user
# ==========================================
# Configure permissions so Nginx can run safely as a non-root user (e.g., in K3s)
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    chown -R nginx:nginx /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

# Switch to the unprivileged 'nginx' user
USER nginx

# Expose port 80 for incoming HTTP traffic
EXPOSE 80

# Start Nginx in the foreground (daemon off) so Docker can properly track the process
CMD ["nginx", "-g", "daemon off;"]