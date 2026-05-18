import sharp from 'sharp';

await sharp('public/shark.svg')
  .resize(192, 192)
  .png()
  .toFile('public/shark-192.png');

await sharp('public/shark.svg')
  .resize(512, 512)
  .png()
  .toFile('public/shark-512.png');

console.log('Íconos criados: shark-192.png e shark-512.png');