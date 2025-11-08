/**
 * PWA Icon Generator Script
 *
 * This script generates all required PWA icons from a source image.
 *
 * Usage:
 *   1. Install sharp: npm install --save-dev sharp
 *   2. Place your source icon (1024x1024 PNG) in: assets/icon-source.png
 *   3. Run: node scripts/generate-icons.js
 *
 * This will generate all required icons in src/renderer/public/icons/
 */

const fs = require('fs');
const path = require('path');

async function generateIcons() {
  try {
    // Check if sharp is installed
    let sharp;
    try {
      sharp = require('sharp');
    } catch (error) {
      console.error('❌ Sharp is not installed!');
      console.log('\nPlease install sharp by running:');
      console.log('  npm install --save-dev sharp');
      console.log('\nThen run this script again.');
      process.exit(1);
    }

    const sourceIcon = path.join(__dirname, '../assets/icon-source.png');
    const outputDir = path.join(__dirname, '../src/renderer/public/icons');

    // Check if source icon exists
    if (!fs.existsSync(sourceIcon)) {
      console.error('❌ Source icon not found!');
      console.log(`\nPlease create a 1024x1024 PNG icon at:`);
      console.log(`  ${sourceIcon}`);
      console.log('\nThis should be your app icon/logo.');
      process.exit(1);
    }

    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Icon sizes to generate
    const iconSizes = [
      16, 32, 72, 96, 128, 144, 152, 167, 180, 192, 384, 512
    ];

    // Splash screen sizes for iOS
    const splashSizes = [
      { width: 750, height: 1334, name: 'splash-750x1334' },      // iPhone 8
      { width: 828, height: 1792, name: 'splash-828x1792' },      // iPhone 11
      { width: 1125, height: 2436, name: 'splash-1125x2436' },    // iPhone X
      { width: 1242, height: 2688, name: 'splash-1242x2688' },    // iPhone 11 Pro Max
      { width: 1536, height: 2048, name: 'splash-1536x2048' },    // iPad
      { width: 1668, height: 2388, name: 'splash-1668x2388' },    // iPad Pro 11"
      { width: 2048, height: 2732, name: 'splash-2048x2732' }     // iPad Pro 12.9"
    ];

    console.log('🎨 Generating PWA icons...\n');

    // Generate app icons
    for (const size of iconSizes) {
      const outputPath = path.join(outputDir, `icon-${size}x${size}.png`);
      await sharp(sourceIcon)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 26, g: 26, b: 26, alpha: 1 } // Dark background
        })
        .png()
        .toFile(outputPath);
      console.log(`✓ Generated ${size}x${size} icon`);
    }

    // Generate splash screens with centered icon
    console.log('\n🖼️  Generating splash screens...\n');
    for (const splash of splashSizes) {
      const outputPath = path.join(outputDir, `${splash.name}.png`);
      const iconSize = Math.min(splash.width, splash.height) * 0.3; // 30% of smaller dimension

      // Create splash screen with centered icon
      await sharp({
        create: {
          width: splash.width,
          height: splash.height,
          channels: 4,
          background: { r: 26, g: 26, b: 26, alpha: 1 }
        }
      })
      .composite([{
        input: await sharp(sourceIcon)
          .resize(Math.round(iconSize), Math.round(iconSize), {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          })
          .png()
          .toBuffer(),
        gravity: 'center'
      }])
      .png()
      .toFile(outputPath);

      console.log(`✓ Generated ${splash.name}.png (${splash.width}x${splash.height})`);
    }

    console.log('\n✅ All icons generated successfully!');
    console.log(`\nIcons saved to: ${outputDir}`);

  } catch (error) {
    console.error('❌ Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
