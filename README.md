# Worms Multiplayer Game 🎮

A 2D turn-based multiplayer game inspired by *Worms*, built with **PixiJS**, **Matter.js**, and **Vite**.

---

## 🎯 Overview

Battle against other players in destructible environments. Choose your character class, manage your gold, purchase weapons, and eliminate opponents with strategy and precision.

### Key Features

- **Turn-based combat** with real-time physics
- **Dynamic weather events** (bombs, healing crates, treasure chests)
- **Destructible terrain** system
- **Customizable weapons** with multiple damage types
- **Character class system** (Warrior, Wizard, Archer)
- **Audio system** with music and sound effects
- **Multiplayer matchmaking** with Supabase integration
- **Leaderboard** showcasing player statistics

---

## 🎮 Gameplay

### Characters & Classes

| Class | Starting Weapons |
|-------|-----------------|
| 🛡️ **Warrior** | Gun, Machinegun |
| 🧙 **Wizard** | Gun, Bazooka |
| 🏹 **Archer** | Gun, Sniper |

### Weapons Arsenal

| Weapon | Cost | Effect | Type |
|--------|------|--------|------|
| Revolver | Free | Direct damage | Gun |
| AK-47 (Burst) | 75 | 3-round burst | Machinegun |
| Shotgun | 75 | Spread damage | Shotgun |
| Bazooka | 75 | Large explosion | Explosive |
| Sniper | 75 | High precision | Gun |
| Grenade | 50 | Timed explosion | Explosive |
| **Fragmentation Grenade** | 100 | 6-fragment burst (50% damage) | Explosive |
| Frigogidaire | 250 | Massive damage & terrain | Special |
| Healing Potion | 50 | +30 HP or +30% max HP | Consumable |
| Jump Potion | 50 | +3 bonus jumps | Consumable |

### Random Events (50% per turn)

Events drop on the opposing player's half of the map:

- **BOMBA (50%)** - Bomb explosion (Fridge-level damage)
- **Healing Crate (25%)** - +40 HP pickup
- **Treasure Chest (25%)** - +100 gold pickup

---

## 🎮 Controls

### Movement
| Action | Keys |
|--------|------|
| Move Left | `Q` / `A` |
| Move Right | `D` |
| Jump | `Space` / `Z` / `W` |

### Combat
| Action | Input |
|--------|-------|
| Aim | Mouse cursor |
| Charge/Fire | Left click (hold & release) |
| Start Turn | Any key |

### Utility
| Action | Input |
|----------|--------|
| Open/Close Shop | `E` |
| Dig terrain | Right click |
| Build platform | `F` |
| Rotate platform | Mouse wheel |
| Switch weapon | `1-5` |

### Menu
| Action | Input |
|--------|--------|
| Help | Click Help button 🔹 |
| Options | Click Gear button ⚙️ |
| Shop | Click Sword button 🗡️ |

---

## 🛠️ Technical Stack

### Frontend
- **PixiJS 8.16.0** - WebGL rendering
- **Matter.js 0.20.0** - Physics engine
- **pixi-sound 3.0.4** - Audio library
- **Vite 7.3.1** - Build tool & dev server

### Backend
- **Supabase** - Multiplayer data & leaderboard
- **PostgreSQL** - Player stats & match results

### Database Schema

**Players Table**
```
player_id (PK) | pseudo (unique) | created_at
```

**Matches Table**
```
match_id (PK) | status | started_at | finished_at | winner_player_id (FK)
```

**Match Player Stats**
```
match_id (FK) | player_id (FK) | result | money_spent | money_earned | bullets_fired | bullets_hit
```

**Views**
- `v_player_career_stats` - Total wins, losses, accuracy, earnings
- `v_match_summary` - Full match history with outcomes

---

## 📦 Installation

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Setup

```bash
# Clone the repository
git clone <your-repo-url>
cd Projet-Hackathon-multiplayer

# Install dependencies
npm install

# Set up environment variables
# Create a .env file with your Supabase credentials
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

---

## 🎨 Project Structure

```
src/
├── main.js                 # Entry point
├── config/
│   ├── gameConfig.js      # Game settings
│   └── weapons.js         # Weapon definitions
├── core/
│   ├── Camera.js          # Camera system
│   └── Physics.js         # Physics utilities
├── entities/
│   ├── Player.js          # Player class
│   ├── Bullet.js          # Projectile class
│   ├── Terrain.js         # Terrain system
│   └── Weapon.js          # Weapon class
├── scenes/
│   ├── MenuScene.js       # Main menu
│   ├── CharacterSelectionScene.js
│   ├── GameScene.js       # Gameplay
│   ├── LeaderboardScene.js
│   └── SceneManager.js
├── services/
│   ├── audioManager.js    # Audio system
│   └── supabaseClient.js  # Database client
├── hud.js                 # UI elements
├── input.js               # Keyboard input
└── style.css              # Global styles

assets/
├── backgrounds/           # Game backgrounds
├── items/                 # Weapon/item sprites
├── sprites/               # Character skins
└── sounds/                # Audio files

db/
└── schema.sql            # Database schema
```

---

## 🎬 How to Play

1. **Start Game** - Click play on the main menu
2. **Select Character** - Choose your class (Warrior/Wizard/Archer)
3. **Pick Skin** - Select your character appearance
4. **Buy Weapons** - Use your starting gold (150) to purchase weapons
5. **Take Your Turn**:
   - Aim with mouse
   - Charge by holding left click
   - Release to fire
   - Navigate terrain with WASD + Space
6. **Wait for Opponent** - Each 30-60 second turn
7. **Win** - Eliminate all opponents to claim victory
8. **Leaderboard** - View stats and rankings

---

## 🔧 Configuration

Edit `src/config/gameConfig.js` to customize:

- World size
- Physics gravity
- Turn duration
- Starting gold
- Map generation seed

Edit `src/config/weapons.js` to modify:

- Weapon damage
- Fire rate
- Cost
- Special properties (area radius, fuse time, etc.)

---

## 🎵 Audio System

The game features a complete audio system with:

- **Menu Music** - Ambient background
- **Character Selection Music** - Selection phase
- **Game Music** - Main gameplay
- **Explosion Sounds** - 3 variants for variety
- **Weapon Sounds** - Firing SFX for each weapon type

### Volume Control

Two independent sliders in Options:
- **Music Volume** (default: 50%)
- **SFX Volume** (default: 50%)

All settings persist via localStorage.

---

## 🌐 Multiplayer

The game uses **Supabase** for:

- Player registration & authentication
- Match recording & results
- Leaderboard rankings
- Statistics tracking

### Key Stats Tracked

- Total wins/losses
- Money spent/earned
- Bullets fired/hit
- Accuracy percentage

---

## 🐛 Debugging

### Console Logs

Enable debug mode by setting in `gameConfig.js`:
```javascript
DEBUG_MODE = true;
```

### Physics Debug

Matter.js rendering can be toggled with modifier keys during gameplay.

### Network Logs

Check browser console for Supabase API calls and authentication issues.

---

## 📈 Performance

- **Production Build**: ~975 kB (uncompressed), 280 kB (gzipped)
- **Modules**: 846 transforms
- **Rendering**: 60 FPS target with WebGL
- **Physics**: 60 Hz simulation

### Optimization Tips

- Use dynamic imports for code-splitting
- Enable compression on your server
- Lazy-load terrain chunks for massive maps

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 License

This project is part of a hackathon and follows the [MIT License](LICENSE).

---

## 🙌 Credits

- **Game Engine**: PixiJS, Matter.js
- **Framework**: Vite
- **Backend**: Supabase
- **Inspiration**: Worms (Team17)

---

## 📞 Support

For issues, bugs, or feature requests, please open an issue on GitHub or contact the development team.

---

**Enjoy the game! 🚀**
