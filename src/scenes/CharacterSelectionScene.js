import { Container } from 'pixi.js';
import { applyUIScale } from './MenuScene.js';
import { audioManager } from '../services/audioManager.js';

const CLASSES = [
    { id:'warrior', name:'GUERRIER', icon:'assets/items/Sword.png',    desc:'Robuste et puissant.\nAucun ennemi ne\nrésiste à sa lame.' },
    { id:'wizard',  name:'MAGE',     icon:'assets/items/FireBall.png', desc:'Zone d\'explosion max.\nFragile mais\ndévastateur.' },
    { id:'archer',  name:'ARCHER',   icon:'assets/items/Bow.png',      desc:'Ultra rapide,\nprécision chirurgicale\nà longue portée.' },
];

const CLASS_SKINS = {
    warrior: 'Aragorn',
    wizard:  'Gandalf',
    archer:  'Legolas',
};

const EXTRA_SKINS = ['SpongeBob','ShyGuy','Macron','DTrump','Bambi','Zelda','Inkling'];

const P_COLORS = ['#33ff88','#44ccff'];

function ensureFonts() {
    if (document.getElementById('sel-fonts')) return;
    const l = document.createElement('link');
    l.id='sel-fonts'; l.rel='stylesheet';
    l.href='https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';
    document.head.appendChild(l);
}

function ensureStyles() {
    if (document.getElementById('sel-css')) return;
    const s = document.createElement('style');
    s.id = 'sel-css';
    s.textContent = `
        :root{
            --s-bg:   #080c10;
            --s-bg2:  #0d1420;
            --s-grn:  #33ff88;
            --s-cyn:  #44ccff;
            --s-brd:  rgba(51,255,136,.35);
            --s-brd2: rgba(68,204,255,.35);
            --s-txt:  #c8e8d8;
            --s-dim:  rgba(180,230,200,.45);
            --s-r:    8px;
        }

        #selscreen {
            position:fixed; inset:0; z-index:9000;
            background: #080c10;
            display:flex; flex-direction:column; align-items:center; justify-content:center;
            gap:16px; overflow:hidden; font-family:'Press Start 2P',monospace;
        }
        #selscreen::before {
            content:''; position:absolute; inset:0; pointer-events:none; z-index:0;
            background: repeating-linear-gradient(0deg,rgba(0,0,0,.12) 0px,rgba(0,0,0,.12) 1px,transparent 1px,transparent 3px);
        }
        #selscreen::after {
            content:''; position:absolute; inset:0; pointer-events:none; z-index:0;
            background: radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(0,0,0,.6) 100%);
        }

        .s-blip {
            position:absolute; pointer-events:none; z-index:1;
            animation: s-blink step-end infinite;
        }
        @keyframes s-blink { 0%,100%{opacity:1} 50%{opacity:0} }

        .s-prog { display:flex; gap:12px; z-index:2; }
        .s-dot {
            width:14px; height:14px; border-radius:3px;
            border:2px solid rgba(51,255,136,.3);
            transition:background .15s,border-color .15s,box-shadow .15s;
        }
        .s-dot.done { background:var(--s-grn); border-color:var(--s-grn); box-shadow:0 0 8px var(--s-grn); }
        .s-dot.cur  { border-color:var(--s-cyn); background:rgba(68,204,255,.18); box-shadow:0 0 6px var(--s-cyn); }

        .s-hdr { text-align:center; z-index:2; }
        .s-step-sub {
            font-size:.52rem; letter-spacing:.22em; color:var(--s-dim);
            text-shadow:0 0 8px currentColor; margin-bottom:10px;
        }
        .s-title {
            font-size:clamp(.85rem,1.8vw,1.2rem); letter-spacing:.1em;
            text-shadow:0 0 16px currentColor; line-height:1.7;
        }

        .s-div {
            width:100%; max-width:780px; height:2px; z-index:2;
            background: repeating-linear-gradient(90deg,rgba(51,255,136,.35) 0,rgba(51,255,136,.35) 6px,transparent 6px,transparent 12px);
        }

        /* ── NAME ── */
        .s-name-wrap { display:flex; flex-direction:column; align-items:center; gap:18px; z-index:2; }
        .s-hint { font-size:.46rem; color:var(--s-dim); letter-spacing:.14em; text-shadow:0 0 6px currentColor; }
        .s-input {
            padding:16px 24px; font-family:'Press Start 2P',monospace;
            font-size:.88rem; letter-spacing:.08em;
            background:rgba(0,20,10,.8); color:var(--s-txt);
            border:2px solid var(--s-brd); border-radius:var(--s-r);
            border-bottom:3px solid rgba(51,255,136,.5);
            outline:none; text-align:center; width:360px;
            box-shadow:0 0 0 1px rgba(0,0,0,.5), 0 0 14px rgba(51,255,136,.08);
            text-shadow:0 0 8px currentColor;
            transition:border-color .15s, box-shadow .15s;
        }
        .s-input:focus {
            border-color:var(--s-grn);
            box-shadow:0 0 0 1px rgba(0,0,0,.5), 0 0 20px rgba(51,255,136,.2);
        }
        .s-btn {
            padding:14px 36px; font-family:'Press Start 2P',monospace;
            font-size:.66rem; letter-spacing:.1em;
            background:rgba(0,15,8,.8); color:rgba(180,230,200,.3);
            border:2px solid rgba(51,255,136,.3); border-radius:var(--s-r);
            border-bottom:3px solid rgba(51,255,136,.4);
            box-shadow:2px 2px 0 rgba(0,0,0,.5);
            cursor:pointer; text-transform:uppercase;
            text-shadow:0 0 6px currentColor;
            transition:color .12s,border-color .12s,background .12s,box-shadow .12s;
        }
        .s-btn:hover, .s-btn.ready {
            color:var(--s-grn); border-color:var(--s-grn);
            background:rgba(51,255,136,.08);
            box-shadow:2px 2px 0 rgba(0,0,0,.5), 0 0 14px rgba(51,255,136,.2);
        }
        .s-enter { font-size:.42rem; color:rgba(180,230,200,.28); letter-spacing:.1em; }

        /* ── CLASS cards ── */
        .s-cards { display:flex; gap:22px; z-index:2; }
        .s-card {
            width:clamp(180px,14vw,220px);
            background:rgba(5,12,18,.9); border:2px solid rgba(51,255,136,.25); border-radius:var(--s-r);
            box-shadow:0 0 0 1px rgba(0,0,0,.6);
            cursor:pointer; overflow:hidden; display:flex; flex-direction:column;
            transition:border-color .12s, box-shadow .12s, transform .1s; position:relative;
        }
        .s-card::before,.s-card::after {
            content:''; position:absolute; width:9px; height:9px;
            border-color:rgba(51,255,136,.5); border-style:solid; opacity:0; transition:opacity .12s;
        }
        .s-card::before { top:5px; left:5px;    border-width:2px 0 0 2px; }
        .s-card::after  { bottom:5px; right:5px; border-width:0 2px 2px 0; }
        .s-card:hover {
            border-color:var(--s-grn); transform:translateY(-4px);
            box-shadow:0 0 0 1px rgba(0,0,0,.6), 0 0 22px rgba(51,255,136,.22);
        }
        .s-card:hover::before,.s-card:hover::after { opacity:1; }
        .s-card-ico {
            display:flex; align-items:center; justify-content:center;
            padding:22px 10px 16px;
            background:rgba(0,8,4,.7); border-bottom:1px solid rgba(51,255,136,.1);
        }
        .s-card-ico img {
            width:72px; height:72px; object-fit:contain;
            image-rendering:pixelated; image-rendering:crisp-edges;
            filter:drop-shadow(0 0 8px currentColor);
            transition:transform .1s;
        }
        .s-card:hover .s-card-ico img { transform:scale(1.1) translateY(-2px); }
        .s-card-body { padding:14px; display:flex; flex-direction:column; gap:9px; }
        .s-card-name { font-size:.72rem; letter-spacing:.1em; text-align:center; text-shadow:0 0 10px currentColor; }
        .s-card-desc { font-size:.38rem; color:var(--s-dim); text-align:center; line-height:2; white-space:pre-line; }

        /* ── SKIN grid ── */
        .s-skins { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; z-index:2; max-width:700px; }
        .s-skin {
            display:flex; flex-direction:column; align-items:center; gap:8px;
            padding:12px 10px; cursor:pointer;
            background:rgba(5,12,18,.8); border:2px solid rgba(51,255,136,.2); border-radius:var(--s-r);
            box-shadow:0 0 0 1px rgba(0,0,0,.5);
            transition:border-color .1s,transform .1s,box-shadow .1s;
        }
        .s-skin:hover {
            border-color:var(--s-grn); transform:translateY(-3px);
            box-shadow:0 0 0 1px rgba(0,0,0,.5), 0 0 14px rgba(51,255,136,.18);
        }
        .s-skin.s-skin-default {
            border-color:rgba(51,255,136,.55);
            box-shadow:0 0 0 1px rgba(0,0,0,.5), 0 0 10px rgba(51,255,136,.2);
        }
        .s-skin img {
            width:80px; height:80px; object-fit:contain;
            image-rendering:pixelated; image-rendering:crisp-edges;
            filter:drop-shadow(0 2px 6px rgba(0,0,0,.8));
            transition:transform .1s;
        }
        .s-skin:hover img { transform:scale(1.1) translateY(-2px); }
        .s-skin-name { font-size:.34rem; color:var(--s-dim); text-align:center; }
        .s-skin-badge {
            font-size:.28rem; letter-spacing:.08em;
            padding:2px 6px; border-radius:3px;
            background:rgba(51,255,136,.15); border:1px solid rgba(51,255,136,.4);
        }

        /* flash */
        .s-flash { position:fixed; inset:0; background:rgba(51,255,136,.15); pointer-events:none; z-index:10000; animation:s-fl .3s ease-out forwards; }
        @keyframes s-fl { 0%{opacity:1} 100%{opacity:0} }
        @keyframes s-fade { from{opacity:0;transform:translateY(7px)} to{opacity:1;transform:translateY(0)} }
        .s-anim { animation:s-fade .28s ease both; }

        /* ── NAVIGATION ── */
        .s-nav { display:flex; gap:14px; z-index:2; margin-top:4px; }
        .s-btn-back {
            padding:10px 22px; font-family:'Press Start 2P',monospace;
            font-size:.55rem; letter-spacing:.08em;
            background:rgba(0,10,20,.8); color:rgba(120,160,200,.4);
            border:2px solid rgba(68,204,255,.2); border-radius:var(--s-r);
            border-bottom:3px solid rgba(68,204,255,.3);
            box-shadow:2px 2px 0 rgba(0,0,0,.5);
            cursor:pointer; text-transform:uppercase;
            transition:color .12s,border-color .12s,background .12s;
        }
        .s-btn-back:hover {
            color:#44ccff; border-color:#44ccff;
            background:rgba(68,204,255,.08);
        }
        .s-btn-confirm {
            padding:12px 32px; font-family:'Press Start 2P',monospace;
            font-size:.62rem; letter-spacing:.1em;
            background:rgba(0,15,8,.8); color:rgba(180,230,200,.25);
            border:2px solid rgba(51,255,136,.2); border-radius:var(--s-r);
            border-bottom:3px solid rgba(51,255,136,.3);
            box-shadow:2px 2px 0 rgba(0,0,0,.5);
            cursor:pointer; text-transform:uppercase;
            transition:color .12s,border-color .12s,background .12s,box-shadow .12s;
            pointer-events:none; opacity:.4;
        }
        .s-btn-confirm.active {
            color:var(--s-grn); border-color:var(--s-grn);
            background:rgba(51,255,136,.08);
            box-shadow:2px 2px 0 rgba(0,0,0,.5), 0 0 16px rgba(51,255,136,.22);
            pointer-events:auto; opacity:1;
        }
        .s-skin.s-skin-selected {
            border-color:var(--s-grn);
            box-shadow:0 0 0 2px var(--s-grn), 0 0 18px rgba(51,255,136,.35);
            transform:translateY(-3px);
        }
    `;
    document.head.appendChild(s);
}

export class CharacterSelectionScene {
    constructor(app, manager) {
        this.app = app;
        this.manager = manager;
        this.container = new Container();
        this.currentPlayer = 1;
        this.currentStep = 'NAME';
        this.temp = { name:'', classId:null, skin:null };
        this.final = { p1:null, p2:null };
        this.overlay = null;
        this._selectedSkin = null;
        this._musicStarted = false;
    }

    async init() {
        ensureFonts();
        ensureStyles();
        const saved = parseInt(localStorage.getItem('worm_ui_scale') || '100');
        applyUIScale(saved);
        await this._build();
    }

    async _build() {
        if (this.overlay) this.overlay.remove();
        const ov = document.createElement('div');
        ov.id = 'selscreen';
        this.overlay = ov;

        // blips décoratifs
        for (let i = 0; i < 8; i++) {
            const b = document.createElement('div'); b.className = 's-blip';
            const sz = 2 + Math.floor(Math.random() * 3);
            b.style.cssText = `
                left:${Math.random()*100}%; top:${Math.random()*100}%;
                width:${sz}px; height:${sz}px;
                background:${Math.random()>.5?'#33ff88':'#44ccff'};
                box-shadow:0 0 4px currentColor;
                animation-duration:${1+Math.random()*2}s;
                animation-delay:${-Math.random()*3}s;
            `;
            ov.appendChild(b);
        }

        // progress dots (2 étapes × 2 joueurs = 4 : NAME + CLASS+SKIN fusionnés)
        // On garde 6 dots : NAME / CLASS / SKIN pour chaque joueur
        const stepIdx = (this.currentPlayer-1)*3 + ['NAME','CLASS','SKIN'].indexOf(this.currentStep);
        const prog = document.createElement('div'); prog.className = 's-prog';
        for (let i = 0; i < 6; i++) {
            const d = document.createElement('div');
            d.className = 's-dot' + (i < stepIdx ? ' done' : i === stepIdx ? ' cur' : '');
            prog.appendChild(d);
        }
        ov.appendChild(prog);

        // header
        const pColor = P_COLORS[this.currentPlayer - 1];
        const stepLabel = { NAME:'ENTRE TON NOM', CLASS:'CHOISIS TA CLASSE', SKIN:'CHOISIS TON SKIN' }[this.currentStep];
        const hdr = document.createElement('div'); hdr.className = 's-hdr s-anim';
        hdr.innerHTML = `
            <div class="s-step-sub" style="color:${pColor}">ÉTAPE ${stepIdx+1} / 6</div>
            <div class="s-title" style="color:${pColor}">JOUEUR ${this.currentPlayer} — ${stepLabel}</div>`;
        ov.appendChild(hdr);

        const div = document.createElement('div'); div.className = 's-div'; ov.appendChild(div);

        if (this.currentStep === 'NAME')  this._buildName(ov, pColor);
        if (this.currentStep === 'CLASS') this._buildClass(ov, pColor);
        if (this.currentStep === 'SKIN')  this._buildSkin(ov, pColor);

        document.body.appendChild(ov);

        // Initialiser la musique de sélection une seule fois
        if (!this._musicStarted) {
            await audioManager.init();
            audioManager.playMusic('CharacterSelectionMusic', true);
            this._musicStarted = true;
        }
    }

    _buildName(ov, pColor) {
        const wrap = document.createElement('div'); wrap.className = 's-name-wrap s-anim';

        const hint = document.createElement('div'); hint.className = 's-hint';
        hint.style.color = pColor;
        hint.textContent = 'APPUIE SUR ENTRÉE OU CLIQUE VALIDER';
        wrap.appendChild(hint);

        const inp = document.createElement('input');
        inp.className = 's-input'; inp.type = 'text';
        inp.placeholder = 'Ton nom...'; inp.maxLength = 12;
        inp.style.caretColor = pColor;
        if (this.temp.name) inp.value = this.temp.name;
        wrap.appendChild(inp);

        const btn = document.createElement('button'); btn.className = 's-btn'; btn.textContent = 'VALIDER';
        if (this.temp.name) btn.classList.add('ready');
        wrap.appendChild(btn);

        const enterHint = document.createElement('div'); enterHint.className = 's-enter';
        enterHint.style.color = pColor;
        enterHint.textContent = '↵ ENTRÉE POUR VALIDER';
        wrap.appendChild(enterHint);

        ov.appendChild(wrap);

        // Bouton retour sous le formulaire
        const nav = document.createElement('div'); nav.className = 's-nav';
        const back = document.createElement('button'); back.className = 's-btn-back';
        back.textContent = '← RETOUR';
        back.addEventListener('click', () => this._goBack());
        nav.appendChild(back);
        ov.appendChild(nav);

        setTimeout(() => inp.focus(), 80);

        const confirm = () => {
            const v = inp.value.trim();
            if (!v) return;
            this.temp.name = v;
            this._flash();
            this.currentStep = 'CLASS';
            this._build();
        };

        inp.addEventListener('keydown', e => { if (e.key === 'Enter') confirm(); });
        btn.addEventListener('click', confirm);
        inp.addEventListener('input', () => btn.classList.toggle('ready', inp.value.trim().length > 0));
    }

    _goBack() {
        this._flash();
        if (this.currentStep === 'NAME' && this.currentPlayer === 1) {
            // Retour au menu principal
            this.destroy();
            this.manager.changeScene('menu');
            return;
        } else if (this.currentStep === 'NAME' && this.currentPlayer === 2) {
            // Retour au skin du joueur 1
            this.currentPlayer = 1;
            this.currentStep = 'SKIN';
            this.temp = { ...this.final.p1 };
            this._selectedSkin = this.final.p1.skin;
            this.final.p1 = null;
        } else if (this.currentStep === 'CLASS') {
            this.currentStep = 'NAME';
        } else if (this.currentStep === 'SKIN') {
            this._selectedSkin = null;
            this.currentStep = 'CLASS';
        }
        this._build();
    }

    _buildClass(ov, pColor) {
        const cards = document.createElement('div'); cards.className = 's-cards s-anim';

        CLASSES.forEach(cls => {
            const card = document.createElement('div'); card.className = 's-card';

            const icoDiv = document.createElement('div'); icoDiv.className = 's-card-ico';
            icoDiv.style.color = pColor;
            const icoImg = document.createElement('img');
            icoImg.src = cls.icon; icoImg.alt = cls.name; icoImg.draggable = false;
            icoImg.style.filter = `drop-shadow(0 0 8px ${pColor})`;
            icoDiv.appendChild(icoImg);

            const body = document.createElement('div'); body.className = 's-card-body';
            const nameDiv = document.createElement('div'); nameDiv.className = 's-card-name';
            nameDiv.style.color = pColor; nameDiv.textContent = cls.name;
            const descDiv = document.createElement('div'); descDiv.className = 's-card-desc';
            descDiv.textContent = cls.desc;

            body.appendChild(nameDiv); body.appendChild(descDiv);
            card.appendChild(icoDiv); card.appendChild(body);

            card.addEventListener('click', () => {
                this.temp.classId = cls.id;
                this._selectedSkin = null;
                this._flash(); this.currentStep = 'SKIN'; this._build();
            });
            cards.appendChild(card);
        });

        ov.appendChild(cards);

        const nav = document.createElement('div'); nav.className = 's-nav';
        const back = document.createElement('button'); back.className = 's-btn-back';
        back.textContent = '← RETOUR';
        back.addEventListener('click', () => this._goBack());
        nav.appendChild(back);
        ov.appendChild(nav);
    }

    _buildSkin(ov, pColor) {
        const grid = document.createElement('div'); grid.className = 's-skins s-anim';

        const defaultSkinName = CLASS_SKINS[this.temp.classId];
        let confirmBtn;

        const makeSkinBtn = (skinName, isDefault) => {
            const btn = document.createElement('div');
            btn.className = 's-skin' + (isDefault ? ' s-skin-default' : '');
            if (this._selectedSkin === skinName) btn.classList.add('s-skin-selected');

            const img = document.createElement('img');
            img.src = `assets/sprites/${skinName}.png`; img.alt = skinName; img.draggable = false;

            const name = document.createElement('span'); name.className = 's-skin-name';
            name.style.color = pColor; name.textContent = skinName;

            if (isDefault) {
                const badge = document.createElement('span'); badge.className = 's-skin-badge';
                badge.style.color = pColor; badge.textContent = '★ DÉFAUT';
                btn.appendChild(img); btn.appendChild(name); btn.appendChild(badge);
            } else {
                btn.appendChild(img); btn.appendChild(name);
            }

            btn.addEventListener('click', () => {
                grid.querySelectorAll('.s-skin').forEach(b => b.classList.remove('s-skin-selected'));
                btn.classList.add('s-skin-selected');
                this._selectedSkin = skinName;
                if (confirmBtn) confirmBtn.classList.add('active');
            });
            return btn;
        };

        grid.appendChild(makeSkinBtn(defaultSkinName, true));
        EXTRA_SKINS.forEach(sk => grid.appendChild(makeSkinBtn(sk, false)));
        ov.appendChild(grid);

        const nav = document.createElement('div'); nav.className = 's-nav';

        const back = document.createElement('button'); back.className = 's-btn-back';
        back.textContent = '← RETOUR';
        back.addEventListener('click', () => this._goBack());

        confirmBtn = document.createElement('button'); confirmBtn.className = 's-btn-confirm';
        confirmBtn.textContent = 'VALIDER ✓';
        if (this._selectedSkin) confirmBtn.classList.add('active');
        confirmBtn.addEventListener('click', () => {
            if (!this._selectedSkin) return;
            this.temp.skin = this._selectedSkin;
            this._selectedSkin = null;
            this._confirm();
        });

        nav.appendChild(back);
        nav.appendChild(confirmBtn);
        ov.appendChild(nav);
    }

    _flash() {
        const f = document.createElement('div'); f.className = 's-flash';
        document.body.appendChild(f); setTimeout(() => f.remove(), 320);
    }

    _confirm() {
        if (this.currentPlayer === 1) {
            this.final.p1 = { ...this.temp };
            this.currentPlayer = 2; this.currentStep = 'NAME';
            this.temp = { name:'', classId:null, skin:null };
            this._flash(); this._build();
        } else {
            this.final.p2 = { ...this.temp };
            this._flash();
            setTimeout(() => {
                this.destroy();
                this.manager.changeScene('game', { p1: this.final.p1, p2: this.final.p2 });
            }, 220);
        }
    }

    update() {}

    destroy() {
        audioManager.stopMusic();
        if (this.overlay) { this.overlay.remove(); this.overlay = null; }
        const s = document.getElementById('sel-css'); if (s) s.remove();
    }
}
