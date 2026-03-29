import { Container } from 'pixi.js';

export class CreditsScene {
    constructor(app, manager) {
        this.app = app;
        this.manager = manager;
        this.container = new Container();
        this.overlay = null;
        this.scrollContent = null;
        this.speedBtn = null;
        this.scrollY = 0;
        this.scrollSpeed = 34;
        this.speedLevels = [1, 2, 4, 8];
        this.speedIndex = 0;
        this.speedTarget = 1;
        this.speedCurrent = 1;
        this._smoothedDeltaSec = 1 / 60;
        this.finished = false;
        this._onKeyDown = null;
        this._onSpeedClick = null;
        this._tick = this._tick.bind(this);
    }

    async init(options = {}) {
        const winnerName = (options.winnerName || 'Champion').toUpperCase();

        this._ensureStyle();

        const prev = document.getElementById('credits-screen');
        if (prev) prev.remove();

        const root = document.createElement('div');
        root.id = 'credits-screen';
        root.innerHTML = `
            <div class="cr-scan"></div>
            <button class="cr-speed-btn" id="credits-speed-btn">x1</button>
            <div class="cr-skip">ESPACE POUR SKIP</div>
            <div class="cr-viewport">
                <div class="cr-content" id="credits-content"></div>
            </div>
        `;

        document.body.appendChild(root);
        this.overlay = root;
        this.scrollContent = document.getElementById('credits-content');
        this.speedBtn = document.getElementById('credits-speed-btn');
        if (!this.scrollContent) return;

        const postCreditsLines = await this._loadPostCreditsLines();
        this.scrollContent.innerHTML = this._buildCreditsMarkup(postCreditsLines, winnerName);
        const introTitle = this.scrollContent.querySelector('.cr-intro-title');
        const introHeight = introTitle?.getBoundingClientRect()?.height || 84;
        // Démarrage: la première ligne est déjà visible au bas de l'écran.
        this.scrollY = this.app.screen.height - introHeight - 10;
        this.scrollContent.style.transform = `translate3d(0, ${this.scrollY.toFixed(2)}px, 0)`;

        if (this.speedBtn) {
            this._onSpeedClick = () => {
                this.speedIndex = (this.speedIndex + 1) % this.speedLevels.length;
                this.speedTarget = this.speedLevels[this.speedIndex];
                this.speedBtn.textContent = `x${this.speedLevels[this.speedIndex]}`;
            };
            this.speedBtn.addEventListener('click', this._onSpeedClick);
        }

        this._onKeyDown = (e) => {
            if (e.code !== 'Space') return;
            e.preventDefault();
            this._finish();
        };
        window.addEventListener('keydown', this._onKeyDown);

        this.app.ticker.add(this._tick);
    }

    _buildCreditsMarkup(postCreditsLines, winnerName) {
        const beeCrawl = postCreditsLines;

        const beeLines = Array.from({ length: 8 })
            .flatMap(() => beeCrawl)
            .map(line => `<div class="cr-line">${line}</div>`)
            .join('');

        return `
            <div class="cr-block cr-intro-block">
                <div class="cr-intro-title">FELICITATIONS ${winnerName} !</div>
                <div class="cr-intro-sub">Victoire eclatante. Le monde est sauve (ou presque).</div>
            </div>

            <div class="cr-block">
                <div class="cr-head">CREDITS</div>
            </div>

            <div class="cr-block">
                <div class="cr-role">Story Writer</div>
                <div class="cr-name">"Vous avez vu une histoire vous ? Parce que pas moi."</div>
            </div>

            <div class="cr-block">
                <div class="cr-role">Designers</div>
                <div class="cr-name">Pierre-Antoine</div>
                <div class="cr-name">Ysmahel</div>
            </div>

            <div class="cr-block">
                <div class="cr-role">Developers</div>
                <div class="cr-name">Pierre-Antoine</div>
                <div class="cr-name">Romain</div>
            </div>

            <div class="cr-block">
                <div class="cr-role">Actors</div>
                <div class="cr-name">Guerrier : Aragorn</div>
                <div class="cr-name">Mage : Gandalf</div>
                <div class="cr-name">Archer : Legolas</div>
                <div class="cr-name">Trump : Himself</div>
                <div class="cr-name">Macron : Himself</div>
                <div class="cr-name">Bambi : Himself</div>
                <div class="cr-name">Maskass : Himself</div>
                <div class="cr-name">Bob l'Eponge : Himself</div>
                <div class="cr-name">Zelda : Link</div>
            </div>

            <div class="cr-block">
                <div class="cr-role">Weapon Furnisher</div>
                <div class="cr-name">Nous ne souhaitons pas communiquer cette information</div>
            </div>

            <div class="cr-divider"></div>

            <div class="cr-block">
                <div class="cr-head">A REAL STORY</div>
                <div class="cr-sub"></div>
                ${beeLines}
            </div>

            <div class="cr-block cr-thanks-block">
                <div class="cr-thanks">Merci d'etre resté jusque la</div>
            </div>
        `;
    }

    async _loadPostCreditsLines() {
        try {
            const res = await fetch('assets/bee_movie_script.txt', { cache: 'no-store' });
            if (res.ok) {
                const txt = await res.text();
                const lines = txt
                    .split(/\r?\n/)
                    .map(l => l.trim())
                    .filter(Boolean);
                if (lines.length > 0) return lines;
            }
        } catch (_e) {
            // fallback below
        }

        return [
            'POST-CREDITS BEE LOG (ORIGINAL TEXT)',
            'No licensed movie transcript is displayed here.',
            'A bee exits the hive and checks the wind.',
            'The city below hums louder than the wings above.',
            'Flower route A is delayed by rain clouds.',
            'Route B is clear, but guarded by one angry pigeon.',
            'The bee files a formal complaint with itself.',
            'Minutes later, pollen is secured.',
            'A tiny hero returns with giant confidence.',
            'Hive Control approves a victory dance.',
            'Three spins. One landing. Zero shame.',
            'A second bee asks for the mission report.',
            'Answer: sticky, dramatic, successful.',
            'Sunset paints every wing gold.',
            'Night shift begins. Neon flowers activate.',
            'One lamp post is mistaken for the moon.',
            'Navigation recalibrated. Pride intact.',
            'A whisper spreads through the comb:',
            '"Tomorrow, we fly further."',
            'END OF BEE LOG'
        ];
    }

    _tick(ticker) {
        if (this.finished || !this.scrollContent) return;
        const rawDeltaSec = Math.min(0.05, Math.max(0, ticker.deltaMS / 1000));
        this._smoothedDeltaSec = this._smoothedDeltaSec * 0.82 + rawDeltaSec * 0.18;

        // Lissage des changements de vitesse pour éviter les à-coups visuels.
        this.speedCurrent += (this.speedTarget - this.speedCurrent) * 0.18;

        this.scrollY -= (this.scrollSpeed * this.speedCurrent) * this._smoothedDeltaSec;
        this.scrollContent.style.transform = `translate3d(0, ${this.scrollY.toFixed(2)}px, 0)`;

        const endY = -(this.scrollContent.scrollHeight + 140);
        if (this.scrollY <= endY) this._finish();
    }

    async _finish() {
        if (this.finished) return;
        this.finished = true;
        const manager = this.manager;
        this.destroy();
        await manager.changeScene('menu');
    }

    _ensureStyle() {
        if (document.getElementById('credits-style')) return;
        const style = document.createElement('style');
        style.id = 'credits-style';
        style.textContent = `
            #credits-screen {
                position: fixed;
                inset: 0;
                z-index: 9500;
                background: radial-gradient(120% 100% at 50% 25%, #172235 0%, #090d12 65%, #030406 100%);
                overflow: hidden;
                color: #d8f3e3;
                font-family: 'Press Start 2P', monospace;
            }
            #credits-screen .cr-scan {
                position: absolute;
                inset: 0;
                pointer-events: none;
                background: repeating-linear-gradient(0deg, rgba(0,0,0,.14) 0px, rgba(0,0,0,.14) 1px, transparent 1px, transparent 3px);
            }
            #credits-screen .cr-skip {
                position: absolute;
                top: 20px;
                right: 24px;
                font-size: .32rem;
                color: #44ccff;
                letter-spacing: .08em;
                opacity: .9;
            }
            #credits-screen .cr-speed-btn {
                position: absolute;
                top: 16px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 2;
                padding: 10px 16px;
                border: 2px solid rgba(51,255,136,.45);
                border-bottom: 3px solid rgba(51,255,136,.6);
                border-radius: 7px;
                background: rgba(6,18,12,.85);
                color: #33ff88;
                font-family: 'Press Start 2P', monospace;
                font-size: .34rem;
                letter-spacing: .08em;
                cursor: pointer;
                text-transform: uppercase;
                box-shadow: 0 0 12px rgba(51,255,136,.18);
            }
            #credits-screen .cr-speed-btn:hover {
                border-color: #33ff88;
                box-shadow: 0 0 18px rgba(51,255,136,.3);
            }
            #credits-screen .cr-viewport {
                position: absolute;
                inset: 0;
                overflow: hidden;
                perspective: 420px;
            }
            #credits-screen .cr-content {
                position: absolute;
                left: 0;
                width: 100%;
                will-change: transform;
                backface-visibility: hidden;
                transform: translateZ(0);
                contain: layout paint style;
            }
            #credits-screen .cr-block {
                text-align: center;
                margin: 34px auto;
                width: min(920px, 92vw);
            }
            #credits-screen .cr-intro-block {
                margin-top: 0;
                margin-bottom: 72px;
            }
            #credits-screen .cr-intro-title {
                color: #f5c16a;
                font-size: 1.26rem;
                letter-spacing: .08em;
                line-height: 1.35;
                text-shadow: 0 0 18px rgba(245,193,106,.45);
            }
            #credits-screen .cr-intro-sub {
                margin-top: 16px;
                color: rgba(220,235,225,.78);
                font-size: .38rem;
                letter-spacing: .06em;
                line-height: 1.9;
            }
            #credits-screen .cr-head {
                color: #33ff88;
                font-size: .7rem;
                letter-spacing: .12em;
                text-shadow: 0 0 14px rgba(51,255,136,.35);
                margin-bottom: 12px;
            }
            #credits-screen .cr-sub {
                color: rgba(200,225,210,.72);
                font-size: .3rem;
                margin-bottom: 8px;
            }
            #credits-screen .cr-role {
                color: #44ccff;
                font-size: .44rem;
                letter-spacing: .08em;
                margin-bottom: 12px;
                text-transform: uppercase;
            }
            #credits-screen .cr-name {
                color: #cfe9db;
                font-size: .36rem;
                letter-spacing: .06em;
                line-height: 1.9;
            }
            #credits-screen .cr-divider {
                height: 2px;
                width: min(760px, 80vw);
                margin: 40px auto 24px;
                background: linear-gradient(90deg, transparent 0%, rgba(68,204,255,.5) 30%, rgba(51,255,136,.5) 70%, transparent 100%);
            }
            #credits-screen .cr-line {
                font-size: .28rem;
                color: rgba(220,235,225,.75);
                line-height: 1.85;
                letter-spacing: .05em;
            }
            #credits-screen .cr-thanks-block {
                margin-top: 64px;
                margin-bottom: 120px;
            }
            #credits-screen .cr-thanks {
                color: #f5c16a;
                font-size: .52rem;
                letter-spacing: .08em;
                text-shadow: 0 0 14px rgba(245,193,106,.35);
            }
            @media (max-width: 900px) {
                #credits-screen .cr-intro-title { font-size: .72rem; }
                #credits-screen .cr-intro-sub { font-size: .31rem; }
                #credits-screen .cr-role { font-size: .34rem; }
                #credits-screen .cr-name { font-size: .3rem; }
                #credits-screen .cr-head { font-size: .52rem; }
                #credits-screen .cr-thanks { font-size: .38rem; }
            }
        `;
        document.head.appendChild(style);
    }

    update() {}

    destroy() {
        this.app.ticker.remove(this._tick);
        if (this.speedBtn && this._onSpeedClick) {
            this.speedBtn.removeEventListener('click', this._onSpeedClick);
        }
        this._onSpeedClick = null;
        this.speedBtn = null;
        if (this._onKeyDown) {
            window.removeEventListener('keydown', this._onKeyDown);
            this._onKeyDown = null;
        }
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
    }
}
