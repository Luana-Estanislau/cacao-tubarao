import sharp from "sharp";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, "public", "shark-logo.JPG");

const sizes = [
  { size: 192, out: "shark-192.png" },
  { size: 512, out: "shark-512.png" },
];

for (const { size, out } of sizes) {
  const dest = path.join(__dirname, "public", out);
  await sharp(src)
    .resize(size, size, { fit: "cover", position: "centre" })
    .png()
    .toFile(dest);
  console.log(`✓ ${out} (${size}x${size}px)`);
}
