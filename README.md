# 🏃‍♂️ Relic Rush

> A high-speed, 3D endless runner built with React, Three.js, and a unique Dual-Device Mobile Controller setup!

Relic Rush is an immersive browser-based 3D endless runner inspired by games like Temple Run. What makes Relic Rush special is its **Dual-Device Architecture**: you play the game on your computer monitor while using your **smartphone as a wireless touch gamepad** in real-time!

## 🖥️ Desktop View
*(Insert an image or GIF of the 3D Desktop Game running here)*

## 📱 Mobile View
*(Insert an image or GIF of the Mobile Phone Controller screen here)*

## ✨ Features

- **Dual-Screen Play**: Scan the QR code on your computer monitor with your phone to instantly transform your phone into a wireless trackpad controller.
- **Real-Time WebSockets**: Instantaneous, zero-lag swipe controls (Left, Right, Jump, Slide) transmitted from mobile to desktop using Socket.IO.
- **Procedural 3D World**: Infinite, dynamically generating ancient temple pathways built entirely in Three.js and WebGL.
- **Dynamic Sound Engine**: Immersive audio including heavy breathing, footsteps, coin collection, and background music that syncs perfectly with your gameplay.
- **Live Score Sync**: Your current score, distance, and collected coins are broadcasted live straight to your phone screen as you run.

## &#x1F6E0; Tech Stack

- **Frontend Configuration**: React.js, Vite
- **UI & Animations**: TailwindCSS, Framer Motion
- **3D Graphics Engine**: Three.js
- **Backend / Signaling Server**: Python, Flask, Flask-SocketIO
- **Network Communication**: Socket.IO (Real-time bi-directional event-based communication)

## 📦 Prerequisites

Before running the game locally, ensure you have the following installed on your machine:
- [Node.js](https://nodejs.org/) (v16 or higher)
- [Python 3](https://www.python.org/) 
- Both your computer and smartphone must be connected to the **same Wi-Fi network**.

## 🚀 Installation & Setup

You will need to run the **Backend Socket Server** and the **Frontend Web Client** simultaneously in two separate terminal windows.

### 1. Start the Backend Server
The Python backend manages the matchmaking sessions and WebSocket connections to link your computer and phone.

```bash
# Install the required Python packages
pip install flask flask-socketio flask-cors

# Start the Flask socket server (ensure you are in the project root or server folder)
python3 server/app.py
```
*(The socket server will run locally on port `5002`)*

### 2. Start the Frontend Application
In a **new terminal window**, start the React Vite frontend:

```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

## 🎮 How to Play

1. Open the local link provided by Vite (usually `http://localhost:5173`) on your computer.
2. Click anywhere on the desktop screen to unlock the browser's audio policies (the sound icon will turn on).
3. **Scan the QR Code** displayed on the computer screen using your smartphone's camera.
4. Enter your player name on your phone and tap **START**.
5. The game will automatically boot up on your computer monitor and music will start playing! 
6. **Controls (Swipe on Phone):**
   - Swipe **Left / Right** to switch lanes.
   - Swipe **Up** to jump over gaps and low blocks.
   - Swipe **Down** to slide under floating ruins.

*(Note: You can also use the Arrow keys or `W, A, S, D` on your computer keyboard for desktop testing!)*

## 🎨 Customization

### Modifying the 3D Character
The game currently uses a default placeholder character composed of dynamically generated 3D primitive shapes in Three.js. If you want to use a custom 3D model (e.g., a downloaded `.gltf` or `.glb` model):
1. Place your model file in the `public/` directory.
2. In `src/game/RelicRushGame.js`, modify the `buildPlayer()` function.
3. Use `GLTFLoader` (from `three/examples/jsm/loaders/GLTFLoader.js`) to load and attach your model to `this.player`.

## 🤝 Contributing

Contributions, issues, and feature requests are always welcome! 

## 📝 License

This project is open-source and available under the MIT License.
