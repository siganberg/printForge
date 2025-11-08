/**
 * Create Placeholder PWA Icons (SVG-based)
 *
 * This script creates simple placeholder icons for immediate PWA testing.
 * For production, use generate-icons.js with a custom source image.
 *
 * Usage: node scripts/create-placeholder-icons.js
 */

const fs = require('fs');
const path = require('path');

function createSVGIcon(size, text = 'PF') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="${size}" height="${size}" fill="#2563eb"/>

  <!-- Icon background circle -->
  <circle cx="${size/2}" cy="${size/2}" r="${size * 0.4}" fill="#1e40af" opacity="0.3"/>

  <!-- Text -->
  <text
    x="50%"
    y="50%"
    font-family="Arial, sans-serif"
    font-size="${size * 0.4}"
    font-weight="bold"
    fill="white"
    text-anchor="middle"
    dominant-baseline="central">
    ${text}
  </text>
</svg>`;
}

function createSplashSVG(width, height) {
  const iconSize = Math.min(width, height) * 0.25;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="${width}" height="${height}" fill="#1a1a1a"/>

  <!-- Centered icon -->
  <g transform="translate(${(width - iconSize)/2}, ${(height - iconSize)/2})">
    <!-- Icon background circle -->
    <circle cx="${iconSize/2}" cy="${iconSize/2}" r="${iconSize * 0.45}" fill="#2563eb"/>
    <circle cx="${iconSize/2}" cy="${iconSize/2}" r="${iconSize * 0.35}" fill="#1e40af" opacity="0.3"/>

    <!-- Text -->
    <text
      x="${iconSize/2}"
      y="${iconSize/2}"
      font-family="Arial, sans-serif"
      font-size="${iconSize * 0.35}"
      font-weight="bold"
      fill="white"
      text-anchor="middle"
      dominant-baseline="central">
      PF
    </text>
  </g>

  <!-- App name -->
  <text
    x="50%"
    y="${height * 0.75}"
    font-family="Arial, sans-serif"
    font-size="${Math.min(width, height) * 0.05}"
    font-weight="normal"
    fill="#9ca3af"
    text-anchor="middle">
    PrintForge
  </text>
</svg>`;
}

async function createPlaceholderIcons() {
  const outputDir = path.join(__dirname, '../src/renderer/public/icons');

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log('📁 Created icons directory');
  }

  console.log('🎨 Creating placeholder PWA icons...\n');

  // Icon sizes
  const iconSizes = [
    16, 32, 72, 96, 128, 144, 152, 167, 180, 192, 384, 512
  ];

  // Create app icons
  for (const size of iconSizes) {
    const svg = createSVGIcon(size, 'PF');
    const outputPath = path.join(outputDir, `icon-${size}x${size}.svg`);
    fs.writeFileSync(outputPath, svg);
    console.log(`✓ Created icon-${size}x${size}.svg`);
  }

  // Splash screen sizes
  const splashSizes = [
    { width: 750, height: 1334, name: 'splash-750x1334' },
    { width: 828, height: 1792, name: 'splash-828x1792' },
    { width: 1125, height: 2436, name: 'splash-1125x2436' },
    { width: 1242, height: 2688, name: 'splash-1242x2688' },
    { width: 1536, height: 2048, name: 'splash-1536x2048' },
    { width: 1668, height: 2388, name: 'splash-1668x2388' },
    { width: 2048, height: 2732, name: 'splash-2048x2732' }
  ];

  console.log('\n🖼️  Creating splash screens...\n');

  for (const splash of splashSizes) {
    const svg = createSplashSVG(splash.width, splash.height);
    const outputPath = path.join(outputDir, `${splash.name}.svg`);
    fs.writeFileSync(outputPath, svg);
    console.log(`✓ Created ${splash.name}.svg (${splash.width}x${splash.height})`);
  }

  console.log('\n✅ Placeholder icons created successfully!');
  console.log(`\nIcons saved to: ${outputDir}`);
  console.log('\n⚠️  Note: These are placeholder SVG icons for testing.');
  console.log('For production, use PNG icons generated from your custom logo.');
  console.log('See PWA-SETUP.md for instructions.\n');
}

createPlaceholderIcons().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
