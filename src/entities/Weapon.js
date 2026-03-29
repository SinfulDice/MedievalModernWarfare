import { Sprite, Assets } from 'pixi.js';

export class Weapon {
    constructor(config) {
        this.config = config;
        this.sprite = new Sprite();
        this.sprite.anchor.set(0.2, 0.5);
    }

    async init() {
        this.sprite.texture = await Assets.load(this.config.asset);
        this.sprite.width = this.config.width;
        this.sprite.height = this.config.height;
    }

    update(angle) {
        this.sprite.rotation = angle;
        if (Math.abs(angle) > Math.PI / 2) {
            this.sprite.scale.y = -1;
        } else {
            this.sprite.scale.y = 1;
        }
    }
}