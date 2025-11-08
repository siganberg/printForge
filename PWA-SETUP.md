# PWA Setup Guide

PrintForge now supports Progressive Web App (PWA) installation! This allows you to install the app on your iPhone/Android and receive notifications.

## Features

- ✅ Install as native app on iPhone/Android
- ✅ Offline support
- ✅ Push notifications for print completion
- ✅ App-like experience (no browser UI)
- ✅ Splash screen on launch
- ✅ Proper app icon

## Setting Up Icons

### Quick Start (Temporary Testing)

For testing, the app will work even without custom icons. The manifest references icons that should be generated.

### Generating Custom Icons

1. **Install Sharp** (image processing library):
   ```bash
   npm install --save-dev sharp
   ```

2. **Create Source Icon**:
   - Create a 1024x1024 PNG image of your app icon/logo
   - Save it as: `assets/icon-source.png`
   - Make sure it has a transparent or solid background

3. **Generate All Icons**:
   ```bash
   node scripts/generate-icons.js
   ```

This will generate:
- All required app icons (16x16 to 512x512)
- iOS splash screens for various device sizes
- Saved to: `src/renderer/public/icons/`

### Manual Icon Creation

If you prefer to create icons manually, create these sizes in `src/renderer/public/icons/`:

**Required Icons:**
- `icon-16x16.png` - Favicon
- `icon-32x32.png` - Favicon
- `icon-72x72.png` - Small icon
- `icon-96x96.png` - Medium icon
- `icon-128x128.png` - Medium icon
- `icon-144x144.png` - Medium icon
- `icon-152x152.png` - iOS icon
- `icon-167x167.png` - iOS iPad icon
- `icon-180x180.png` - iOS icon
- `icon-192x192.png` - Android icon
- `icon-384x384.png` - Android icon
- `icon-512x512.png` - Large icon

**iOS Splash Screens (optional but recommended):**
- `splash-750x1334.png` - iPhone 8
- `splash-828x1792.png` - iPhone 11
- `splash-1125x2436.png` - iPhone X/XS
- `splash-1242x2688.png` - iPhone 11 Pro Max
- `splash-1536x2048.png` - iPad
- `splash-1668x2388.png` - iPad Pro 11"
- `splash-2048x2732.png` - iPad Pro 12.9"

## Installing on iPhone

### Via Safari

1. **Access the App**:
   - Open https://printforge.marasigan.net in Safari
   - Or use your local network URL

2. **Add to Home Screen**:
   - Tap the Share button (square with arrow)
   - Scroll down and tap "Add to Home Screen"
   - Edit the name if desired (default: "PrintForge")
   - Tap "Add"

3. **Launch the App**:
   - Find the PrintForge icon on your home screen
   - Tap to launch - it will open in fullscreen without Safari UI
   - Looks and feels like a native app!

### Notification Support

**iOS Requirements:**
- iOS 16.4 or later
- Notifications work when app is in background
- Must grant notification permission when prompted

**Android:**
- Full notification support
- Works in background and foreground

## Using Notifications

### Enable Notifications

When you first open the app, you'll be prompted to enable notifications:
1. Tap "Allow" when prompted
2. Notifications are now enabled!

### What Triggers Notifications

Currently, you'll receive notifications for:
- ✅ **Print Complete**: When a print job finishes
  - Shows printer name
  - Vibrates phone
  - Persistent notification (requires interaction to dismiss)

### Testing Notifications

To test notifications without waiting for a print to finish, you can:
1. Open browser DevTools (F12)
2. Run in console:
   ```javascript
   app.$refs.app.showNotification('Test Notification', {
     body: 'This is a test notification',
     requireInteraction: true
   })
   ```

## Updating the PWA

When you make changes and rebuild:
1. The service worker will detect updates
2. App will automatically reload to get new version
3. Users may need to close and reopen app

## Offline Support

The PWA includes basic offline support:
- App shell is cached
- Can view last known state when offline
- Live features (WebSocket) require internet connection

## Troubleshooting

### "Add to Home Screen" not showing (iOS)
- Make sure you're using Safari (not Chrome)
- Try force-refreshing the page (long-press reload)
- Check that manifest.json is accessible

### Notifications not working (iOS)
- Ensure iOS 16.4 or later
- Check Settings > Safari > Notifications
- Try removing and re-adding the app

### Icons not displaying
- Run icon generation script
- Check that icons exist in `src/renderer/public/icons/`
- Rebuild the app: `npm run build:vue`

### Service Worker not registering
- Check browser console for errors
- Ensure HTTPS (required for service workers)
- localhost is exempt from HTTPS requirement

## Development vs Production

**Development (localhost):**
- Service worker works on http://localhost
- Notifications work for testing
- May see console warnings (normal)

**Production (Cloudflare Tunnel):**
- HTTPS required (Cloudflare provides this)
- Full PWA features enabled
- Better performance and caching

## Files Added

- `src/renderer/public/manifest.json` - PWA manifest
- `src/renderer/public/sw.js` - Service worker
- `src/renderer/index.html` - Updated with PWA meta tags
- `src/renderer/src/App.vue` - Service worker registration
- `scripts/generate-icons.js` - Icon generator

## Next Steps

1. Generate your custom icons
2. Test installation on your iPhone
3. Test notification when print completes
4. Enjoy your native app experience! 🎉
