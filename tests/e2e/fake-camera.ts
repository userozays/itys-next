import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";

/** What the fake camera "sees": a QR code with this text. */
export const FAKE_CAMERA_TEXT = "SN-KAMERA-12345";

const WIDTH = 640;
const HEIGHT = 480;

/**
 * Writes a short uncompressed video (Y4M) of a QR code and returns its path.
 * Chromium plays it in a loop as the camera when started with
 * --use-file-for-fake-video-capture, so scanning can be tested for real.
 */
export function writeFakeCameraVideo(): string {
  const { size, data } = QRCode.create(FAKE_CAMERA_TEXT, { errorCorrectionLevel: "M" }).modules;
  const scale = Math.floor(360 / size);
  const left = Math.floor((WIDTH - size * scale) / 2);
  const top = Math.floor((HEIGHT - size * scale) / 2);

  const luma = Buffer.alloc(WIDTH * HEIGHT, 255); // white background
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      if (!data[row * size + column]) continue;
      for (let y = 0; y < scale; y++) luma.fill(0, (top + row * scale + y) * WIDTH + left + column * scale, (top + row * scale + y) * WIDTH + left + (column + 1) * scale);
    }
  }
  const chroma = Buffer.alloc((WIDTH * HEIGHT) / 2, 128); // grey: no colour
  const frame = Buffer.concat([Buffer.from("FRAME\n"), luma, chroma]);

  const file = path.join(__dirname, "..", "..", "test-results", "fake-camera.y4m");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${WIDTH} H${HEIGHT} F10:1 Ip A1:1 C420jpeg\n`), frame, frame, frame]));
  return file;
}
