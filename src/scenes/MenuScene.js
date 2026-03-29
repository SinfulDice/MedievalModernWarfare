import { Container } from 'pixi.js';
import { audioManager } from '../services/audioManager.js';

/* Clé localStorage pour persister le choix de scale UI */
const SCALE_KEY = 'worm_ui_scale';

export class MenuScene {
    constructor(app, manager) {
        this.app = app;
        this.manager = manager;
        this.container = new Container();
        this.overlay = null;
    }

    async init() {
        if (!document.getElementById('menu-fonts')) {
            const l = document.createElement('link');
            l.id = 'menu-fonts'; l.rel = 'stylesheet';
            l.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';
            document.head.appendChild(l);
        }

        // Applique le scale sauvegardé au démarrage
        applyUIScale(getSavedScale());

        const style = document.createElement('style');
        style.id = 'menu-style';
        style.textContent = `
            #menu-screen {
                position:fixed; inset:0; z-index:9000;
                background:#080c10;
                display:flex; flex-direction:column;
                align-items:center; justify-content:center;
                gap:40px; overflow:hidden;
                font-family:'Press Start 2P',monospace;
            }
            #menu-screen::before {
                content:''; position:absolute; inset:0; pointer-events:none;
                background:repeating-linear-gradient(0deg,rgba(0,0,0,.12) 0px,rgba(0,0,0,.12) 1px,transparent 1px,transparent 3px);
            }
            #menu-screen::after {
                content:''; position:absolute; inset:0; pointer-events:none;
                background:radial-gradient(ellipse at 50% 50%,transparent 50%,rgba(0,0,0,.65) 100%);
            }
            .menu-blip {
                position:absolute; pointer-events:none; border-radius:0;
                animation:m-blink step-end infinite;
            }
            @keyframes m-blink { 0%,100%{opacity:1} 50%{opacity:0} }

            .menu-title-wrap { display:flex; flex-direction:column; align-items:center; gap:14px; z-index:1; }
            .menu-badge {
                font-size:.38rem; letter-spacing:.28em;
                color:rgba(51,255,136,.5); text-shadow:0 0 8px rgba(51,255,136,.4);
                animation:m-fade .6s ease both;
            }
            .menu-title {
                font-size:clamp(1.2rem,4vw,2.4rem); letter-spacing:.12em;
                color:#33ff88;
                text-shadow:0 0 20px rgba(51,255,136,.6), 0 0 40px rgba(51,255,136,.25),
                            4px 4px 0 rgba(0,0,0,.8);
                animation:m-fade .7s ease .1s both;
                line-height:1.3;
            }
            .menu-sub {
                font-size:.42rem; letter-spacing:.18em;
                color:rgba(68,204,255,.55); text-shadow:0 0 8px rgba(68,204,255,.3);
                animation:m-fade .7s ease .2s both;
            }

            .menu-div {
                width:320px; height:2px; z-index:1;
                background:repeating-linear-gradient(90deg,rgba(51,255,136,.35) 0,rgba(51,255,136,.35) 6px,transparent 6px,transparent 12px);
                animation:m-fade .7s ease .3s both;
            }

            .menu-play {
                padding:16px 44px; z-index:1;
                font-family:'Press Start 2P',monospace; font-size:.78rem; letter-spacing:.14em;
                background:rgba(5,18,10,.85); color:rgba(51,255,136,.4);
                border:2px solid rgba(51,255,136,.35); border-radius:8px;
                border-bottom:3px solid rgba(51,255,136,.55);
                box-shadow:0 0 0 1px rgba(0,0,0,.6), 0 0 0 rgba(51,255,136,0);
                cursor:pointer; text-transform:uppercase;
                text-shadow:0 0 8px currentColor;
                transition:color .15s,border-color .15s,background .15s,box-shadow .15s,transform .1s;
                animation:m-fade .7s ease .4s both;
            }
            .menu-play:hover {
                color:#33ff88; border-color:#33ff88;
                background:rgba(51,255,136,.1);
                box-shadow:0 0 0 1px rgba(0,0,0,.6),0 0 24px rgba(51,255,136,.3);
                transform:translateY(-3px);
            }
            .menu-play:active { transform:translateY(1px); }

            .menu-quickplay {
                padding:7px 18px; z-index:1;
                font-family:'Press Start 2P',monospace; font-size:.38rem; letter-spacing:.1em;
                background:rgba(5,10,20,.8); color:rgba(68,204,255,.45);
                border:1px solid rgba(68,204,255,.25); border-radius:6px;
                border-bottom:2px solid rgba(68,204,255,.35);
                box-shadow:0 0 0 1px rgba(0,0,0,.5);
                cursor:pointer; text-transform:uppercase;
                text-shadow:0 0 6px currentColor;
                transition:color .12s,border-color .12s,background .12s,box-shadow .12s,transform .1s;
                animation:m-fade .7s ease .45s both;
            }
            .menu-quickplay:hover {
                color:#44ccff; border-color:#44ccff;
                background:rgba(68,204,255,.08);
                box-shadow:0 0 0 1px rgba(0,0,0,.5), 0 0 14px rgba(68,204,255,.25);
                transform:translateY(-2px);
            }
            .menu-quickplay:active { transform:translateY(1px); }

            .menu-leaderboard {
                padding:10px 22px; z-index:1;
                font-family:'Press Start 2P',monospace; font-size:.44rem; letter-spacing:.1em;
                background:rgba(28,20,6,.78); color:rgba(245,193,106,.65);
                border:2px solid rgba(245,193,106,.35); border-radius:8px;
                border-bottom:3px solid rgba(245,193,106,.55);
                box-shadow:0 0 0 1px rgba(0,0,0,.5);
                cursor:pointer; text-transform:uppercase;
                text-shadow:0 0 8px currentColor;
                transition:color .12s,border-color .12s,background .12s,box-shadow .12s,transform .1s;
                animation:m-fade .7s ease .47s both;
            }
            .menu-leaderboard:hover {
                color:#f5c16a; border-color:#f5c16a;
                background:rgba(245,193,106,.12);
                box-shadow:0 0 0 1px rgba(0,0,0,.5),0 0 18px rgba(245,193,106,.25);
                transform:translateY(-2px);
            }
            .menu-leaderboard:active { transform:translateY(1px); }

            /* ── Scale UI option ── */
            .menu-scale-wrap {
                display:flex; flex-direction:column; align-items:center; gap:10px;
                z-index:1; animation:m-fade .7s ease .5s both;
            }
            .menu-scale-lbl {
                font-size:.32rem; letter-spacing:.18em;
                color:rgba(51,255,136,.4); text-shadow:0 0 6px currentColor;
            }
            .menu-scale-btns { display:flex; gap:8px; align-items:center; }
            .menu-scale-btn {
                padding:7px 14px;
                font-family:'Press Start 2P',monospace; font-size:.38rem; letter-spacing:.1em;
                background:rgba(5,18,10,.8); color:rgba(51,255,136,.3);
                border:2px solid rgba(51,255,136,.2); border-radius:6px;
                cursor:pointer; transition:color .12s,border-color .12s,background .12s;
            }
            .menu-scale-btn:hover { color:#33ff88; border-color:#33ff88; background:rgba(51,255,136,.08); }
            .menu-scale-btn.active { color:#33ff88; border-color:#33ff88; background:rgba(51,255,136,.12); box-shadow:0 0 10px rgba(51,255,136,.2); }
            .menu-scale-val {
                font-family:'Press Start 2P',monospace; font-size:.48rem;
                color:#33ff88; text-shadow:0 0 8px currentColor;
                min-width:40px; text-align:center;
            }

            .menu-version {
                position:absolute; bottom:20px; right:24px; z-index:1;
                font-size:.3rem; letter-spacing:.12em;
                color:rgba(51,255,136,.22); text-shadow:0 0 4px currentColor;
            }

            @keyframes m-fade { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        `;
        document.head.appendChild(style);

        const ov = document.createElement('div');
        ov.id = 'menu-screen';
        this.overlay = ov;

        for (let i = 0; i < 12; i++) {
            const b = document.createElement('div'); b.className = 'menu-blip';
            const sz = 2 + Math.floor(Math.random() * 3);
            b.style.cssText = `
                left:${Math.random()*100}%;top:${Math.random()*100}%;
                width:${sz}px;height:${sz}px;
                background:${Math.random()>.5?'#33ff88':'#44ccff'};
                box-shadow:0 0 4px currentColor;
                animation-duration:${1+Math.random()*2.5}s;
                animation-delay:${-Math.random()*4}s;
            `;
            ov.appendChild(b);
        }

        const titleWrap = document.createElement('div'); titleWrap.className = 'menu-title-wrap';
        titleWrap.innerHTML = `
            <div class="menu-badge">▸ PIXEL WARFARE ◂</div>
            <div class="menu-title">MEDIEVAL<br>MODERN<br>WARFARE</div>
        `;
        ov.appendChild(titleWrap);

        const div = document.createElement('div'); div.className = 'menu-div'; ov.appendChild(div);

        const btn = document.createElement('button'); btn.className = 'menu-play'; btn.textContent = '▶ JOUER';
        btn.addEventListener('click', () => this.manager.changeScene('charSelect'));
        ov.appendChild(btn);

        const CLASSES_IDS = ['warrior', 'wizard', 'archer'];
        const CLASS_SKINS_MAP = { warrior: 'Aragorn', wizard: 'Gandalf', archer: 'Legolas' };
        const quickBtn = document.createElement('button'); quickBtn.className = 'menu-quickplay';
        quickBtn.textContent = '⚡ PARTIE RAPIDE';
        quickBtn.addEventListener('click', () => {
            const r1 = CLASSES_IDS[Math.floor(Math.random() * CLASSES_IDS.length)];
            const r2 = CLASSES_IDS[Math.floor(Math.random() * CLASSES_IDS.length)];
            this.manager.changeScene('game', {
                p1: { name: 'Joueur 1', classId: r1, skin: CLASS_SKINS_MAP[r1] },
                p2: { name: 'Joueur 2', classId: r2, skin: CLASS_SKINS_MAP[r2] },
            });
        });
        ov.appendChild(quickBtn);

        const lbBtn = document.createElement('button'); lbBtn.className = 'menu-leaderboard';
        lbBtn.textContent = '🏆 LEADERBOARD';
        lbBtn.addEventListener('click', () => this.manager.changeScene('leaderboard'));
        ov.appendChild(lbBtn);

        // ── Sélecteur de taille d'UI ──
        const SCALES = [75, 100, 125, 150];
        const scaleWrap = document.createElement('div'); scaleWrap.className = 'menu-scale-wrap';
        const scaleLbl = document.createElement('div'); scaleLbl.className = 'menu-scale-lbl';
        scaleLbl.textContent = '▸ TAILLE DE L\'INTERFACE';
        scaleWrap.appendChild(scaleLbl);

        const scaleBtns = document.createElement('div'); scaleBtns.className = 'menu-scale-btns';
        const scaleVal = document.createElement('span'); scaleVal.className = 'menu-scale-val';

        const updateBtns = (cur) => {
            scaleVal.textContent = cur + '%';
            scaleBtns.querySelectorAll('.menu-scale-btn').forEach(b => {
                b.classList.toggle('active', parseInt(b.dataset.scale) === cur);
            });
        };

        SCALES.forEach(s => {
            const b = document.createElement('button'); b.className = 'menu-scale-btn';
            b.dataset.scale = s;
            b.textContent = s + '%';
            b.addEventListener('click', () => {
                localStorage.setItem(SCALE_KEY, s);
                applyUIScale(s);
                updateBtns(s);
            });
            scaleBtns.appendChild(b);
        });

        scaleBtns.insertBefore(scaleVal, scaleBtns.firstChild);
        scaleWrap.appendChild(scaleBtns);
        ov.appendChild(scaleWrap);
        updateBtns(getSavedScale());

        const ver = document.createElement('div'); ver.className = 'menu-version'; ver.textContent = 'v1.0 — HACKATHON';
        ov.appendChild(ver);

        document.body.appendChild(ov);

        // Initialiser et jouuer la musique du menu
        await audioManager.init();
        audioManager.playMusic('MenuMusic', true);
    }

    update() {}

    destroy() {
        audioManager.stopMusic();
        if (this.overlay) { this.overlay.remove(); this.overlay = null; }
        const s = document.getElementById('menu-style'); if (s) s.remove();
    }
}

/* ── Helpers scale ── */
function getSavedScale() {
    return parseInt(localStorage.getItem(SCALE_KEY) || '100');
}

export function applyUIScale(scale) {
    // On applique le scale via font-size sur :root (tout ce qui est en rem suit)
    const base = 16 * (scale / 100);
    document.documentElement.style.fontSize = base + 'px';
}
