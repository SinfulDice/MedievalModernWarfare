import { Sprite, Assets } from 'pixi.js';
import { Bodies, Body } from 'matter-js';
import { addBody } from '../core/Physics.js';
import { WEAPONS_DATA } from '../config/weapons.js';

export class Bullet {
    constructor(x, y, angle, charge, weaponType, ownerPlayerId = null, maxCharge = 32) {
        this.config = WEAPONS_DATA[weaponType];
        this.isDead = false;
        this.ownerPlayerId = ownerPlayerId;
        this.charge = charge;
        this.chargeRatio = Math.max(0, Math.min(1, charge / Math.max(1, maxCharge)));

        this.view = new Sprite();
        this.view.texture = Assets.get(this.config.bulletAsset);
        this.view.anchor.set(0.5);

        this.view.width = this.config.bulletSize.w;
        this.view.height = this.config.bulletSize.h;

        this.force = charge * this.config.powerMult;
        
        this.body = Bodies.circle(x, y, 5, {
            label: 'bullet',
            friction: 0.05,
            restitution: 0.3
        });

        addBody(this.body);
        
        Body.setVelocity(this.body, {
            x: Math.cos(angle) * this.force,
            y: Math.sin(angle) * this.force
        });
    }

    update() {
        if (!this.body) return;

        const gravityForce = 0.001 * this.body.mass * this.config.gravityMult;
        Body.applyForce(this.body, this.body.position, { x: 0, y: gravityForce });

        this.view.x = this.body.position.x;
        this.view.y = this.body.position.y;
        this.view.rotation = Math.atan2(this.body.velocity.y, this.body.velocity.x);
    }
}