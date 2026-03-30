import { app } from './app';
import { env } from './config/env';
import { ensureAvatarBucketExists } from './services/S3Service';

async function startServer() {
  app.listen(env.PORT, () => {
    console.log(`Gateway running on port ${env.PORT}`);
  });

  try {
    await ensureAvatarBucketExists();
    console.log("Avatar storage is ready");
  } catch (error) {
    console.error("Avatar storage initialization failed:", error);
    console.warn("Gateway will continue running, but avatar uploads may be unavailable.");
  }
}

startServer().catch((error) => {
  console.error("Failed to start gateway:", error);
  process.exit(1);
});
