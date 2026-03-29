import { GAME_CONFIG } from '../config/gameConfig.js';
import { keys } from '../input.js';

export class Camera {
    constructor(app, worldContainer) {
        this.app = app;
        this.worldContainer = worldContainer;
        this.target = null;
        this.pos = { x: 0, y: 0 };
        this.manualMode = false;
        this.moveSpeed = 24;
    }

    follow(target) {
        this.target = target;
    }

    update() {
        let isMovingManual = false;

        if (keys['ArrowUp'])    { this.pos.y -= this.moveSpeed; isMovingManual = true; }
        if (keys['ArrowDown'])  { this.pos.y += this.moveSpeed; isMovingManual = true; }
        if (keys['ArrowLeft'])  { this.pos.x -= this.moveSpeed; isMovingManual = true; }
        if (keys['ArrowRight']) { this.pos.x += this.moveSpeed; isMovingManual = true; }

        if (isMovingManual) this.manualMode = true;

        if (!this.manualMode && this.target) {
            // ✅ Supporte les deux formats : Matter body {position:{x,y}} et {x,y} direct
            const tx = this.target.position ? this.target.position.x : this.target.x;
            const ty = this.target.position ? this.target.position.y : this.target.y;
            this.pos.x = tx;
            this.pos.y = ty;
        }


        if (keys['Enter']) this.manualMode = false;

        const halfWidth = window.innerWidth / 2;
        const halfHeight = window.innerHeight / 2;

        this.pos.x = Math.max(halfWidth, Math.min(this.pos.x, GAME_CONFIG.WORLD_WIDTH - halfWidth));
        this.pos.y = Math.max(halfHeight, Math.min(this.pos.y, GAME_CONFIG.WORLD_HEIGHT - halfHeight));

        this.worldContainer.pivot.x = this.pos.x;
        this.worldContainer.pivot.y = this.pos.y;
        this.worldContainer.x = halfWidth;
        this.worldContainer.y = halfHeight;
    }
}