import { Container, Sprite, Assets, Graphics, Text, TextStyle } from 'pixi.js';
import { Engine, Events, Composite, Bodies, Body } from 'matter-js';
import { engine, world, addBody } from '../core/Physics.js';
import { Terrain } from '../entities/Terrain.js';
import { Player } from '../entities/Player.js';
import { Bullet } from '../entities/Bullet.js';
import { Camera } from '../core/Camera.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { WEAPONS_DATA } from '../config/weapons.js';
import { createHUD } from '../hud.js';
import { keys } from '../input.js';
import { saveSingleMatchResult } from '../services/matchResultStore.js';
import { audioManager } from '../services/audioManager.js';

export class GameScene {
    constructor(app, manager) {
        this.app = app;
        this.manager = manager;

        this.container = new Container();
        this.worldContainer = new Container();
        this.uiContainer = new Container();

        this.bullets = [];
        this._bulletByBody = new Map();
        this.players = [];
        this.currentPlayerIndex = 0;
        this.turnState = 'WAITING';
        this.turnTimer = 0;
        this.frameCounter = 0;
        this.hud = null;
        this.timerTopY = 170;

        this._drillUsedThisTurn = false;
        this._activeDrops = [];
        this._isResolvingInterTurnEvent = false;
        this._victoryTimeout = null;

        // Événements aléatoires sans remise (bomba 50%, caisse 25%, trésor 25%)
        this._eventPool = [
            { type: 'BOMB',      weight: 2 },
            { type: 'HEAL_BOX',  weight: 1 },
            { type: 'MONEY_BOX', weight: 1 },
        ];

        // Frappe aérienne frigo
        this._fridgeTarget = null;       // {x, y} world coords visés
        this._fridgeCrosshair = null;    // Graphics de la croix de visée
        this._beamPreview = new Graphics();
        this._beamAngles = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI, -(3 * Math.PI) / 4, -Math.PI / 2, -Math.PI / 4];
        this._beamSlotIndex = 0;
        this._beamBuiltThisTurn = false;

        this.turnOverlay = new Graphics();

        this.onMouseUp   = this.shoot.bind(this);
        this.onMouseDown = this.handleMouseDown.bind(this);
        this.onMouseMove = this.trackMouse.bind(this);
        this.onKeyDown   = this.handleKeyPress.bind(this);
        this.onKeyUp     = this.handleKeyUp.bind(this);
        this.onWheel     = this.handleWheel.bind(this);
        this._preventContextMenu = (e) => {
            if (this.turnState === 'ACTING') e.preventDefault();
        };
        this.collisionHandler = this.handleCollisions.bind(this);
        this.update = this.update.bind(this);

        this.timerFrame = new Graphics();
        this.timerText = new Text({ text: '', style: new TextStyle({
            fontFamily: 'Press Start 2P, Arial Black, monospace',
            fontSize: 74,
            fill: '#33ff88',
            stroke: { color: '#04120b', width: 8 },
            dropShadow: {
                color: '#33ff88',
                blur: 12,
                distance: 0,
                alpha: 0.45,
            }
        })});
        this.timerText.anchor.set(0.5);

        this.infoText = new Text({ text: '', style: new TextStyle({
            fontFamily: 'Arial Black', fontSize: 32, fill: '#ffffff',
            align: 'center', stroke: { color: '#000000', width: 4 }
        })});
        this.infoText.anchor.set(0.5);
    }

    async init(options) {
        this.container.addChild(this.worldContainer);
        this.container.addChild(this.uiContainer);

        this.uiContainer.addChild(this.turnOverlay);
        this.uiContainer.addChild(this.infoText);
        this.uiContainer.addChild(this.timerFrame);
        this.uiContainer.addChild(this.timerText);

        const bgTexture = await Assets.load('assets/backgrounds/Background.png');
        const background = new Sprite(bgTexture);
        background.width  = GAME_CONFIG.WORLD_WIDTH;
        background.height = GAME_CONFIG.WORLD_HEIGHT;
        this.worldContainer.addChild(background);

        this.terrain = new Terrain();
        await this.terrain.generate(GAME_CONFIG.WORLD_WIDTH, GAME_CONFIG.WORLD_HEIGHT);
        this.worldContainer.addChild(this.terrain.container);

        this.players = [
            new Player(this.terrain.p1SpawnX, this.terrain.p1SpawnY, options.p1.classId, 1, this.terrain),
            new Player(this.terrain.p2SpawnX, this.terrain.p2SpawnY, options.p2.classId, 2, this.terrain)
        ];
        this.players[0].playerName = options.p1.name;
        this.players[1].playerName = options.p2.name;

        for (let i = 0; i < this.players.length; i++) {
            await this.players[i].init();
            await this.players[i].setSkin(i === 0 ? options.p1.skin : options.p2.skin);
            this.worldContainer.addChild(
                this.players[i].container,
                this.players[i].aimLine,
                this.players[i].powerBar,
                this.players[i].hpBar,
                this.players[i].hpText
            );
        }

        // Crosshair frigo (dans worldContainer pour suivre la caméra)
        this._fridgeCrosshair = new Graphics();
        this.worldContainer.addChild(this._fridgeCrosshair);
        this.worldContainer.addChild(this._beamPreview);

        // Précharge les assets d'événements pour éviter un délai au premier drop.
        await Promise.allSettled([
            Assets.load('assets/items/BombBox.png'),
            Assets.load('assets/items/HealBox.png'),
            Assets.load('assets/items/MoneyBox.png'),
        ]);

        this.camera = new Camera(this.app, this.worldContainer);
        this.setupWalls();

        this.hud = createHUD(this.players, this.terrain);

        window.addEventListener('mouseup',   this.onMouseUp);
        window.addEventListener('mousedown', this.onMouseDown);
        window.addEventListener('mousemove', this.onMouseMove);
        window.addEventListener('keydown',   this.onKeyDown);
        window.addEventListener('keyup',     this.onKeyUp);
        window.addEventListener('wheel',     this.onWheel, { passive: false });
        window.addEventListener('contextmenu', this._preventContextMenu);
        Events.on(engine, 'collisionStart', this.collisionHandler);
        this.app.ticker.add(this.update);

        // Initialiser et jouer la musique du jeu
        await audioManager.init();
        audioManager.playMusic('GameMusic', true);

        this.startShopping();
    }

    // ── Convertit les coords écran → monde ──
    screenToWorld(sx, sy) {
        return this.worldContainer.toLocal({ x: sx, y: sy });
    }

    trackMouse(e) {
        if (this.turnState !== 'ACTING') return;
        const p = this.players[this.currentPlayerIndex];
        if (!p || !p.currentWeapon?.config.isFridge) return;

        const world = this.screenToWorld(e.clientX, e.clientY);
        this._fridgeTarget = { x: world.x, y: world.y };
        this._drawFridgeCrosshair(world.x, world.y);
    }

    _drawFridgeCrosshair(wx, wy) {
        const g = this._fridgeCrosshair;
        g.clear();
        const size = 30;
        const col  = 0x00eeff;
        // Cercle
        g.circle(wx, wy, size).stroke({ color: col, width: 3, alpha: 0.9 });
        // Croix
        g.moveTo(wx - size * 1.4, wy).lineTo(wx + size * 1.4, wy).stroke({ color: col, width: 2, alpha: 0.9 });
        g.moveTo(wx, wy - size * 1.4).lineTo(wx, wy + size * 1.4).stroke({ color: col, width: 2, alpha: 0.9 });
    }

    startShopping() {
        const current = this.players[this.currentPlayerIndex];
        if (!current || current.hp <= 0) {
            this.nextTurn();
            return;
        }

        this.turnState = 'SHOPPING';
        this.players.forEach(p => { p.isActive = false; p.movementLocked = false; });

        const player = current;
        // Rend ce joueur "actif" uniquement pour que renderShop l'identifie
        player.isActive = true;
        player.movementLocked = true;

        const pColor = player.id === 1 ? '#f5c16a' : '#6ab0f5';

        // Overlay sombre
        this.turnOverlay.clear()
            .rect(0, 0, this.app.screen.width, this.app.screen.height)
            .fill({ color: 0x000000, alpha: 0.75 });
        this.turnOverlay.visible = true;

        // Fenêtre boutique de pré-tour
        if (this._shopModal) this._shopModal.remove();
        const modal = document.createElement('div');
        modal.id = 'preturn-shop';
        modal.setAttribute('data-hud', '');
        modal.style.cssText = `
            position:fixed; inset:0; z-index:8500;
            display:flex; align-items:center; justify-content:center;
            pointer-events:none;
        `;

        const box = document.createElement('div');
        box.setAttribute('data-hud', '');
        box.style.cssText = `
            background:#0a1420; border:2px solid ${pColor};
            border-radius:10px; padding:20px 24px;
            box-shadow:0 0 32px rgba(0,0,0,.8), 0 0 20px ${pColor}44;
            min-width:400px; max-width:480px; max-height:80vh;
            display:flex; flex-direction:column; gap:14px;
            pointer-events:auto; font-family:'Press Start 2P',monospace;
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = `display:flex; flex-direction:column; gap:6px; border-bottom:1px solid ${pColor}44; padding-bottom:12px;`;
        header.innerHTML = `
            <div style="font-size:.44rem; letter-spacing:.2em; color:${pColor}88">PHASE DE PRÉPARATION</div>
            <div style="font-size:.75rem; letter-spacing:.1em; color:${pColor}">TOUR DE ${(player.playerName || 'JOUEUR').toUpperCase()}</div>
            <div style="font-size:.36rem; color:#aaa; letter-spacing:.08em">Achetez des armes et consommables avant de jouer</div>
        `;
        box.appendChild(header);

        // Contenu boutique
        const shopBody = document.createElement('div');
        shopBody.id = 'preturn-shop-body';
        shopBody.style.cssText = `overflow-y:auto; flex:1;`;
        box.appendChild(shopBody);

        // Bouton valider
        const validateBtn = document.createElement('button');
        validateBtn.textContent = '▶ COMMENCER LE TOUR';
        validateBtn.setAttribute('data-hud', '');
        validateBtn.style.cssText = `
            padding:14px 24px; font-family:'Press Start 2P',monospace;
            font-size:.58rem; letter-spacing:.1em;
            background:${pColor}18; color:${pColor};
            border:2px solid ${pColor}; border-radius:8px;
            border-bottom:3px solid ${pColor};
            box-shadow:0 0 14px ${pColor}33;
            cursor:pointer; text-transform:uppercase;
            transition:background .12s, box-shadow .12s;
        `;
        validateBtn.addEventListener('mouseenter', () => {
            validateBtn.style.background = `${pColor}30`;
            validateBtn.style.boxShadow = `0 0 22px ${pColor}55`;
        });
        validateBtn.addEventListener('mouseleave', () => {
            validateBtn.style.background = `${pColor}18`;
            validateBtn.style.boxShadow = `0 0 14px ${pColor}33`;
        });
        validateBtn.addEventListener('click', () => {
            player.isActive = false;
            this._shopModal.remove();
            this._shopModal = null;
            this.startPreparation(true);
        });
        box.appendChild(validateBtn);

        modal.appendChild(box);
        document.body.appendChild(modal);
        this._shopModal = modal;

        // Rend le contenu de la boutique dans la modale
        this._renderPreTurnShop(player, pColor, shopBody);

        this.camera.follow(player.body);
    }

    _renderPreTurnShop(player, pColor, container) {
        const { WEAPONS_DATA, WEAPON_NAMES, WEAPON_COST, ALL_WEAPON_KEYS } = window._hudWeaponsData || {};
        if (!WEAPONS_DATA) {
            // Fallback : utilise la fonction renderShop du HUD si disponible
            if (this.hud?.renderShop) {
                container.innerHTML = `<div style="color:#aaa;font-size:.38rem;text-align:center;padding:20px">Boutique disponible via le bouton shop.</div>`;
            }
            return;
        }

        const rebuild = () => this._renderPreTurnShop(player, pColor, container);
        const consumableKeys = ['HEAL', 'JUMPPOTION'];
        const addBuyableHoverIndicator = (item, enabled) => {
            if (!enabled) return;
            const baseBorderColor = item.style.borderColor;
            const baseBackground = item.style.background;
            const baseTransform = item.style.transform;
            const baseBoxShadow = item.style.boxShadow;
            item.style.cursor = 'pointer';
            item.addEventListener('mouseenter', () => {
                item.style.borderColor = '#f5c16a99';
                item.style.background = 'rgba(245,193,106,.1)';
                item.style.transform = 'translateY(-2px)';
                item.style.boxShadow = '0 0 0 1px rgba(245,193,106,.35), 0 0 16px rgba(245,193,106,.28)';
            });
            item.addEventListener('mouseleave', () => {
                item.style.borderColor = baseBorderColor;
                item.style.background = baseBackground;
                item.style.transform = baseTransform;
                item.style.boxShadow = baseBoxShadow;
            });
        };

        container.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #ffffff11">
                <span style="font-size:1rem">🪙</span>
                <span style="font-size:.38rem;color:#aaa">Or disponible :</span>
                <span style="font-size:.52rem;color:#f5c16a;margin-left:auto">${player.gold} or</span>
            </div>
            <div style="font-size:.34rem;letter-spacing:.08em;color:${pColor}aa;margin-bottom:8px">ARMES</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px" id="pts-grid-weapons"></div>
            <div style="font-size:.34rem;letter-spacing:.08em;color:${pColor}aa;margin:12px 0 8px">CONSOMMABLES</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px" id="pts-grid-consumables"></div>
        `;

        const weaponGrid = container.querySelector('#pts-grid-weapons');
        const consumableGrid = container.querySelector('#pts-grid-consumables');

        ALL_WEAPON_KEYS.forEach(key => {
            const cfg = WEAPONS_DATA[key];
            const cost = typeof WEAPON_COST === 'object' ? (WEAPON_COST[key] ?? 100) : WEAPON_COST;
            const grid = consumableKeys.includes(key) ? consumableGrid : weaponGrid;
            if (!grid) return;

            if (cfg.isHeal) {
                const canAfford = player.gold >= cost;
                const isFullHp = player.hp >= player.maxHp;

                const item = document.createElement('div');
                item.style.cssText = `
                    display:flex; flex-direction:column; align-items:center; gap:5px;
                    padding:10px 8px; border-radius:7px; border:1px solid;
                    border-color:${isFullHp ? pColor + '66' : canAfford ? '#ffffff22' : '#ffffff11'};
                    background:${isFullHp ? pColor + '12' : 'rgba(5,12,20,.7)'};
                    opacity:${!isFullHp && !canAfford ? '.45' : '1'};
                `;

                item.innerHTML = `
                    <img src="${cfg.shopAsset || cfg.asset}" style="width:36px;height:36px;object-fit:contain;image-rendering:pixelated;${!isFullHp && !canAfford ? ' grayscale(.6) brightness(.5)' : ''}">
                    <div style="font-family:'Press Start 2P',monospace;font-size:.3rem;color:${isFullHp ? pColor : '#c8e8d8'};text-align:center">${WEAPON_NAMES[key]}</div>
                    ${isFullHp
                        ? `<div style="font-size:.28rem;color:${pColor};background:${pColor}18;border:1px solid ${pColor}44;padding:2px 6px;border-radius:3px">✓ PV MAX</div>`
                        : `<div style="font-size:.3rem;color:#f5c16a">🪙 ${cost}</div>
                           <button data-key="${key}" style="padding:5px 10px;font-family:'Press Start 2P',monospace;font-size:.28rem;background:${canAfford ? '#f5c16a18' : '#ffffff08'};color:${canAfford ? '#f5c16a' : '#555'};border:1px solid ${canAfford ? '#f5c16a55' : '#333'};border-radius:4px;cursor:${canAfford ? 'pointer' : 'not-allowed'}" ${!canAfford ? 'disabled' : ''}>ACHETER</button>`
                    }
                `;

                if (!isFullHp && canAfford) {
                    addBuyableHoverIndicator(item, true);
                    item.querySelector('button').addEventListener('click', async e => {
                        e.stopPropagation();
                        const ok = await player.buyWeapon(key);
                        if (ok) rebuild();
                    });
                    item.addEventListener('click', async e => {
                        if (e.target?.closest('button')) return;
                        e.stopPropagation();
                        const ok = await player.buyWeapon(key);
                        if (ok) rebuild();
                    });
                }

                grid.appendChild(item);
                return;
            }

            if (cfg.isJumpPotion) {
                const canAfford = player.gold >= cost;
                const boostActive = !!player.jumpBoostActiveThisTurn;

                const item = document.createElement('div');
                item.style.cssText = `
                    display:flex; flex-direction:column; align-items:center; gap:5px;
                    padding:10px 8px; border-radius:7px; border:1px solid;
                    border-color:${boostActive ? pColor + '66' : canAfford ? '#ffffff22' : '#ffffff11'};
                    background:${boostActive ? pColor + '12' : 'rgba(5,12,20,.7)'};
                    opacity:${!boostActive && !canAfford ? '.45' : '1'};
                `;

                item.innerHTML = `
                    <img src="${cfg.shopAsset || cfg.asset}" style="width:36px;height:36px;object-fit:contain;image-rendering:pixelated;${!boostActive && !canAfford ? ' grayscale(.6) brightness(.5)' : ''}">
                    <div style="font-family:'Press Start 2P',monospace;font-size:.3rem;color:${boostActive ? pColor : '#c8e8d8'};text-align:center">${WEAPON_NAMES[key]}</div>
                    ${boostActive
                        ? `<div style="font-size:.28rem;color:${pColor};background:${pColor}18;border:1px solid ${pColor}44;padding:2px 6px;border-radius:3px">✓ ACTIF (CE TOUR)</div>`
                        : `<div style="font-size:.3rem;color:#f5c16a">🪙 ${cost}</div>
                           <button data-key="${key}" style="padding:5px 10px;font-family:'Press Start 2P',monospace;font-size:.28rem;background:${canAfford ? '#f5c16a18' : '#ffffff08'};color:${canAfford ? '#f5c16a' : '#555'};border:1px solid ${canAfford ? '#f5c16a55' : '#333'};border-radius:4px;cursor:${canAfford ? 'pointer' : 'not-allowed'}" ${!canAfford ? 'disabled' : ''}>ACHETER</button>`
                    }
                `;

                if (!boostActive && canAfford) {
                    addBuyableHoverIndicator(item, true);
                    item.querySelector('button').addEventListener('click', async e => {
                        e.stopPropagation();
                        const ok = await player.buyWeapon(key);
                        if (ok) rebuild();
                    });
                    item.addEventListener('click', async e => {
                        if (e.target?.closest('button')) return;
                        e.stopPropagation();
                        const ok = await player.buyWeapon(key);
                        if (ok) rebuild();
                    });
                }

                grid.appendChild(item);
                return;
            }
            const owned = player.ownedKeys.has(key);
            const canAfford = player.gold >= cost;

            const item = document.createElement('div');
            item.style.cssText = `
                display:flex; flex-direction:column; align-items:center; gap:5px;
                padding:10px 8px; border-radius:7px; border:1px solid;
                border-color:${owned ? pColor + '55' : canAfford ? '#ffffff22' : '#ffffff11'};
                background:${owned ? pColor + '0e' : 'rgba(5,12,20,.7)'};
                opacity:${!owned && !canAfford ? '.45' : '1'};
            `;

            const ammoText = (cfg.isGrenade || cfg.isFridge) ? ` (x${player.ammo[key] ?? 0})` : '';
            item.innerHTML = `
                <img src="${cfg.shopAsset || cfg.asset}" style="width:36px;height:36px;object-fit:contain;image-rendering:pixelated;${!owned && !canAfford ? ' grayscale(.6) brightness(.5)' : ''}">
                <div style="font-family:'Press Start 2P',monospace;font-size:.3rem;color:${owned ? pColor : '#c8e8d8'};text-align:center">${WEAPON_NAMES[key]}${ammoText}</div>
                ${owned
                    ? `<div style="font-size:.28rem;color:${pColor};background:${pColor}18;border:1px solid ${pColor}44;padding:2px 6px;border-radius:3px">✓ OK</div>`
                    : `<div style="font-size:.3rem;color:#f5c16a">🪙 ${cost}</div>
                       <button data-key="${key}" style="padding:5px 10px;font-family:'Press Start 2P',monospace;font-size:.28rem;background:${canAfford ? '#f5c16a18' : '#ffffff08'};color:${canAfford ? '#f5c16a' : '#555'};border:1px solid ${canAfford ? '#f5c16a55' : '#333'};border-radius:4px;cursor:${canAfford ? 'pointer' : 'not-allowed'}" ${!canAfford ? 'disabled' : ''}>ACHETER</button>`
                }
            `;

            if (!owned && canAfford) {
                addBuyableHoverIndicator(item, true);
                item.querySelector('button').addEventListener('click', async e => {
                    e.stopPropagation();
                    await player.buyWeapon(key);
                    rebuild();
                });
                item.addEventListener('click', async e => {
                    if (e.target?.closest('button')) return;
                    e.stopPropagation();
                    const ok = await player.buyWeapon(key);
                    if (ok) rebuild();
                });
            }

            grid.appendChild(item);
        });
    }

    startPreparation(skipDelay = false) {
        this.turnState = 'PREPARING';
        this.turnTimer = 5;
        this._drillUsedThisTurn = false;
        this._eventFiredThisTurn = false;
        this._beamBuiltThisTurn = false;
        this._fridgeTarget = null;
        this._fridgeCrosshair?.clear();

        this.players.forEach(p => { p.isActive = false; p.movementLocked = true; });

        const player = this.players[this.currentPlayerIndex];
        const col = player.id === 1 ? '#f5c16a' : '#6ab0f5';
        this.infoText.text  = `AU TOUR DE ${player.playerName.toUpperCase()}\nAppuyez sur une touche`;
        this.infoText.style.fill = col;
        this.infoText.x = this.app.screen.width  / 2;
        this.infoText.y = this.app.screen.height / 2 - 100;
        this.infoText.visible = true;

        this.timerText.style.fontSize = 86;
        this.timerText.x = this.app.screen.width  / 2;
        this.timerText.y = this.timerTopY;
        this.timerText.visible = true;

        this.turnOverlay.clear()
            .rect(0, 0, this.app.screen.width, this.app.screen.height)
            .fill({ color: 0x000000, alpha: 0.7 });
        this.turnOverlay.visible = true;

        this.camera.follow(player.body);

        if (skipDelay) {
            this.startTurn();
        }
    }

    startTurn() {
        if (this.turnState !== 'PREPARING') return;
        this.turnState = 'ACTING';
        this.turnTimer = 20;
        this.players[this.currentPlayerIndex].isActive = true;
        this.players[this.currentPlayerIndex].movementLocked = false;
        this.turnOverlay.visible = false;
        this.infoText.visible    = false;
        this.timerText.style.fontSize = 80;
        this.timerText.y = this.timerTopY;
    }

    _layoutTimerFrame() {
        const padX = 26;
        const padY = 16;
        const w = Math.max(150, this.timerText.width + padX * 2);
        const h = this.timerText.height + padY * 2;
        const x = this.timerText.x - w / 2;
        const y = this.timerText.y - h / 2;

        this.timerFrame.clear();
        this.timerFrame
            .roundRect(x, y, w, h, 10)
            .fill({ color: 0x060f12, alpha: 0.86 })
            .stroke({ color: 0x33ff88, width: 2, alpha: 0.62 });

        const c = 8;
        const o = 5;
        this.timerFrame
            .moveTo(x + o, y + c).lineTo(x + o, y + o).lineTo(x + c, y + o)
            .stroke({ color: 0x33ff88, width: 2, alpha: 0.75 })
            .moveTo(x + w - c, y + o).lineTo(x + w - o, y + o).lineTo(x + w - o, y + c)
            .stroke({ color: 0x33ff88, width: 2, alpha: 0.75 })
            .moveTo(x + o, y + h - c).lineTo(x + o, y + h - o).lineTo(x + c, y + h - o)
            .stroke({ color: 0x33ff88, width: 2, alpha: 0.75 })
            .moveTo(x + w - c, y + h - o).lineTo(x + w - o, y + h - o).lineTo(x + w - o, y + h - c)
            .stroke({ color: 0x33ff88, width: 2, alpha: 0.75 });

        this.timerFrame.visible = this.timerText.visible;
    }

    handleKeyPress(e) {
        if (this.turnState === 'PREPARING') {
            this.startTurn();
            return; // on ne traite rien d'autre cette frame
        }

        if (this.turnState !== 'ACTING') return;

        if (e.code === 'KeyR') {
            if (e.repeat) return;
            const p = this.players[this.currentPlayerIndex];
            if (p && p.isActive && !p.isCharging) {
                p.isCharging = true;
                p.charge = 0;
            }
            return;
        }

        if (e.code === 'KeyF') {
            if (!e.repeat) this.buildBeam();
            return;
        }

        if (e.code === 'KeyE') {
            if (e.repeat) return;
            this.drill();
            this._blinkDigButton();
            return;
        }

        if (e.code === 'KeyA') {
            if (e.repeat) return;
            this._toggleShopFromKey();
            return;
        }
    }

    handleKeyUp(e) {
        if (this.turnState !== 'ACTING') return;
        if (e.code !== 'KeyR') return;

        const p = this.players[this.currentPlayerIndex];
        if (!p || !p.isActive || !p.isCharging) return;

        this.shoot({ button: 0, target: document.body });
    }

    _toggleShopFromKey() {
        const shopBtn = document.getElementById('hud-shop-btn');
        if (shopBtn) shopBtn.click();
    }

    _blinkDigButton() {
        const digBtn = document.getElementById('hud-dig-btn');
        if (!digBtn) return;
        digBtn.classList.remove('digging');
        void digBtn.offsetWidth;
        digBtn.classList.add('digging');
        setTimeout(() => digBtn.classList.remove('digging'), 600);
    }

    handleMouseDown(e) {
        if (this.turnState !== 'ACTING') return;
        if (e?.target?.closest?.('[data-hud]')) return;
        if (e.button !== 2) return;

        e.preventDefault();
        this.drill();
        this._blinkDigButton();
    }

    handleWheel(e) {
        if (this.turnState !== 'ACTING') return;
        if (e.target?.closest?.('[data-hud]')) return;

        e.preventDefault();
        const dir = e.deltaY > 0 ? 1 : -1;
        const len = this._beamAngles.length;
        this._beamSlotIndex = (this._beamSlotIndex + dir + len) % len;
    }

    _getBeamPlacement(player) {
        const angle = this._beamAngles[this._beamSlotIndex] ?? 0;
        const mouse = player?.mousePos || { x: this.app.screen.width / 2, y: this.app.screen.height / 2 };
        const world = this.screenToWorld(mouse.x, mouse.y);
        return {
            angle,
            x: world.x,
            y: world.y,
        };
    }

    _beamOverlapsAnyPlayer(blocks) {
        const T = this.terrain.tileSize;
        for (const pl of this.players) {
            if (!pl || pl.hp <= 0) continue;
            const px = pl.body.position.x;
            const py = pl.body.position.y;
            const halfW = 13;
            const halfH = 29;

            for (const b of blocks) {
                const minX = b.x - T / 2;
                const maxX = b.x + T / 2;
                const minY = b.y - T / 2;
                const maxY = b.y + T / 2;

                const overlaps =
                    px + halfW > minX &&
                    px - halfW < maxX &&
                    py + halfH > minY &&
                    py - halfH < maxY;

                if (overlaps) return true;
            }
        }
        return false;
    }

    buildBeam() {
        const p = this.players[this.currentPlayerIndex];
        if (!p || this.turnState !== 'ACTING') return;

        if (this._beamBuiltThisTurn) {
            this.infoText.text = '❌ 1 plateforme max par tour';
            this.infoText.visible = true;
            setTimeout(() => { this.infoText.visible = false; }, 900);
            return;
        }

        const place = this._getBeamPlacement(p);
        const blocks = this.terrain.getBeamBlockPositions(place.x, place.y, place.angle);
        if (this._beamOverlapsAnyPlayer(blocks)) {
            this.infoText.text = '❌ Impossible: collision joueur';
            this.infoText.visible = true;
            setTimeout(() => { this.infoText.visible = false; }, 900);
            return;
        }

        const placed = this.terrain.addBeam(place.x, place.y, place.angle);

        if (placed <= 0) {
            this.infoText.text = '❌ Placement impossible';
            this.infoText.visible = true;
            setTimeout(() => { this.infoText.visible = false; }, 900);
            return;
        }

        this._beamBuiltThisTurn = true;

        this.infoText.text = `🪵 Poutre placee (${placed} blocs)`;
        this.infoText.visible = true;
        setTimeout(() => { this.infoText.visible = false; }, 900);
    }

    _updateBeamPreview() {
        this._beamPreview.clear();
        if (this.turnState !== 'ACTING') return;

        const p = this.players[this.currentPlayerIndex];
        if (!p || p.hp <= 0) return;

        const place = this._getBeamPlacement(p);
        const blocks = this.terrain.getBeamBlockPositions(place.x, place.y, place.angle);
        const T = this.terrain.tileSize;
        const overlapsPlayer = this._beamOverlapsAnyPlayer(blocks);

        for (const b of blocks) {
            const occupied = this.terrain.isSolid(b.x, b.y);
            const invalid = occupied || overlapsPlayer;
            this._beamPreview
                .rect(b.x - T / 2, b.y - T / 2, T, T)
                .stroke({ color: invalid ? 0xff5544 : 0x66ff99, width: 2, alpha: 0.9 });
        }
    }

    drill() {
        const p = this.players[this.currentPlayerIndex];
        if (!p || this.turnState !== 'ACTING') return;

        const T  = this.terrain.tileSize;
        const px = p.body.position.x;
        const py = p.body.position.y;
        const angle = p.angle; // angle vers la souris

        // Détermine la direction dominante selon l'angle de la souris
        // Au-delà de 60° vers le haut/bas → creuse vertical, sinon horizontal
        const absAngle = Math.abs(angle);
        const sinA = Math.abs(Math.sin(angle));
        const cosA = Math.abs(Math.cos(angle));

        if (sinA > 0.7) {
            // Creuse vers le haut ou vers le bas
            const dir = Math.sin(angle) > 0 ? 1 : -1; // 1 = bas, -1 = haut
            let destroyed = 0;
            for (let row = 1; row <= 3; row++) {
                for (let col = -1; col <= 1; col++) {
                    if (this.terrain.removeBlockAt(px + col * T, py + dir * row * T)) destroyed++;
                }
            }
            if (destroyed > 0) {
                Body.setVelocity(p.body, { x: p.body.velocity.x, y: dir * 7 });
            }
        } else {
            // Creuse horizontalement
            const dir = Math.cos(angle) >= 0 ? 1 : -1;
            let destroyed = 0;
            for (let col = 1; col <= 3; col++) {
                for (let row = -2; row <= 1; row++) {
                    if (this.terrain.removeBlockAt(px + dir * T * col, py + row * T)) destroyed++;
                }
            }
            if (destroyed > 0) {
                Body.setVelocity(p.body, { x: dir * 6, y: Math.min(p.body.velocity.y, 2) });
            }
        }

    }

    shoot(e) {
        // Bloquer si clic sur HUD
        if (e?.target?.closest?.('[data-hud]')) return;
        if (e?.button !== 0) return;

        const p = this.players[this.currentPlayerIndex];
        if (!p || this.turnState !== 'ACTING') return;

        const cfg = p.currentWeapon.config;

        // ── FRIGIDAIRE : frappe aérienne ──
        if (cfg.isFridge) {
            if (!p.isCharging) return;
            if (!p.consumeAmmo('FRIDGE')) {
                this.infoText.text = '❌ Plus de frigogidaires !';
                this.infoText.visible = true;
                setTimeout(() => { this.infoText.visible = false; }, 1200);
                p.resetCharge();
                return;
            }
            p.matchStats.bulletsFired += 1;
            this._launchFridge();
            p.resetCharge();
            this.turnState = 'TRANSITION';
            this.timerText.visible = false;
            this.infoText.visible  = false;
            this._fridgeCrosshair?.clear();
            return;
        }
        // ── ÉPÉE : frappe mêlée ──
        if (cfg.isMelee) {
            this._swordSlash(p, cfg);
            p.resetCharge();
            this.turnState = 'TRANSITION';
            this.timerText.visible = false;
            this.infoText.visible  = false;
            return;
        }
        if (cfg.isGrenade) {
            if (!p.isCharging) return;
            // Détermine le type d'ammo à consommer (GRENADE ou FRAGMENTATION)
            const ammoType = cfg.type === 'FRAGMENTATION' ? 'FRAGMENTATION' : 'GRENADE';
            if (!p.consumeAmmo(ammoType)) {
                this.infoText.text = `❌ Plus de ${cfg.type === 'FRAGMENTATION' ? 'grenades de fragmentation' : 'grenades'} !`;
                this.infoText.visible = true;
                setTimeout(() => { this.infoText.visible = false; }, 1200);
                p.resetCharge();
                return;
            }
            p.matchStats.bulletsFired += 1;
            const ox = p.body.position.x + Math.cos(p.angle) * 45;
            const oy = p.body.position.y + Math.sin(p.angle) * 45;
            this._launchGrenade(ox, oy, p.angle, p.charge, cfg);
            p.resetCharge();
            this.turnState = 'TRANSITION';
            this.timerText.visible = false;
            this.infoText.visible  = false;
            return;
        }
        if (cfg.isHeal) {
            const ammoLeft = p.ammo['HEAL'] ?? 0;
            if (ammoLeft <= 0) {
                this.infoText.text = '❌ Plus de potions !';
                this.infoText.visible = true;
                setTimeout(() => { this.infoText.visible = false; }, 1200);
                return;
            }

            const healAmount = cfg.healFlat ?? (p.maxHp * (cfg.healPercent ?? 0));
            p.hp = Math.min(p.maxHp, p.hp + healAmount);

            p.ammo['HEAL'] -= 1;
            if (p.ammo['HEAL'] <= 0) {
                p.ammo['HEAL'] = 0;
                // Garde le slot visible (grisé) — ne supprime pas l'arme
                p.currentIndex = 0;
                p._refreshWeaponSprite();
            }

            this.turnState = 'TRANSITION';
            this.timerText.visible = false;
            this.infoText.visible = false;
            this.nextTurn();
            return;
        }

        if (cfg.isJumpPotion) {
            const ammoLeft = p.ammo['JUMPPOTION'] ?? 0;
            if (ammoLeft <= 0) {
                this.infoText.text = '❌ Plus de potions de saut !';
                this.infoText.visible = true;
                setTimeout(() => { this.infoText.visible = false; }, 1200);
                return;
            }

            p.bonusJumps = (p.bonusJumps ?? 0) + (cfg.extraJumps ?? 3);
            p.jumpLocked = false;

            p.ammo['JUMPPOTION'] -= 1;
            if (p.ammo['JUMPPOTION'] <= 0) {
                p.ammo['JUMPPOTION'] = 0;
                p.currentIndex = 0;
                p._refreshWeaponSprite();
            }

            this.infoText.text = `🦘 +${cfg.extraJumps ?? 3} sauts bonus !`;
            this.infoText.visible = true;
            setTimeout(() => { this.infoText.visible = false; }, 1200);

            this.turnState = 'TRANSITION';
            this.timerText.visible = false;
            this.nextTurn();
            return;
        }

        const ox = p.body.position.x + Math.cos(p.angle) * 45;
        const oy = p.body.position.y + Math.sin(p.angle) * 45;

        if (cfg.spreadCount) {
            // SHOTGUN - petite détonation
            audioManager.playLittleGunFiring();
            const half = Math.floor(cfg.spreadCount / 2);
            p.matchStats.bulletsFired += cfg.spreadCount;
            for (let i = -half; i <= half; i++) {
                const a = p.angle + i * cfg.spreadAngle;
                const b = new Bullet(ox, oy, a, p.charge, cfg.type, p.id, p.maxCharge);
                this.bullets.push(b);
                this._bulletByBody.set(b.body, b);
                this.worldContainer.addChild(b.view);
            }
        } else if (cfg.burstCount) {
            // MACHINEGUN - rafale de petites détonations
            audioManager.playLittleGunFiring();
            const capturedAngle = p.angle;
            const capturedCharge = p.charge;
            for (let i = 0; i < cfg.burstCount; i++) {
                setTimeout(() => {
                    p.matchStats.bulletsFired += 1;
                    const b = new Bullet(ox, oy, capturedAngle, capturedCharge, cfg.type, p.id, p.maxCharge);
                    this.bullets.push(b);
                    this._bulletByBody.set(b.body, b);
                    this.worldContainer.addChild(b.view);
                }, i * cfg.burstDelay);
            }
        } else {
            // GUN ou SNIPER
            if (cfg.type === 'GUN') {
                audioManager.playGunFiring();
            }
            p.matchStats.bulletsFired += 1;
            const b = new Bullet(ox, oy, p.angle, p.charge, cfg.type, p.id, p.maxCharge);
            this.bullets.push(b);
            this._bulletByBody.set(b.body, b);
            this.worldContainer.addChild(b.view);
        }

        // Jouer le son du sniper si c'est une arme d'attaque
        if (cfg.type === 'SNIPER') {
            audioManager.playSniper();
        }

        p.resetCharge();
        this.turnState = 'TRANSITION';
        this.timerText.visible = false;
        this.infoText.visible  = false;
    }

    _launchGrenade(ox, oy, angle, charge, cfg) {
        Assets.load('assets/items/Grenade.png').then(tex => {
            const sprite = new Sprite(tex);
            sprite.anchor.set(0.5);
            sprite.width  = 24;
            sprite.height = 24;
            sprite.x = ox;
            sprite.y = oy;
            this.worldContainer.addChild(sprite);

            const speed     = charge * cfg.powerMult;
            let vx = Math.cos(angle) * speed;
            let vy = Math.sin(angle) * speed;
            const GRAVITY    = 0.35;
            const BOUNCE     = 0.42;   // coefficient de rebond
            const FRICTION   = 0.88;   // friction horizontale au sol
            const RADIUS     = 8;      // rayon de collision de la grenade
            const T          = this.terrain.tileSize; // 16px

            let x = ox, y = oy;
            let exploded = false;
            let elapsed  = 0;

            // Timer visuel
            const timerStyle = new TextStyle({
                fontFamily: 'Arial Black', fontSize: 18,
                fill: '#ffffff', stroke: { color: '#000000', width: 4 }
            });
            const timerLabel = new Text({ text: '3', style: timerStyle });
            timerLabel.anchor.set(0.5);
            this.worldContainer.addChild(timerLabel);

            const cameraTarget = { x, y };
            this.camera.follow(cameraTarget);

            // Résout la position hors d'un solide en cherchant la surface la plus proche
            const pushOut = (nx, ny) => {
                // Cherche la première position libre en remontant
                for (let step = 1; step <= T * 2; step++) {
                    if (!this.terrain.isSolid(nx, ny - step)) return { x: nx, y: ny - step };
                    if (!this.terrain.isSolid(nx, ny + step)) return { x: nx, y: ny + step };
                    if (!this.terrain.isSolid(nx - step, ny)) return { x: nx - step, y: ny };
                    if (!this.terrain.isSolid(nx + step, ny)) return { x: nx + step, y: ny };
                }
                return { x: nx, y: ny };
            };

            const tick = (ticker) => {
                if (exploded) return;
                const dt = Math.min(ticker.deltaMS, 32);
                elapsed += dt;

                const secLeft = Math.ceil((cfg.fuseTime - elapsed) / 1000);
                timerLabel.text = Math.max(secLeft, 0).toString();

                // Sub-stepping pour éviter le tunneling dans les tuiles 16px
                const SUB = 3;
                const step = dt / SUB;
                for (let s = 0; s < SUB; s++) {
                    vy += GRAVITY * (step / 16);

                    const nx = x + vx * (step / 16);
                    const ny = y + vy * (step / 16);

                    const solidBottom = this.terrain.isSolid(nx, ny + RADIUS);
                    const solidTop    = this.terrain.isSolid(nx, ny - RADIUS);
                    const solidLeft   = this.terrain.isSolid(nx - RADIUS, ny);
                    const solidRight  = this.terrain.isSolid(nx + RADIUS, ny);

                    let bx = nx, by = ny;

                    if (solidBottom) {
                        vy = -Math.abs(vy) * BOUNCE;
                        vx *= FRICTION;
                        // Snap au-dessus de la tuile
                        by = Math.floor((ny + RADIUS) / T) * T - RADIUS - 1;
                        if (Math.abs(vy) < 0.8) vy = 0;
                    } else if (solidTop) {
                        vy =  Math.abs(vy) * BOUNCE;
                        by = Math.ceil((ny - RADIUS) / T) * T + RADIUS + 1;
                    }

                    if (solidLeft) {
                        vx =  Math.abs(vx) * BOUNCE;
                        bx = Math.ceil((nx - RADIUS) / T) * T + RADIUS + 1;
                    } else if (solidRight) {
                        vx = -Math.abs(vx) * BOUNCE;
                        bx = Math.floor((nx + RADIUS) / T) * T - RADIUS - 1;
                    }

                    // Si on est quand même dans un solide après correction, sortir proprement
                    if (this.terrain.isSolid(bx, by)) {
                        const safe = pushOut(bx, by);
                        bx = safe.x; by = safe.y;
                        vy *= -BOUNCE; vx *= BOUNCE;
                    }

                    x = bx; y = by;

                    // Bords du monde
                    if (x < 0)                    { x = 0;                    vx =  Math.abs(vx) * BOUNCE; }
                    if (x > GAME_CONFIG.WORLD_WIDTH)  { x = GAME_CONFIG.WORLD_WIDTH;  vx = -Math.abs(vx) * BOUNCE; }
                }

                sprite.x = x;
                sprite.y = y;
                sprite.rotation += 0.08 * Math.sign(vx || 1);

                timerLabel.x = x;
                timerLabel.y = y - 28;

                cameraTarget.x = x;
                cameraTarget.y = y;

                if (elapsed >= cfg.fuseTime || y > GAME_CONFIG.WORLD_HEIGHT) {
                    exploded = true;
                    this.app.ticker.remove(tick);
                    this.worldContainer.removeChild(sprite);
                    this.worldContainer.removeChild(timerLabel);
                    this._grenadeExplosion(x, y, cfg);

                    setTimeout(() => {
                        const cp = this.players[this.currentPlayerIndex];
                        if (cp) { this.camera.follow(cp.body); this.camera.manualMode = false; }
                        this.nextTurn();
                    }, 800);
                }
            };

            this.app.ticker.add(tick);
        });
    }

    _grenadeExplosion(wx, wy, cfg) {
        // Jouer l'effet sonore d'explosion
        audioManager.playExplosion();

        // Cas spécial : grenade de fragmentation
        if (cfg.isFragmentation) {
            const fragmentCount = cfg.fragmentCount ?? 6;
            const fragmentRadius = cfg.radius * 0.6;
            
            // Créer des grenades fragment autour du point central
            for (let i = 0; i < fragmentCount; i++) {
                const angle = (Math.PI * 2 / fragmentCount) * i;
                const fx = wx + Math.cos(angle) * (fragmentRadius * 0.7);
                const fy = wy + Math.sin(angle) * (fragmentRadius * 0.7);
                
                // Explosion immédiate pour chaque fragment avec dégâts réduits
                const fragmentCfg = {
                    radius: cfg.radius * 0.5, // rayon plus petit pour les fragments
                    maxDamage: cfg.maxDamage,
                    minDamage: cfg.minDamage
                };
                
                setTimeout(() => {
                    this._fragmentExplosion(fx, fy, fragmentCfg);
                }, i * 80); // délai décalé pour chaque fragment
            }
            return;
        }

        const radius = cfg.radius;
        const radiusSq = radius * radius;
        const maxDamage = cfg.maxDamage ?? 45;
        const minDamage = cfg.minDamage ?? 15;
        this.terrain.explode(wx, wy, radius);

        this.players.forEach(p => {
            const dx = p.body.position.x - wx;
            const dy = p.body.position.y - wy;
            const distSq = dx * dx + dy * dy;
            if (distSq < radiusSq) {
                const dist = Math.sqrt(distSq);
                const dmg = this._scaledRadialDamage(dist, radius, minDamage, maxDamage);
                p.takeDamage(dmg);
                const ang   = Math.atan2(dy, dx);
                const force = (1 - dist / radius) * 14;
                Body.setVelocity(p.body, {
                    x: p.body.velocity.x + Math.cos(ang) * force,
                    y: p.body.velocity.y + Math.sin(ang) * force - 4
                });
            }
        });

        // Flash explosion (même style que bazooka)
        const flash = new Graphics();
        flash.circle(wx, wy, radius * 0.6).fill({ color: 0xff8800, alpha: 0.75 });
        this.worldContainer.addChild(flash);
        let alpha = 0.75;
        const fade = () => {
            alpha -= 0.07;
            flash.alpha = alpha;
            if (alpha <= 0) { this.app.ticker.remove(fade); this.worldContainer.removeChild(flash); }
        };
        this.app.ticker.add(fade);
    }

    // ── Explosion d'un fragment de grenade de fragmentation ──
    _fragmentExplosion(wx, wy, cfg) {
        audioManager.playExplosion();

        const radius = cfg.radius;
        const radiusSq = radius * radius;
        const maxDamage = cfg.maxDamage ?? 45;
        const minDamage = cfg.minDamage ?? 15;
        this.terrain.explode(wx, wy, radius);

        this.players.forEach(p => {
            const dx = p.body.position.x - wx;
            const dy = p.body.position.y - wy;
            const distSq = dx * dx + dy * dy;
            if (distSq < radiusSq) {
                const dist = Math.sqrt(distSq);
                const dmg = this._scaledRadialDamage(dist, radius, minDamage, maxDamage);
                p.takeDamage(dmg);
                const ang   = Math.atan2(dy, dx);
                const force = (1 - dist / radius) * 10; // force légèrement moins forte
                Body.setVelocity(p.body, {
                    x: p.body.velocity.x + Math.cos(ang) * force,
                    y: p.body.velocity.y + Math.sin(ang) * force - 2
                });
            }
        });

        // Flash d'explosion plus petit
        const flash = new Graphics();
        flash.circle(wx, wy, radius * 0.5).fill({ color: 0xff8800, alpha: 0.6 });
        this.worldContainer.addChild(flash);
        let alpha = 0.6;
        const fade = () => {
            alpha -= 0.08;
            flash.alpha = alpha;
            if (alpha <= 0) { this.app.ticker.remove(fade); this.worldContainer.removeChild(flash); }
        };
        this.app.ticker.add(fade);
    }


    // ── Fait tomber le frigo du ciel sur la position visée ──
    _launchFridge() {
        const target = this._fridgeTarget;
        const tx = target ? target.x : GAME_CONFIG.WORLD_WIDTH / 2;

        const startY = -200;

        // Objet réactif pour la caméra
        const fridgeCameraTarget = { x: tx, y: startY };
        this.camera.follow(fridgeCameraTarget);
        this.camera.manualMode = false;

        Assets.load('assets/items/Frigogidaire.png').then(tex => {
            const fridgeSprite = new Sprite(tex);
            fridgeSprite.anchor.set(0.5);
            fridgeSprite.width  = 64;
            fridgeSprite.height = 64;
            fridgeSprite.x = tx;
            fridgeSprite.y = startY;
            this.worldContainer.addChild(fridgeSprite);

            const fallSpeed = 28;
            let currentY = startY;
            let exploded  = false;

            const fallTicker = (ticker) => {
                if (exploded) return;
                currentY += fallSpeed * (ticker.deltaMS / 16);
                fridgeSprite.y = currentY;
                fridgeSprite.rotation += 0.04;

                // ✅ Met à jour la cible caméra en temps réel
                fridgeCameraTarget.y = currentY;

                const hitGround = this.terrain.isSolid(tx, currentY + 32);
                const outOfBounds = currentY > GAME_CONFIG.WORLD_HEIGHT;

                if (hitGround || outOfBounds) {
                    exploded = true;
                    this.app.ticker.remove(fallTicker);
                    this.worldContainer.removeChild(fridgeSprite);
                    this._fridgeExplosion(tx, currentY);

                    setTimeout(() => {
                        // Remettre la caméra sur le joueur courant
                        const cp = this.players[this.currentPlayerIndex];
                        if (cp) {
                            this.camera.follow(cp.body);
                            this.camera.manualMode = false;
                        }
                        this.turnState = 'WAITING';
                        this.nextTurn();
                    }, 800);
                }
            };

            this.app.ticker.add(fallTicker);
        });
    }


    _fridgeExplosion(wx, wy) {
        // Jouer l'effet sonore d'explosion
        audioManager.playExplosion();

        const cfg = WEAPONS_DATA.FRIDGE;
        const RADIUS = cfg.radius;
        const radiusSq = RADIUS * RADIUS;
        const maxDamage = cfg.maxDamage ?? 70;
        const minDamage = cfg.minDamage ?? 20;

        // Creuse le terrain
        this.terrain.explode(wx, wy, RADIUS);

        // Dégâts radiaux avec minimum garanti au bord de l'explosion.
        this.players.forEach(p => {
            const dx = p.body.position.x - wx;
            const dy = p.body.position.y - wy;
            const distSq = dx * dx + dy * dy;
            if (distSq < radiusSq) {
                const dist = Math.sqrt(distSq);
                const dmg = this._scaledRadialDamage(dist, RADIUS, minDamage, maxDamage);
                p.takeDamage(dmg);
                // Knockback
                const angle = Math.atan2(dy, dx);
                const force = (1 - dist / RADIUS) * 20;
                Body.setVelocity(p.body, {
                    x: p.body.velocity.x + Math.cos(angle) * force,
                    y: p.body.velocity.y + Math.sin(angle) * force - 5
                });
            }
        });

        // Flash visuel explosion
        const flash = new Graphics();
        flash.circle(wx, wy, RADIUS * 0.6).fill({ color: 0xff8800, alpha: 0.7 });
        this.worldContainer.addChild(flash);

        let alpha = 0.7;
        const fadeOut = () => {
            alpha -= 0.06;
            flash.alpha = alpha;
            if (alpha <= 0) {
                this.app.ticker.remove(fadeOut);
                this.worldContainer.removeChild(flash);
            }
        };
        this.app.ticker.add(fadeOut);
    }

    // ═══════════════════════════════════════════════
    //  ÉPÉE — frappe mêlée
    // ═══════════════════════════════════════════════
    _swordSlash(p, cfg) {
        const px = p.body.position.x;
        const py = p.body.position.y;
        const range   = cfg.meleeRange ?? 90;
        const damage  = cfg.meleeDamage ?? 60;

        // Arc visuel de l'estoc
        const slash = new Graphics();
        const dir   = p.facingDir ?? 1;
        const arcStart = dir > 0 ? -Math.PI * 0.6 : Math.PI * 0.4;
        const arcEnd   = dir > 0 ? Math.PI * 0.2  : Math.PI * 1.6;
        slash.arc(px, py, range * 0.75, arcStart, arcEnd)
             .stroke({ color: 0xffffff, width: 3, alpha: 0.85 });
        this.worldContainer.addChild(slash);

        // Dégâts sur les joueurs dans la portée + du bon côté
        this.players.forEach(target => {
            if (target === p) return;
            const dx = target.body.position.x - px;
            const dy = target.body.position.y - py;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < range && Math.sign(dx) === dir) {
                target.takeDamage(damage);
                // Knockback
                const ang   = Math.atan2(dy, dx);
                const force = 10 * (1 - dist / range);
                Body.setVelocity(target.body, {
                    x: target.body.velocity.x + Math.cos(ang) * force,
                    y: target.body.velocity.y + Math.sin(ang) * force - 3
                });
            }
        });

        // Fade de l'arc
        let alpha = 0.85;
        const fade = () => {
            alpha -= 0.07;
            slash.alpha = alpha;
            if (alpha <= 0) { this.app.ticker.remove(fade); this.worldContainer.removeChild(slash); }
        };
        this.app.ticker.add(fade);

        // Fin du tour après l'animation
        setTimeout(() => this.nextTurn(), 600);
    }

    // ═══════════════════════════════════════════════
    //  ÉVÉNEMENTS ALÉATOIRES SANS REMISE
    //  → appliqués directement sur le joueur actif
    // ═══════════════════════════════════════════════

    _spawnRandomEvent(player, options = {}) {
        const onComplete = typeof options.onComplete === 'function' ? options.onComplete : () => {};

        // Pool épuisée → on recharge
        if (this._eventPool.length === 0) {
            this._eventPool = [
                { type: 'BOMB',      weight: 2 },
                { type: 'HEAL_BOX',  weight: 1 },
                { type: 'MONEY_BOX', weight: 1 },
            ];
        }

        // Tirage pondéré dans la pool restante
        const totalWeight = this._eventPool.reduce((s, e) => s + e.weight, 0);
        let r = Math.random() * totalWeight;
        let picked = null, pickedIndex = -1;
        for (let i = 0; i < this._eventPool.length; i++) {
            r -= this._eventPool[i].weight;
            if (r <= 0) { picked = this._eventPool[i]; pickedIndex = i; break; }
        }
        if (!picked) { picked = this._eventPool[this._eventPool.length - 1]; pickedIndex = this._eventPool.length - 1; }

        // Retrait sans remise
        this._eventPool.splice(pickedIndex, 1);

        // Génère un drop sur la moitié de map du joueur actif.
        if (picked.type === 'BOMB') {
            this._showEventMsg('💣 BOMBE AERIENNE', 'Un colis explosif tombe du ciel !', '#ff4400');
            audioManager.playExplosion();
            this._spawnEventBombDrop(player, onComplete);
        } else if (picked.type === 'HEAL_BOX') {
            this._showEventMsg('❤️ HEALBOX', 'Une caisse de soin est larguee !', '#00ff88');
            audioManager.playExplosion();
            this._spawnConsumableDrop('HEAL_BOX', player, onComplete);
        } else if (picked.type === 'MONEY_BOX') {
            this._showEventMsg('🪙 MONEYBOX', 'Une caisse d\'or est larguee !', '#ffd700');
            audioManager.playExplosion();
            this._spawnConsumableDrop('MONEY_BOX', player, onComplete);
        }
    }

    _getPlayerHalfRange(player) {
        const middle = GAME_CONFIG.WORLD_WIDTH / 2;
        const inLeftHalf = (player?.body?.position?.x ?? middle) < middle;
        const margin = 32;
        if (inLeftHalf) {
            return { minX: margin, maxX: middle - margin };
        }
        return { minX: middle + margin, maxX: GAME_CONFIG.WORLD_WIDTH - margin };
    }

    _randomXInPlayerHalf(player) {
        const { minX, maxX } = this._getPlayerHalfRange(player);
        return minX + Math.random() * Math.max(1, maxX - minX);
    }

    _spawnEventBombDrop(player, onComplete = () => {}) {
        const tx = this._randomXInPlayerHalf(player);
        const startY = 40;
        const fallSpeed = 28;
        const cameraTarget = { x: tx, y: startY };
        this.camera.follow(cameraTarget);
        this.camera.manualMode = false;

        Assets.load('assets/items/BombBox.png').then(tex => {
            const bombSprite = new Sprite(tex);
            bombSprite.anchor.set(0.5);
            bombSprite.width = 64;
            bombSprite.height = 64;
            bombSprite.x = tx;
            bombSprite.y = startY;
            this.worldContainer.addChild(bombSprite);

            let y = startY;
            let exploded = false;

            const tick = (ticker) => {
                if (exploded) return;
                y += fallSpeed * (ticker.deltaMS / 16);
                cameraTarget.y = y;
                bombSprite.y = y;
                bombSprite.rotation += 0.04;

                const hitGround = this.terrain.isSolid(tx, y + 32);
                const outOfBounds = y > GAME_CONFIG.WORLD_HEIGHT;
                if (!hitGround && !outOfBounds) return;

                exploded = true;
                this.app.ticker.remove(tick);
                this.worldContainer.removeChild(bombSprite);

                // Meme puissance que le frigo (charge pleine).
                this._fridgeExplosion(tx, y);
                setTimeout(() => onComplete(), 900);
            };

            this.app.ticker.add(tick);
        }).catch(() => {
            // Fallback visuel absent: explosion quand meme.
            this._fridgeExplosion(tx, 0);
            setTimeout(() => onComplete(), 600);
        });
    }

    _spawnConsumableDrop(type, player, onComplete = () => {}) {
        const tx = this._randomXInPlayerHalf(player);
        const cfg = type === 'HEAL_BOX'
            ? { asset: 'assets/items/HealBox.png' }
            : { asset: 'assets/items/MoneyBox.png' };
        const startY = 28;
        const cameraTarget = { x: tx, y: startY };
        this.camera.follow(cameraTarget);
        this.camera.manualMode = false;

        Assets.load(cfg.asset).then(tex => {
            const sprite = new Sprite(tex);
            sprite.anchor.set(0.5);
            sprite.width = 44;
            sprite.height = 44;
            sprite.x = tx;
            sprite.y = startY;
            this.worldContainer.addChild(sprite);

            this._activeDrops.push({
                type,
                sprite,
                x: tx,
                y: startY,
                vy: 0,
                halfH: 22,
                landed: false,
                ttlMs: 12000,
                bobTime: 0,
                cameraTarget,
                onArrival: onComplete,
            });
        }).catch(() => {
            onComplete();
        });
    }

    _consumeDrop(drop, player) {
        if (drop.type === 'HEAL_BOX') {
            const heal = 40;
            player.maxHp += heal;
            player.hp += heal;
            this._showEventMsg('❤️ SOIN RAMASSE', `+${Math.round(heal)} PV MAX`, '#00ff88');
        } else if (drop.type === 'MONEY_BOX') {
            player.gold = (player.gold || 0) + 100;
            player.matchStats.moneyEarned += 100;
            this._showEventMsg('🪙 OR RAMASSE', '+100 or', '#ffd700');
        }
    }

    _scaledRadialDamage(dist, radius, minDamage, maxDamage) {
        const t = Math.max(0, Math.min(1, dist / Math.max(1, radius)));
        return minDamage + (maxDamage - minDamage) * (1 - t);
    }

    _weaponUsesChargeScaling(weaponType) {
        return weaponType === 'SHOTGUN'
            || weaponType === 'MACHINEGUN'
            || weaponType === 'SNIPER'
            || weaponType === 'GUN';
    }

    _scaledHitDamage(weaponCfg, chargeRatio = 1) {
        const maxDamage = weaponCfg?.maxDamage ?? 0;
        if (this._weaponUsesChargeScaling(weaponCfg?.type)) {
            return maxDamage * Math.max(0, Math.min(1, chargeRatio));
        }
        return maxDamage;
    }

    _removeDropAt(index) {
        const d = this._activeDrops[index];
        if (!d) return;
        if (d.sprite?.parent) d.sprite.parent.removeChild(d.sprite);
        this._activeDrops.splice(index, 1);
    }

    _findDropRestY(x, currentY, halfH) {
        let probeY = Math.max(0, currentY - halfH);
        while (probeY < GAME_CONFIG.WORLD_HEIGHT && !this.terrain.isSolid(x, probeY)) {
            probeY += 4;
        }

        if (probeY >= GAME_CONFIG.WORLD_HEIGHT) return null;

        while (probeY > 0 && this.terrain.isSolid(x, probeY - 1)) {
            probeY -= 1;
        }

        return probeY - halfH - 1;
    }

    _updateDrops(deltaMs) {
        if (!this._activeDrops.length) return;
        const dt = deltaMs / 16;

        for (let i = this._activeDrops.length - 1; i >= 0; i--) {
            const d = this._activeDrops[i];
            if (!d?.sprite) {
                this._removeDropAt(i);
                continue;
            }

            if (!d.landed) {
                d.vy += 0.35 * dt;
                d.y += d.vy * dt;

                if (this.terrain.isSolid(d.x, d.y + d.halfH)) {
                    const restY = this._findDropRestY(d.x, d.y, d.halfH);
                    d.y = restY ?? d.y;
                    d.groundY = d.y;
                    d.vy = 0;
                    d.landed = true;

                    if (typeof d.onArrival === 'function') {
                        const cb = d.onArrival;
                        d.onArrival = null;
                        cb();
                    }
                }

                if (d.y > GAME_CONFIG.WORLD_HEIGHT + 250) {
                    this._removeDropAt(i);
                    continue;
                }
            } else {
                d.ttlMs -= deltaMs;
                d.y = d.groundY ?? d.y;
                if (d.ttlMs <= 0) {
                    this._removeDropAt(i);
                    continue;
                }
            }

            d.sprite.x = d.x;
            d.sprite.y = d.y;
            if (d.cameraTarget) {
                d.cameraTarget.x = d.x;
                d.cameraTarget.y = d.y;
            }

            if (!d.landed) continue;

            for (const p of this.players) {
                if (!p || p.hp <= 0) continue;
                const dx = p.body.position.x - d.x;
                const dy = p.body.position.y - d.y;
                if ((dx * dx + dy * dy) > (52 * 52)) continue;

                this._consumeDrop(d, p);
                this._removeDropAt(i);
                break;
            }
        }
    }

    _showEventMsg(title, subtitle, color) {
        const prev = document.getElementById('event-popup');
        if (prev) prev.remove();

        // Injecter l'animation si besoin
        if (!document.getElementById('event-anim-style')) {
            const s = document.createElement('style');
            s.id = 'event-anim-style';
            s.textContent = `
                @keyframes eventIn  { 0%{opacity:0;transform:translateX(-50%) scale(.7)} 20%{opacity:1;transform:translateX(-50%) scale(1.08)} 35%{transform:translateX(-50%) scale(1)} 100%{transform:translateX(-50%) scale(1);opacity:1} }
                @keyframes eventOut { 0%{opacity:1} 100%{opacity:0;transform:translateX(-50%) translateY(-40px)} }
            `;
            document.head.appendChild(s);
        }

        const el = document.createElement('div');
        el.id = 'event-popup';
        el.setAttribute('data-hud', '');
        el.style.cssText = `
            position:fixed; top:22%; left:50%; transform:translateX(-50%);
            background:rgba(8,14,24,.92); border:2px solid ${color};
            border-radius:12px; padding:18px 32px; text-align:center;
            box-shadow:0 0 30px ${color}66, 0 0 60px ${color}22;
            z-index:9998; pointer-events:none;
            animation: eventIn .4s cubic-bezier(.34,1.56,.64,1) forwards;
        `;
        el.innerHTML = `
            <div style="font-family:'Press Start 2P',monospace;font-size:.9rem;color:${color};
                text-shadow:0 0 14px ${color};letter-spacing:.05em;margin-bottom:8px">
                ÉVÉNEMENT ALÉATOIRE
            </div>
            <div style="font-family:'Press Start 2P',monospace;font-size:1.05rem;color:#fff;
                text-shadow:0 0 10px #fff8;margin-bottom:6px">
                ${title}
            </div>
            <div style="font-family:'Press Start 2P',monospace;font-size:.38rem;color:${color}cc;
                letter-spacing:.06em">
                ${subtitle}
            </div>
        `;
        document.body.appendChild(el);

        // Disparaît après 2.5 s
        setTimeout(() => {
            el.style.animation = 'eventOut .5s ease forwards';
            setTimeout(() => el.remove(), 520);
        }, 2500);
    }

    update(ticker) {
        const delta = Math.min(ticker.deltaMS, 32);

        // ── 1. Input & vélocités (AVANT la physique → zéro lag d'input)
        this.players.forEach(p => {
            p.applyInput();
            if (p.hp > 0 && p.body.position.y > GAME_CONFIG.WORLD_HEIGHT + 100) p.takeDamage(999);
        });

        // ── 2. Physique en 2 sous-étapes (anti-tunneling)
        const SUB_STEPS = 2;
        const subDelta = delta / SUB_STEPS;
        for (let i = 0; i < SUB_STEPS; i++) {
            Engine.update(engine, subDelta);
        }

        // ── 3. Sync visuels APRÈS la physique (position à jour)
        this.players.forEach(p => p.syncVisuals());
        this._updateBeamPreview();

        // ── 3b. Mise a jour des drops (caisses soins/or)
        this._updateDrops(delta);

        // Résolution de morts (chute/bombes event/etc.) même hors phase de tir.
        if (this.turnState !== 'FINISHED') {
            const aliveNow = this.players.filter(p => p.hp > 0);
            if (aliveNow.length <= 1) {
                this.showVictory(aliveNow[0] || this.players[0]);
                return;
            }

            const current = this.players[this.currentPlayerIndex];
            if ((!current || current.hp <= 0) && !this._isResolvingInterTurnEvent && this.bullets.length === 0) {
                this.nextTurn();
                return;
            }
        }

        if (this.camera) this.camera.update();

        if (this.turnState === 'PREPARING' || this.turnState === 'ACTING') {
            this.turnTimer -= ticker.deltaMS / 1000;
            const secLeft = Math.max(0, Math.ceil(this.turnTimer));
            this.timerText.text = secLeft.toString();
            if (this.turnState === 'PREPARING') {
                this.timerText.style.fill = '#44ccff';
            } else if (secLeft <= 3) {
                this.timerText.style.fill = '#f5c16a';
            } else {
                this.timerText.style.fill = '#33ff88';
            }
            this._layoutTimerFrame();
            if (this.turnTimer <= 0) {
                if (this.turnState === 'PREPARING') this.startTurn();
                else this.endTurnImmediately();
            }
        } else {
            this.timerFrame.visible = false;
        }

        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.update();
            this.camera.follow(b.body);
            if (b.isDead || b.body.position.y > GAME_CONFIG.WORLD_HEIGHT + 500) {
                this.worldContainer.removeChild(b.view);
                Composite.remove(world, b.body);
                this._bulletByBody.delete(b.body);
                this.bullets.splice(i, 1);
                if (this.bullets.length === 0) setTimeout(() => this.nextTurn(), 1000);
            }
        }

        this.frameCounter++;
        if (this.frameCounter >= 3) {
            if (this.hud) this.hud.tick();
            this.frameCounter = 0;
        }
    }

    nextTurn() {
        const alive = this.players.filter(p => p.hp > 0);
        if (alive.length <= 1) { this.showVictory(alive[0] || this.players[0]); return; }

        this.turnState = 'WAITING';
        this.players[this.currentPlayerIndex]?.clearJumpBoost?.();
        this.players.forEach(p => { p.isActive = false; p.movementLocked = false; });

        const nextAliveIndex = this._findNextAlivePlayerIndex(this.currentPlayerIndex);
        if (nextAliveIndex === -1) {
            this.showVictory(alive[0] || this.players[0]);
            return;
        }
        this.currentPlayerIndex = nextAliveIndex;

        if (this._isResolvingInterTurnEvent) return;
        this._isResolvingInterTurnEvent = true;
        this.turnState = 'EVENT';

        const nextPlayer = this.players[this.currentPlayerIndex];
        this._spawnRandomEvent(nextPlayer, {
            onComplete: () => {
                this._isResolvingInterTurnEvent = false;

                const aliveAfterEvent = this.players.filter(p => p.hp > 0);
                if (aliveAfterEvent.length <= 1) {
                    this.showVictory(aliveAfterEvent[0] || this.players[0]);
                    return;
                }

                if (this.players[this.currentPlayerIndex]?.hp <= 0) {
                    const idx = this._findNextAlivePlayerIndex(this.currentPlayerIndex);
                    if (idx !== -1) this.currentPlayerIndex = idx;
                }

                if (this.turnState === 'FINISHED') return;
                setTimeout(() => this.startShopping(), 450);
            }
        });
    }

    _findNextAlivePlayerIndex(fromIndex) {
        const n = this.players.length;
        for (let step = 1; step <= n; step++) {
            const idx = (fromIndex + step) % n;
            if (this.players[idx]?.hp > 0) return idx;
        }
        return -1;
    }

    endTurnImmediately() {
        this.turnState = 'TRANSITION';
        this.players[this.currentPlayerIndex].isActive = false;
        this.players[this.currentPlayerIndex].resetCharge();
        this.timerText.visible = false;
        this.infoText.visible  = false;
        this.nextTurn();
    }

    showVictory(winner) {
        this.turnState = 'FINISHED';
        saveSingleMatchResult(this.players, winner.id);
        this.turnOverlay.clear()
            .rect(0, 0, this.app.screen.width, this.app.screen.height)
            .fill({ color: 0x000000, alpha: 0.82 });
        this.turnOverlay.visible = true;
        this.timerText.visible   = false;
        this.infoText.text = `VICTOIRE DE ${winner.playerName.toUpperCase()} !\nFelicitations, champion !`;
        this.infoText.style.fill     = '#e8923a';
        this.infoText.style.fontSize = 48;
        this.infoText.y = this.app.screen.height / 2;
        this.infoText.visible = true;

        if (this._victoryTimeout) clearTimeout(this._victoryTimeout);
        this._victoryTimeout = setTimeout(() => {
            this._victoryTimeout = null;
            this.manager.changeScene('credits', { winnerName: winner.playerName });
        }, 2600);
    }

    handleCollisions(event) {
        event.pairs.forEach(pair => {
            const { bodyA, bodyB } = pair;
            if (bodyA.label === 'DEAD_ZONE' || bodyB.label === 'DEAD_ZONE') {
                const pb = bodyA.label === 'player' ? bodyA : (bodyB.label === 'player' ? bodyB : null);
                if (pb) pb.plugin.playerInstance?.takeDamage(999);
            }
            const bulletBody = bodyA.label === 'bullet' ? bodyA : (bodyB.label === 'bullet' ? bodyB : null);
            if (!bulletBody) return;
            const bulletObj = this._bulletByBody.get(bulletBody);
            if (!bulletObj) return;
            if (bulletObj.isDead) return;
            const otherBody = bodyA === bulletBody ? bodyB : bodyA;
            const cfg = bulletObj.config;
            const chargeRatio = bulletObj.chargeRatio ?? 1;
            const bx = bulletBody.position.x;
            const by = bulletBody.position.y;

            if (otherBody.label === 'ground') {
                this.terrain.explode(bx, by, bulletObj.config.radius || 50);

                if (cfg.type === 'BAZOOKA') {
                    audioManager.playExplosion();
                    const radius = cfg.radius || 50;
                    const radiusSq = radius * radius;
                    const minDamage = cfg.minDamage ?? 10;
                    const maxDamage = cfg.maxDamage ?? 50;
                    this.players.forEach(p => {
                        const dx = p.body.position.x - bx;
                        const dy = p.body.position.y - by;
                        const distSq = dx * dx + dy * dy;
                        if (distSq < radiusSq) {
                            const dist = Math.sqrt(distSq);
                            p.takeDamage(this._scaledRadialDamage(dist, radius, minDamage, maxDamage));
                        }
                    });
                } else {
                    const radius = cfg.radius || 50;
                    const radiusSq = radius * radius;
                    const maxDamage = cfg.maxDamage ?? 0;
                    this.players.forEach(p => {
                        const dx = p.body.position.x - bx;
                        const dy = p.body.position.y - by;
                        const distSq = dx * dx + dy * dy;
                        if (distSq < radiusSq && maxDamage > 0) {
                            const dist = Math.sqrt(distSq);
                            p.takeDamage(this._scaledHitDamage(cfg, chargeRatio) * Math.max(0, 1 - dist / Math.max(1, radius)));
                        }
                    });
                }

                bulletObj.isDead = true;
            } else if (otherBody.label === 'player') {
                const shooter = this.players.find(p => p.id === bulletObj.ownerPlayerId);
                const targetPlayer = otherBody.plugin.playerInstance;

                if (cfg.type === 'BAZOOKA') {
                    audioManager.playExplosion();
                    const radius = cfg.radius || 50;
                    const radiusSq = radius * radius;
                    const minDamage = cfg.minDamage ?? 10;
                    const maxDamage = cfg.maxDamage ?? 50;

                    this.terrain.explode(bx, by, radius);
                    this.players.forEach(p => {
                        const dx = p.body.position.x - bx;
                        const dy = p.body.position.y - by;
                        const distSq = dx * dx + dy * dy;
                        if (distSq < radiusSq) {
                            const dist = Math.sqrt(distSq);
                            p.takeDamage(this._scaledRadialDamage(dist, radius, minDamage, maxDamage));
                        }
                    });
                } else {
                    const dmg = this._scaledHitDamage(cfg, chargeRatio);
                    if (dmg > 0) targetPlayer?.takeDamage(dmg);
                }

                if (shooter) shooter.matchStats.bulletsHit += 1;
                bulletObj.isDead = true;
            }
        });
    }

    setupWalls() {
        const { WORLD_WIDTH, WORLD_HEIGHT, WALL_THICKNESS } = GAME_CONFIG;
        const floor = Bodies.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT + WALL_THICKNESS / 2, WORLD_WIDTH, WALL_THICKNESS, { isStatic: true, label: 'DEAD_ZONE' });
        const top   = Bodies.rectangle(WORLD_WIDTH / 2, -WALL_THICKNESS / 2, WORLD_WIDTH, WALL_THICKNESS, { isStatic: true, label: 'wall' });
        const left  = Bodies.rectangle(-WALL_THICKNESS / 2, WORLD_HEIGHT / 2, WALL_THICKNESS, WORLD_HEIGHT, { isStatic: true, label: 'wall' });
        const right = Bodies.rectangle(WORLD_WIDTH + WALL_THICKNESS / 2, WORLD_HEIGHT / 2, WALL_THICKNESS, WORLD_HEIGHT, { isStatic: true, label: 'wall' });
        [floor, top, left, right].forEach(w => addBody(w));
    }

    destroy() {
        audioManager.stopMusic();
        if (this._victoryTimeout) {
            clearTimeout(this._victoryTimeout);
            this._victoryTimeout = null;
        }
        window.removeEventListener('mouseup',   this.onMouseUp);
        window.removeEventListener('mousedown', this.onMouseDown);
        window.removeEventListener('mousemove', this.onMouseMove);
        window.removeEventListener('keydown',   this.onKeyDown);
        window.removeEventListener('keyup',     this.onKeyUp);
        window.removeEventListener('wheel',     this.onWheel);
        window.removeEventListener('contextmenu', this._preventContextMenu);
        Events.off(engine, 'collisionStart', this.collisionHandler);
        this.app.ticker.remove(this.update);
        if (this._shopModal) { this._shopModal.remove(); this._shopModal = null; }
        this._activeDrops.forEach(d => {
            if (d?.sprite?.parent) d.sprite.parent.removeChild(d.sprite);
        });
        this._activeDrops = [];
        this._bulletByBody.clear();
        ['hud-cmd-btn', 'hud-cmd-popup', 'hud-opt-btn', 'hud-opt-popup',
         'hud-shop-btn', 'hud-shop-popup', 'hud-dig-btn', 'hud-inv', 'hud-mm', 'hud-turn', 'hud-hp-wrap'].forEach(id => {
            const el = document.getElementById(id); if (el) el.remove();
        });
        const pxs = document.getElementById('pxsel-fonts'); if (pxs) pxs.remove();
    }
}
