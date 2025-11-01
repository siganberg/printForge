# PrintForge

## Project Overview
PrintForge is an Electron application for printer management with a hub-and-spoke architecture. The client (Vue.js UI) handles only the user interface, while the server (Node.js) manages all communication with printers, state management, and preferences.

## Architecture
- **Hub**: Electron main process (Node.js) - manages printer communication, state, and preferences
- **Spoke**: Renderer process (Vue.js) - handles UI and user interactions
- **Communication**: WebSocket server on port 8080 for real-time communication
- **Data Storage**: printers.json file in app user data directory
- Similar architecture to ncSender project

## Technology Stack
- **Desktop Framework**: Electron
- **Backend**: Node.js (main process)
- **Frontend**: Vue.js 3 + Vite
- **Build Tools**: Vite, Electron Builder

## Development Commands
- `npm run dev:hot` - Start development with hot reload for fast development
- `npm run dev` - Start development mode
- `npm run build` - Build production version

## Project Structure (Vertical Architecture)
```
printForge/
├── src/
│   ├── main/                    # Electron main process (hub/server)
│   │   ├── main.js              # Thin entry point
│   │   ├── ApplicationManager.js # Application orchestration
│   │   └── services/            # Business logic services
│   │       ├── PrinterService.js     # Printer management
│   │       ├── SettingsService.js    # Settings management
│   │       └── WebSocketService.js   # WebSocket communication
│   └── renderer/                # Vue.js frontend (client)
│       ├── src/
│       │   ├── App.vue
│       │   ├── main.js
│       │   ├── style.css
│       │   └── components/
│       │       └── PrinterCard.vue
│       ├── index.html
│       └── vite.config.js
├── printers.json               # Default printer data
├── package.json
└── CLAUDE.md
```

## Features Implemented
- [x] Hub-and-spoke architecture with Electron + Node.js + Vue
- [x] Hot reload development setup
- [x] Main app UI with printer cards layout
- [x] Dark/light theme toggle (similar to ncSender)
- [x] Settings gear icon
- [x] Printer card component with full settings
- [x] Vertical architecture with service separation
- [x] WebSocket real-time communication
- [x] File-based data persistence (printers.json, settings.json)

## UI Components
- **Header**: Contains app title, theme toggle, and settings button
- **PrinterCard**: Displays printer information including name, model, status, connection, queue count, and last activity
- **Theme Toggle**: Sun/moon icons for light/dark theme switching
- **Settings Button**: Gear icon for accessing settings

## WebSocket Communication
The app uses WebSocket for real-time communication between hub and spoke:

### Client → Server Messages:
- `get-printers`: Retrieve all printers
- `get-settings`: Get current settings
- `update-settings`: Update application settings
- `add-printer`: Add a new printer
- `update-printer`: Update existing printer
- `delete-printer`: Remove a printer

### Server → Client Messages:
- `printers-data`: Send all printers data
- `settings-data`: Send current settings
- `settings-updated`: Confirm settings update
- `printer-added`: Broadcast new printer to all clients
- `printer-updated`: Broadcast printer updates to all clients
- `printer-deleted`: Broadcast printer deletion to all clients

## Data Persistence
- **printers.json**: Stores all printer configurations in app user data directory
- Automatically saves when printers are added, updated, or deleted
- Loads default printers if file doesn't exist on first run

## Styling
- CSS custom properties for theming
- Responsive grid layout for printer cards
- Hover effects and smooth transitions
- Dark/light theme support with automatic switching