import { Sprite, Container, Assets } from 'pixi.js';
import { Bodies } from 'matter-js';
import { addBody, removeBody } from '../core/Physics.js';
import { GAME_CONFIG } from '../config/gameConfig.js';

/* ═══════════════════════════════════════════════════════════
   Terrain — 2 grandes collines + vallon + plateformes
═══════════════════════════════════════════════════════════ */
export class Terrain {
    constructor() {
        this.container = new Container();
        this.blocks = [];
        this.tileSize = 16;
        this.grassTexture = null;

        this.p1SpawnX = 300;
        this.p1SpawnY = 100;
        this.p2SpawnX = 4500;
        this.p2SpawnY = 100;
    }

    /* ── surface Y pour un x donné ── */
    _surfaceY(x, worldHeight) {
        const T      = this.tileSize;
        const baseY  = worldHeight - GAME_CONFIG.GROUND_HEIGHT;
        const peakY  = baseY - GAME_CONFIG.HILL_HEIGHT;
        const halfW  = GAME_CONFIG.HILL_LENGTH / 2;
        const slopeW = 500;

        const hillOffset = (centerX) => {
            const dx = Math.abs(x - centerX);
            if (dx >= halfW) return 0;
            const innerHalf = halfW - slopeW;
            if (dx <= innerHalf) return baseY - peakY;
            const t = (halfW - dx) / slopeW;
            const s = t * t * (3 - 2 * t);
            return (baseY - peakY) * s;
        };

        const offset = Math.max(hillOffset(1400), hillOffset(3400));
        return Math.round((baseY - offset) / T) * T;
    }

    async generate(worldWidth, worldHeight) {
        const T = this.tileSize;
        const dirtTexture  = await Assets.load('assets/backgrounds/Dirt.png');
        const grassTexture = await Assets.load('assets/backgrounds/GrassDirt.png');
        this.grassTexture = grassTexture;

        // ── 1. Terrain principal ──
        for (let x = 0; x < worldWidth; x += T) {
            const surfY = this._surfaceY(x, worldHeight);
            for (let y = surfY; y < worldHeight; y += T) {
                const isTop = (y === surfY);
                this._addBlock(x, y, T, isTop ? grassTexture : dirtTexture);
            }
        }

        const baseY = worldHeight - GAME_CONFIG.GROUND_HEIGHT;
        const peakY = baseY - GAME_CONFIG.HILL_HEIGHT;

        // ── 2. Plateformes dans le vallon (centre ~2400) ──
        const valleyPlatforms = [
            { cx: 2000, y: baseY - 280,  w: 128 },
            { cx: 2400, y: baseY - 480,  w: 112 },
            { cx: 2800, y: baseY - 280,  w: 128 },
            { cx: 2200, y: baseY - 680,  w: 96  },
            { cx: 2600, y: baseY - 680,  w: 96  },
            { cx: 2400, y: baseY - 880,  w: 112 },
            { cx: 1800, y: baseY - 180,  w: 96  },
            { cx: 3000, y: baseY - 180,  w: 96  },
        ];

        for (const isle of valleyPlatforms) {
            this._addPlatform(isle.cx, isle.y, isle.w, T, grassTexture, dirtTexture);
        }

        // ── 3. Spawns ──
        this.p1SpawnX = 300;
        this.p1SpawnY = this._surfaceY(300, worldHeight) - 60;
        this.p2SpawnX = 4500;
        this.p2SpawnY = this._surfaceY(4500, worldHeight) - 60;
    }

    _addPlatform(cx, y, w, T, grassTexture, dirtTexture) {
        const startX = cx - w / 2;
        for (let layer = 0; layer < 2; layer++) {
            const py = y + layer * T;
            const tex = layer === 0 ? grassTexture : dirtTexture;
            for (let ix = startX; ix < startX + w; ix += T) {
                this._addBlock(ix, py, T, tex);
            }
        }
    }

    _addBlock(x, y, size, texture) {
        const body = Bodies.rectangle(x, y, size, size, {
            isStatic: true, label: 'ground', friction: 0.5, slop: 0.01
        });
        const view = new Sprite(texture);
        view.anchor.set(0.5);
        view.width = view.height = size;
        view.x = x; view.y = y;
        addBody(body);
        this.container.addChild(view);
        this.blocks.push({ body, view });
    }

    removeBlockAt(wx, wy) {
        const T = this.tileSize;
        const gx = Math.round(wx / T) * T;
        const gy = Math.round(wy / T) * T;
        for (let i = this.blocks.length - 1; i >= 0; i--) {
            const b = this.blocks[i];
            if (Math.abs(b.body.position.x - gx) <= T / 2 + 1 &&
                Math.abs(b.body.position.y - gy) <= T / 2 + 1) {
                removeBody(b.body);
                this.container.removeChild(b.view);
                this.blocks.splice(i, 1);
                return true;
            }
        }
        return false;
    }

    isSolid(wx, wy) {
        const T = this.tileSize;
        return this.blocks.some(b =>
            Math.abs(b.body.position.x - wx) <= T / 2 &&
            Math.abs(b.body.position.y - wy) <= T / 2
        );
    }


    explode(ex, ey, radius) {
        for (let i = this.blocks.length - 1; i >= 0; i--) {
            const b = this.blocks[i];
            const dx = b.body.position.x - ex;
            const dy = b.body.position.y - ey;
            if (Math.sqrt(dx*dx + dy*dy) < radius) {
                removeBody(b.body);
                this.container.removeChild(b.view);
                this.blocks.splice(i, 1);
            }
        }
    }

    getBeamBlockPositions(cx, cy, angleRad) {
        const T = this.tileSize;
        const dirX = Math.cos(angleRad);
        const dirY = Math.sin(angleRad);
        const perpX = -dirY;
        const perpY = dirX;

        const coords = [];
        const seen = new Set();

        for (let along = 0; along < 6; along++) {
            for (let thick = 0; thick < 2; thick++) {
                const oA = (along - 2.5) * T;
                const oT = (thick - 0.5) * T;
                const x = cx + dirX * oA + perpX * oT;
                const y = cy + dirY * oA + perpY * oT;
                const gx = Math.round(x / T) * T;
                const gy = Math.round(y / T) * T;
                const key = `${gx}:${gy}`;
                if (seen.has(key)) continue;
                seen.add(key);
                coords.push({ x: gx, y: gy });
            }
        }

        return coords;
    }

    addBeam(cx, cy, angleRad) {
        const tex = this.grassTexture;
        if (!tex) return 0;

        const coords = this.getBeamBlockPositions(cx, cy, angleRad);
        let placed = 0;

        for (const c of coords) {
            if (this.isSolid(c.x, c.y)) continue;
            this._addBlock(c.x, c.y, this.tileSize, tex);
            placed++;
        }

        return placed;
    }
}
