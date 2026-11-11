import { defineConfig, devices } from "@playwright/test";
import { writeFakeCameraVideo } from "./tests/e2e/fake-camera";

const PORT = 3100;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: `http://localhost:${PORT}`, locale: "tr-TR" },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          // The browser's camera is a looping video of a QR code, and permission is granted without a prompt.
          args: [
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
            `--use-file-for-fake-video-capture=${writeFakeCameraVideo()}`,
          ],
        },
      },
    },
  ],
  webServer: {
    // Every run starts from an empty database so the setup flow is exercised.
    // Tests run against a production build in its own folder: a second `next dev`
    // in this project fights the developer's own over next-env.d.ts.
    command: `rm -f data/e2e.db data/e2e.db-wal data/e2e.db-shm && npm run build && npm run start -- --port ${PORT}`,
    timeout: 180_000,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    env: { DATABASE_PATH: "./data/e2e.db", NEXT_DIST_DIR: ".next-e2e",
      // Background checks would race the tests; they trigger checks themselves.
      DISABLE_SCHEDULER: "1",
      SECRET_KEY: "e2e-only-secret-key-not-for-real-use-0000",
      // Telegram messages go to the stand-in server started in tests/e2e/05-notifications.spec.ts.
      TELEGRAM_API_URL: "http://127.0.0.1:3199",
    },
  },
});
