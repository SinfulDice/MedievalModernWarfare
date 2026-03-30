import { Sprite, Assets, Graphics, Container, Text, TextStyle } from 'pixi.js';
import { Bodies, Body } from 'matter-js';
import { addBody, isBodyGrounded } from '../core/Physics.js';
import { keys } from '../input.js';
import { Weapon } from './Weapon.js';
import { WEAPONS_DATA, CLASS_WEAPONS, WEAPON_COST } from '../config/weapons.js';

export class Player {
    constructor(x, y, className, id, terrain = null) {
        this.id = id;
        this.className = className;
        this.isActive = false;
        this.container = new Container();
        this.terrain = terrain;   // référence terrain pour vérifier les murs

        this.hp = 100;
        this.maxHp = 100;
        this.lastVelocityY = 0;
        this.facingDir = 1;

        this.gold = 150;
        this.ammo = {
            GRENADE: 1,
            FRIDGE: 0,
        };
        this.ownedKeys = new Set(CLASS_WEAPONS[className] || ['GUN']);

        this.jumpLocked = false;
        this._groundedFrames = 0;
        this.jumpBoostMultiplier = 1;
        this.jumpBoostActiveThisTurn = false;
        this.movementLocked = false;

        this.matchStats = {
            moneySpent: 0,
            moneyEarned: 0,
            bulletsFired: 0,
            bulletsHit: 0,
        };

        this.body = Bodies.rectangle(x, y, 26, 58, {
            chamfer: { radius: 4 },   // coins arrondis → évite de se coincer dans les jointures de tuiles
            inertia: Infinity,
            label: 'player',
            friction: 0.1,
            frictionAir: 0.005,
            restitution: 0,
            plugin: { playerInstance: this }
        });
        addBody(this.body);

        this.weapons = [];
        this.currentIndex = 0;

        this.sprite = new Sprite();
        this.aimLine = new Graphics();
        this.powerBar = new Graphics();
        this.hpBar = new Graphics();
        this.hpText = new Text({
            text: '',
            style: new TextStyle({
                fontFamily: 'Arial Black',
                fontSize: 11,
                fill: '#ffffff',
                stroke: { color: '#000000', width: 3 }
            })
        });
        this.hpText.anchor.set(0.5);
        this.mousePos = { x: 0, y: 0 };
        this.isCharging = false;
        this.charge = 0;
        this.maxCharge = 32;

        this._onMove = (e) => { this.mousePos.x = e.clientX; this.mousePos.y = e.clientY; };
        this._onDown = (e) => {
            if (e.button !== 0) return;
            if (this.isActive && !this.isCharging) {
                this.isCharging = true;
                this.charge = 0;
            }
        };
        window.addEventListener('mousemove', this._onMove);
        window.addEventListener('mousedown', this._onDown);
    }

    async init() {
        this.weapons = [];
        for (const key of this.ownedKeys) {
            const w = new Weapon(WEAPONS_DATA[key]);
            await w.init();
            if (WEAPONS_DATA[key].bulletAsset) {
                await Assets.load(WEAPONS_DATA[key].bulletAsset);
            }
            this.weapons.push(w);
        }

        for (const key of Object.keys(this.ammo)) {
            if (this.ammo[key] > 0 && !this.ownedKeys.has(key)) {
                this.ownedKeys.add(key);
                const w = new Weapon(WEAPONS_DATA[key]);
                await w.init();
                if (WEAPONS_DATA[key].bulletAsset) await Assets.load(WEAPONS_DATA[key].bulletAsset);
                this.weapons.push(w);
            }
        }

        this.currentIndex = 0;
        this.container.addChild(this.sprite);
        this.container.addChild(this.weapons[0].sprite);
    }

    async buyWeapon(key) {
        const cfg = WEAPONS_DATA[key];
        const cost = WEAPON_COST[key] ?? WEAPON_COST;
        if (this.gold < cost) return false;

        if (cfg.isHeal) {
            if (this.hp >= this.maxHp) return false;
            this.gold -= cost;
            this.matchStats.moneySpent += cost;
            const healAmount = cfg.healFlat ?? (this.maxHp * (cfg.healPercent ?? 0.2));
            this.hp = Math.min(this.maxHp, this.hp + healAmount);
            return true;
        }

        if (cfg.isJumpPotion) {
            if (this.jumpBoostActiveThisTurn) return false;
            this.gold -= cost;
            this.matchStats.moneySpent += cost;
            this.activateJumpBoost(3);
            return true;
        }

        if (cfg.isGrenade || cfg.isFridge) {
            this.gold -= cost;
            this.matchStats.moneySpent += cost;
            this.ammo[key] = (this.ammo[key] || 0) + 1;
            if (!this.ownedKeys.has(key)) {
                this.ownedKeys.add(key);
                const w = new Weapon(cfg);
                await w.init();
                if (cfg.bulletAsset) await Assets.load(cfg.bulletAsset);
                this.weapons.push(w);
                this._refreshWeaponSprite();
            }
            return true;
        }

        if (this.ownedKeys.has(key)) return false;
        this.gold -= cost;
        this.matchStats.moneySpent += cost;
        this.ownedKeys.add(key);
        const w = new Weapon(cfg);
        await w.init();
        if (cfg.bulletAsset) await Assets.load(cfg.bulletAsset);
        this.weapons.push(w);
        this._refreshWeaponSprite();
        return true;
    }

    consumeAmmo(key) {
        if (this.ammo[key] === undefined) return true;
        if (this.ammo[key] <= 0) return false;
        this.ammo[key]--;
        if (this.ammo[key] <= 0) {
            const idx = this.weapons.findIndex(w =>
                w.config.type === key
            );
            if (idx !== -1) {
                this.container.removeChild(this.weapons[idx].sprite);
                if (this.currentIndex >= idx) {
                    this.currentIndex = Math.max(0, this.currentIndex - 1);
                }
                this.weapons.splice(idx, 1);
                this.ownedKeys.delete(key);
                this._refreshWeaponSprite();
            }
        }
        return true;
    }

    activateJumpBoost(multiplier = 3) {
        this.jumpBoostMultiplier = Math.max(this.jumpBoostMultiplier || 1, multiplier);
        this.jumpBoostActiveThisTurn = true;
    }

    clearJumpBoost() {
        this.jumpBoostMultiplier = 1;
        this.jumpBoostActiveThisTurn = false;
    }

    _refreshWeaponSprite() {
        for (const w of this.weapons) {
            if (this.container.children.includes(w.sprite)) {
                this.container.removeChild(w.sprite);
            }
        }
        this.container.addChild(this.weapons[this.currentIndex].sprite);
    }

    takeDamage(amount) { this.hp = Math.max(0, this.hp - amount); }

    async setSkin(skinName) {
        try {
            const texture = await Assets.load(`assets/sprites/${skinName}.png`);
            this.sprite.texture = texture;
            this.sprite.anchor.set(0.5);
            this.sprite.width = 64;
            this.sprite.height = 64;
        } catch (e) { console.error('Error loading skin:', skinName, e); }
    }

    resetCharge() { this.isCharging = false; this.charge = 0; this.powerBar.clear(); }

    get currentWeapon() { return this.weapons[this.currentIndex]; }

    get angle() {
        if (!this.container.parent) return 0;
        const worldPos = this.container.parent.toLocal({ x: this.mousePos.x, y: this.mousePos.y });
        return Math.atan2(worldPos.y - this.body.position.y, worldPos.x - this.body.position.x);
    }

    switchWeapon(index) {
        if (index < 0 || index >= this.weapons.length || this.currentIndex === index) return;
        this.container.removeChild(this.currentWeapon.sprite);
        this.currentIndex = index;
        this.container.addChild(this.currentWeapon.sprite);
    }

    // ── Étape 1 : lit les inputs et applique les vélocités (avant Engine.update)
    applyInput(deltaMs = 16.67) {
        if (!this.body) return;

        const currentVY = this.body.velocity.y;
        if (!this.jumpBoostActiveThisTurn && this.lastVelocityY > 12 && currentVY < 0.1) {
            const dmg = Math.floor((this.lastVelocityY - 12) * 4);
            if (dmg > 0) this.takeDamage(dmg);
        }
        this.lastVelocityY = currentVY;

        let targetVx = 0;
        if (this.isActive && !this.movementLocked) {
            if (keys['KeyD']) { targetVx = 4; this.facingDir = 1; }
            if (keys['KeyA']) { targetVx = -4; this.facingDir = -1; }

            const rawGrounded = isBodyGrounded(this.body);
            if (rawGrounded) {
                this._groundedFrames = 4;
                this.jumpLocked = false;
            } else if (this._groundedFrames > 0) {
                this._groundedFrames--;
            }
            const onGround = this._groundedFrames > 0;
            const jumpSpeed = -5 * (this.jumpBoostMultiplier || 1);

            const jumpPressed = keys['Space'];

            if (jumpPressed && onGround && !this.jumpLocked) {
                Body.setVelocity(this.body, { x: this.body.velocity.x, y: jumpSpeed });
                this.jumpLocked = true;
                this._groundedFrames = 0;
            } else if (jumpPressed && !onGround && !this.jumpLocked && (this.bonusJumps ?? 0) > 0) {
                Body.setVelocity(this.body, { x: this.body.velocity.x, y: jumpSpeed });
                this.bonusJumps -= 1;
                this.jumpLocked = true;
            }

            if (!jumpPressed && this.jumpLocked && !onGround) {
                this.jumpLocked = false;
            }

            [1, 2, 3, 4, 5].forEach((n, i) => {
                if (keys[`Digit${n}`] && i < this.weapons.length) this.switchWeapon(i);
            });

            if (this.isCharging) {
                const chargeStep = (this.maxCharge * Math.max(0, deltaMs)) / 1000;
                this.charge = Math.min(this.charge + chargeStep, this.maxCharge);
            }
        } else {
            this.resetCharge();
        }

        Body.setVelocity(this.body, { x: targetVx, y: this.body.velocity.y });

        // Anti-glitch mur
        if (targetVx !== 0 && this.terrain) {
            const px = this.body.position.x;
            const py = this.body.position.y;
            const halfW = 14;
            const halfH = 28;
            const step = targetVx > 0 ? 1 : -1;
            const checkX = px + step * halfW;
            const wallHit = [-halfH + 6, 0, halfH - 6].some(dy =>
                this.terrain.isSolid(checkX, py + dy)
            );
            if (wallHit) {
                Body.setVelocity(this.body, { x: 0, y: this.body.velocity.y });
                const T = this.terrain.tileSize;
                const snappedX = Math.round(px / T) * T;
                Body.setPosition(this.body, {
                    x: snappedX + (step > 0 ? -1 : 1),
                    y: py
                });
            }
        }
    }

    // ── Étape 2 : synchronise les visuels avec la position physique (après Engine.update)
    syncVisuals() {
        if (!this.body) return;

        const rot = this.angle;

        if (!this.currentWeapon.config.isFridge && !this.currentWeapon.config.isGrenade) {
            this.currentWeapon.update(rot);
        }

        this.sprite.scale.x = Math.abs(rot) > Math.PI / 2 ? -1 : 1;

        this.aimLine.clear();
        if (this.isActive && !this.currentWeapon.config.isFridge && !this.currentWeapon.config.isGrenade) {
            this.aimLine.moveTo(this.body.position.x, this.body.position.y)
                .lineTo(this.body.position.x + Math.cos(rot) * 50, this.body.position.y + Math.sin(rot) * 50)
                .stroke({ width: 2, color: 0xffffff, alpha: 0.3 });
        }

        this.powerBar.clear();
        if (this.isCharging && this.isActive && this.charge > 0
            && !this.currentWeapon.config.isFridge
            && !this.currentWeapon.config.isHeal) {
            const bw = (this.charge / this.maxCharge) * 60;
            this.powerBar.rect(this.body.position.x - 30, this.body.position.y - 60, 60, 6).fill(0x333333);
            this.powerBar.rect(this.body.position.x - 30, this.body.position.y - 60, bw, 6).fill(0xff0000);
        }

        this.hpBar.clear();
        if (this.hp > 0) {
            const hw = (this.hp / this.maxHp) * 60;
            this.hpBar.rect(this.body.position.x - 30, this.body.position.y - 72, 60, 8).fill(0x000000);
            this.hpBar.rect(this.body.position.x - 30, this.body.position.y - 72, hw, 8).fill(0x00ff00);
            this.hpText.text = `${Math.max(0, Math.ceil(this.hp))}/${Math.max(1, Math.ceil(this.maxHp))}`;
            this.hpText.x = this.body.position.x;
            this.hpText.y = this.body.position.y - 82;
            this.hpText.visible = true;
        } else {
            this.hpText.visible = false;
        }

        this.container.x = this.body.position.x;
        this.container.y = this.body.position.y;
    }

    // Rétrocompatibilité (appelé nulle part dans le nouveau code mais conservé au cas où)
    update() { this.applyInput(); this.syncVisuals(); }

    destroy() {
        window.removeEventListener('mousemove', this._onMove);
        window.removeEventListener('mousedown', this._onDown);
    }
}
