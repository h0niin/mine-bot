# 🤖 Minecraft Bot Controller

A feature-rich Minecraft bot with autonomous farming, branch mining, and a web-based control interface. Built with Node.js and Mineflayer.

![Bot Interface](https://img.shields.io/badge/Minecraft-1.14%2B-green)
![Node.js](https://img.shields.io/badge/Node.js-16%2B-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

## ✨ Features

### 🎮 Bot Capabilities
- **Autonomous Farming**: Automatic crop harvesting and replanting (wheat, carrots, potatoes, beetroots)
- **Branch Mining**: Efficient strip mining with automatic ore detection and collection
- **Player Following**: Follow specific players or the nearest player
- **Inventory Management**: Auto-deposit crops and ores into designated chests
- **Health & Tool Monitoring**: Returns to base when health is low or tools need replacement

### 🖥️ Web Interface
- **Real-time Bot Status**: Live health, hunger, XP, and position tracking
- **Inventory Visualization**: View bot's hotbar and main inventory with item counts
- **Command Control**: Send commands via web UI, chat, terminal, or voice
- **First-Person View**: Live bot POV through Prismarine Viewer integration
- **Minecraft-Styled UI**: Authentic Minecraft interface design

## 📋 Prerequisites

- Node.js 16 or higher
- Minecraft Java Edition (1.14+)
- A Minecraft world with LAN enabled

## 🚀 Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/minecraft-bot-controller.git
cd minecraft-bot-controller
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure the bot** (optional)
Edit `bot.js` to customize:
```javascript
const LAN_PORT = 6767    // Minecraft LAN port
const WEB_PORT = 3000    // Web interface port
const COMMAND_PREFIX = '\\'  // In-game command prefix
```

## 🎯 Usage

### Starting the Bot

1. **Open your Minecraft world to LAN**
   - Press ESC in-game
   - Click "Open to LAN"
   - Note the port number (default: 6767)

2. **Start the bot**
```bash
node bot.js
```

3. **Access the web interface**
   - Open `http://localhost:3000` in your browser
   - Or use your LAN IP: `http://[your-ip]:3000`

4. **View bot POV** (optional)
   - Click "VIEW BOT POV" button in the web interface
   - Or directly access: `http://localhost:3001`

## 📝 Commands

All commands use the `\` prefix by default (configurable).

### Basic Commands
| Command | Description |
|---------|-------------|
| `\stop` | Stop all current tasks |
| `\follow` | Follow the nearest player |
| `\follow <username>` | Follow a specific player |

### Farming Commands
| Command | Description |
|---------|-------------|
| `\setseedchest` | Set chest for seed storage |
| `\setcropchest` | Set chest for crop storage |
| `\farm` | Start autonomous farming |

### Mining Commands
| Command | Description |
|---------|-------------|
| `\setorechest` | Set chest for ore storage |
| `\branchmine` | Start branch mining |

## 🎮 How to Use Farming

1. Build a crop farm (wheat, carrots, potatoes, or beetroots)
2. Place two chests near the farm:
   - One for seeds (input)
   - One for harvested crops (output)
3. Stand near the seed chest and type `\setseedchest`
4. Stand near the crop chest and type `\setcropchest`
5. Fill the seed chest with appropriate seeds
6. Type `\farm` to start farming

The bot will:
- Scan for mature crops within 64 blocks
- Harvest mature crops
- Replant automatically
- Deposit harvested crops when inventory is full
- Restock seeds from the seed chest

## ⛏️ How to Use Branch Mining

1. Take the bot to your desired mining level (Y: 11 recommended for diamonds)
2. Place a chest for ore storage
3. Stand near the chest and type `\setorechest`
4. Type `\branchmine` to start mining

The bot will:
- Mine in a 3x3 pattern
- Create 16-block branches with 3-block spacing
- Automatically detect and announce ores
- Deposit ores when inventory has 64+ items
- Return to base if health is low or pickaxe is breaking

Supported ores:
- Coal, Iron, Gold, Diamond, Emerald, Lapis, Redstone, Copper
- Both normal and deepslate variants

## 🛠️ Project Structure

```
minecraft-bot-controller/
├── bot.js              # Main bot logic and server
├── index.html          # Web interface
├── package.json        # Dependencies
└── README.md          # Documentation
```

## 📦 Dependencies

```json
{
  "mineflayer": "^4.20.1",
  "mineflayer-pathfinder": "^2.4.3",
  "minecraft-data": "^3.67.0",
  "vec3": "^0.1.8",
  "express": "^4.18.2",
  "prismarine-viewer": "^1.23.1"
}
```

## 🔧 Troubleshooting

### Bot won't connect
- Ensure your Minecraft world is open to LAN
- Check that the LAN port matches the `LAN_PORT` in `bot.js`
- Verify no firewall is blocking the connection

### Bot gets stuck
- Use `\stop` command to reset the bot
- The bot will automatically clear pathfinding and reset state

### Web interface not loading
- Check that port 3000 is not in use by another application
- Try accessing via `http://localhost:3000` or your LAN IP

### Farming not working
- Ensure seed and crop chests are set correctly
- Verify the chests are accessible (not blocked)
- Check that crops are within 64 blocks of the bot

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Mineflayer](https://github.com/PrismarineJS/mineflayer) - The bot framework
- [Prismarine Viewer](https://github.com/PrismarineJS/prismarine-viewer) - First-person view
- [Minecraft Data](https://github.com/PrismarineJS/minecraft-data) - Game data

## 📧 Contact

For questions or issues, please open an issue on GitHub.

---

**Note**: This bot is for educational purposes and single-player/LAN use only. Do not use on servers without permission.
