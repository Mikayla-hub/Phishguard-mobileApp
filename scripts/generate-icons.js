/**
 * Icon Generator Script for PhishGuard App
 * 
 * This script converts SVG icons to PNG format for Expo.
 * 
 * To use this script:
 * 1. Install sharp: npm install sharp
 * 2. Run: node scripts/generate-icons.js
 * 
 * Alternatively, you can use online tools like:
 * - https://cloudconvert.com/svg-to-png
 * - https://svgtopng.com/
 * 
 * Required output sizes:
 * - icon.png: 1024x1024
 * - adaptive-icon.png: 1024x1024
 * - splash-icon.png: 1024x1024
 * - favicon.png: 64x64
 */

const fs = require('fs');
const path = require('path');

// Check if sharp is available
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.log('Sharp is not installed. Install it with: npm install sharp');
  console.log('');
  console.log('Alternatively, convert the SVG files manually:');
  console.log('');
  console.log('SVG files created in assets folder:');
  console.log('  - icon.svg -> convert to icon.png (1024x1024)');
  console.log('  - adaptive-icon.svg -> convert to adaptive-icon.png (1024x1024)');
  console.log('  - splash-icon.svg -> convert to splash-icon.png (1024x1024)');
  console.log('  - favicon.svg -> convert to favicon.png (64x64)');
  console.log('');
  console.log('Use online converters like:');
  console.log('  - https://cloudconvert.com/svg-to-png');
  console.log('  - https://svgtopng.com/');
  console.log('  - https://convertio.co/svg-png/');
  process.exit(0);
}

const assetsDir = path.join(__dirname, '..', 'assets');

const icons = [
  { name: 'icon', size: 1024 },
  { name: 'adaptive-icon', size: 1024 },
  { name: 'splash-icon', size: 1024 },
  { name: 'favicon', size: 64 }
];

async function convertIcons() {
  console.log('Converting SVG icons to PNG...\n');

  for (const icon of icons) {
    const svgPath = path.join(assetsDir, `${icon.name}.svg`);
    const pngPath = path.join(assetsDir, `${icon.name}.png`);

    if (!fs.existsSync(svgPath)) {
      console.log(`⚠️  ${icon.name}.svg not found, skipping...`);
      continue;
    }

    try {
      await sharp(svgPath)
        .resize(icon.size, icon.size)
        .png()
        .toFile(pngPath);
      
      console.log(`✅ ${icon.name}.png created (${icon.size}x${icon.size})`);
    } catch (error) {
      console.log(`❌ Error converting ${icon.name}: ${error.message}`);
    }
  }

  console.log('\nIcon generation complete!');
  console.log('Your app icons are ready in the assets folder.');
}

convertIcons();
