import { GAME_CONFIG } from './config/gameConfig.js';
import { WEAPONS_DATA, WEAPON_NAMES, WEAPON_COST } from './config/weapons.js';
import { audioManager } from './services/audioManager.js';

/* ── pixel SVG helper ── */
function px(grid, color = '#33ff88', ps = 2) {
    const rs = grid.flatMap((row, y) => [...row].map((c, x) => c === '#' ? `<rect x="${x * ps}" y="${y * ps}" width="${ps}" height="${ps}"/>` : ''));
    const w = grid[0].length * ps, h = grid.length * ps;
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" fill="${color}" xmlns="http://www.w3.org/2000/svg" style="display:block;image-rendering:pixelated">${rs.join('')}</svg>`;
}
const ICON_HELP = ['.####.', '#....#', '.....#', '...##.', '..##..', '..#...', '......', '..##..', '..##..'];
const ICON_GEAR = ['.##..##.', '.######.', '##....##', '#......#', '##....##', '.######.', '.##..##.'];
const ICON_SWORD = ['..#..', '..#..', '..#..', '..#..', '#####', '..#..', '..#..', '.###.', '..#..'];
const GEM_SM = ['.#.', '###', '.#.'];

// All purchasable items (in order)
const ALL_WEAPON_KEYS = ['MACHINEGUN', 'BAZOOKA', 'SNIPER', 'SHOTGUN', 'GRENADE', 'FRAGMENTATION', 'HEAL', 'JUMPPOTION', 'FRIDGE'];
const CONSUMABLE_KEYS = ['HEAL', 'JUMPPOTION'];
const WEAPON_SHOP_KEYS = ALL_WEAPON_KEYS.filter(k => !CONSUMABLE_KEYS.includes(k));

// Expose pour la fenêtre boutique de pré-tour dans GameScene
window._hudWeaponsData = { WEAPONS_DATA, WEAPON_NAMES, WEAPON_COST, ALL_WEAPON_KEYS };
const P_COLORS = ['#33ff88', '#44ccff'];

export function createHUD(players, terrain) {

    /* ── block game clicks on HUD ── */
    document.addEventListener('mousedown', e => {
        if (e.target.closest('[data-hud]')) {
            e.stopImmediatePropagation();
            players.forEach(p => { p.isCharging = false; });
        }
    }, true);
    document.addEventListener('mouseup', e => {
        if (e.target.closest('[data-hud]')) {
            e.stopImmediatePropagation();
            players.forEach(p => { p.isCharging = false; });
        }
    }, true);

    /* ── Styles ── */
    const style = document.createElement('style');
    style.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
        :root{
            --h-bg:  rgba(5,10,16,.88);
            --h-bg2: rgba(8,16,24,.95);
            --h-grn: #33ff88;
            --h-cyn: #44ccff;
            --h-brd: rgba(51,255,136,.35);
            --h-brd2:rgba(51,255,136,.85);
            --h-txt: #c8e8d8;
            --h-dim: rgba(180,230,200,.45);
            --h-r:   8px;   /* plus arrondi */
        }

        /* panel */
        .hp{
            background:var(--h-bg);
            border:2px solid var(--h-brd); border-radius:var(--h-r);
            box-shadow:0 0 0 1px rgba(0,0,0,.6), 0 0 12px rgba(51,255,136,.05);
            position:relative;
        }
        .hp::before,.hp::after{
            content:''; position:absolute; width:6px; height:6px;
            border-color:var(--h-grn); border-style:solid; opacity:.4; pointer-events:none;
        }
        .hp::before{top:5px;left:5px;border-width:2px 0 0 2px;}
        .hp::after{bottom:5px;right:5px;border-width:0 2px 2px 0;}

        /* hud button */
        .hb{
            position:fixed; z-index:1000;
            display:flex; flex-direction:column; align-items:center; justify-content:center;
            gap:4px; cursor:pointer; background:var(--h-bg2);
            border:2px solid var(--h-brd); border-radius:var(--h-r);
            box-shadow:0 0 0 1px rgba(0,0,0,.5), 0 0 8px rgba(51,255,136,.05);
            transition:border-color .12s,box-shadow .12s,transform .1s;
            color:var(--h-grn); user-select:none; padding:0;
            font-family:'Press Start 2P',monospace;
        }
        .hb:hover{border-color:var(--h-brd2);box-shadow:0 0 0 1px rgba(0,0,0,.5),0 0 16px rgba(51,255,136,.25);transform:translateY(-2px);}
        .hb.active{border-color:var(--h-grn);box-shadow:0 0 0 1px rgba(0,0,0,.5),0 0 20px rgba(51,255,136,.35);transform:translateY(-1px);}
        .hb-lbl{font-size:.34rem;letter-spacing:.06em;color:var(--h-dim);text-align:center;max-width:52px;word-break:break-word;}
        .hb-ico{display:flex;align-items:center;justify-content:center;image-rendering:pixelated;transition:filter .12s;}
        .hb:hover .hb-ico,.hb.active .hb-ico{filter:brightness(1.15);}

        /* popup */
        .hpop{
            position:fixed; z-index:999; width:310px; pointer-events:none; opacity:0;
            transition:opacity .18s ease, transform .2s cubic-bezier(.16,1,.3,1);
            border-radius:var(--h-r); overflow:hidden;
        }
        .hpop.tl{transform-origin:top left;  transform:translateY(-6px) scale(.96);}
        .hpop.tr{transform-origin:top right; transform:translateY(-6px) scale(.96);}
        .hpop.bl{transform-origin:bottom left;transform:translateY(6px) scale(.96);}
        .hpop.visible{opacity:1;transform:translateY(0) scale(1)!important;pointer-events:all;}

        .pop-head{
            display:flex;align-items:center;gap:8px;padding:10px 13px 9px;
            background:rgba(5,14,10,.96);border-bottom:2px solid rgba(51,255,136,.15);
        }
        .pop-title{font-family:'Press Start 2P',monospace;font-size:.56rem;letter-spacing:.1em;color:var(--h-grn);text-shadow:0 0 8px rgba(51,255,136,.5);}
        .pop-body{padding:12px 13px 14px;display:flex;flex-direction:column;gap:11px;}
        .sec-lbl{font-family:'Press Start 2P',monospace;font-size:.36rem;letter-spacing:.14em;color:rgba(51,255,136,.55);text-transform:uppercase;margin-bottom:6px;}
        .hrow{display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;}
        .hrow:last-child{margin-bottom:0;}
        .hact{font-family:'Press Start 2P',monospace;font-size:.4rem;color:var(--h-txt);line-height:1.8;}
        .hkeys{display:flex;gap:4px;align-items:center;}
        .hkey{
            display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:21px;padding:0 5px;
            background:rgba(51,255,136,.08);
            border:2px solid rgba(51,255,136,.35); border-radius:3px; border-bottom:3px solid rgba(51,255,136,.55);
            font-family:'Press Start 2P',monospace;font-size:.36rem;color:var(--h-grn);white-space:nowrap;
        }
        .hkey.w{min-width:60px;}
        .hdiv{width:100%;height:2px;background:repeating-linear-gradient(90deg,rgba(51,255,136,.22) 0,rgba(51,255,136,.22) 5px,transparent 5px,transparent 10px);}
        .tip-bar{display:flex;gap:8px;padding:8px 13px;border-top:2px solid rgba(51,255,136,.1);background:rgba(51,255,136,.03);}
        .tip-txt{font-family:'Press Start 2P',monospace;font-size:.32rem;color:rgba(180,230,200,.4);line-height:1.9;}

        /* options */
        .orow{display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px dashed rgba(51,255,136,.1);}
        .orow:last-child{border-bottom:none;}
        .olbl{font-family:'Press Start 2P',monospace;font-size:.38rem;color:var(--h-txt);line-height:1.6;}
        .otog{width:38px;height:20px;border-radius:3px;border:2px solid rgba(51,255,136,.3);background:rgba(0,0,0,.3);cursor:pointer;position:relative;transition:background .12s,border-color .12s;flex-shrink:0;}
        .otog.on{background:rgba(51,255,136,.15);border-color:var(--h-grn);}
        .otog::after{content:'';position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:2px;background:rgba(51,255,136,.4);transition:transform .12s,background .12s;}
        .otog.on::after{transform:translateX(18px);background:var(--h-grn);box-shadow:0 0 6px rgba(51,255,136,.7);}
        .osl-row{display:flex;align-items:center;gap:10px;padding:6px 0;}
        .osl-lbl{font-family:'Press Start 2P',monospace;font-size:.34rem;color:var(--h-dim);width:68px;flex-shrink:0;line-height:1.5;}
        .oslider{flex:1;-webkit-appearance:none;appearance:none;height:4px;border-radius:2px;background:rgba(51,255,136,.15);outline:none;cursor:pointer;border:1px solid rgba(51,255,136,.2);}
        .oslider::-webkit-slider-thumb{-webkit-appearance:none;width:10px;height:14px;border-radius:2px;background:var(--h-grn);box-shadow:0 0 5px rgba(51,255,136,.6);cursor:pointer;}
        .osl-val{font-family:'Press Start 2P',monospace;font-size:.34rem;color:var(--h-grn);width:26px;text-align:right;flex-shrink:0;}

        /* ── SHOP popup wide ── */
        #hud-shop-popup{width:380px;}
        .shop-gold {
            display:flex; align-items:center; gap:8px; padding:8px 13px;
            border-bottom:2px solid rgba(51,255,136,.12);
            background:rgba(0,12,6,.5);
        }
        .shop-gold-ico { font-size:1rem; }
        .shop-gold-label { font-family:'Press Start 2P',monospace; font-size:.38rem; color:var(--h-dim); }
        .shop-gold-val { font-family:'Press Start 2P',monospace; font-size:.56rem; color:#f5c16a; text-shadow:0 0 8px rgba(245,193,106,.5); margin-left:auto; }
        .shop-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;}
        .shop-item{
            display:flex;flex-direction:column;align-items:center;gap:6px;
            padding:9px 8px 8px; text-align:center;
            background:rgba(0,8,5,.7);border:2px solid rgba(51,255,136,.18);border-radius:6px;
            position:relative; transition:border-color .12s,background .12s,transform .12s,box-shadow .12s;
        }
        .shop-item.owned{border-color:rgba(51,255,136,.4);}
        .shop-item.buyable{cursor:pointer;}
        .shop-item.buyable:hover{border-color:rgba(245,193,106,.9);background:rgba(245,193,106,.1);transform:translateY(-2px);box-shadow:0 0 0 1px rgba(245,193,106,.35),0 0 16px rgba(245,193,106,.28);}
        .shop-item.buyable:hover .shop-item-name{color:#ffe2a6;}
        .shop-item.buyable:hover::after{
            content:'CLIQUEZ';
            position:absolute;
            left:50%;
            bottom:-8px;
            transform:translateX(-50%);
            font-family:'Press Start 2P',monospace;
            font-size:.24rem;
            padding:1px 4px;
            border-radius:3px;
            border:1px solid rgba(245,193,106,.65);
            background:rgba(20,12,2,.9);
            color:#f5c16a;
            pointer-events:none;
        }
        .shop-item.broke{opacity:.45;}
        .shop-item img{width:40px;height:40px;object-fit:contain;image-rendering:pixelated;image-rendering:crisp-edges;}
        .shop-item.locked img{filter:grayscale(.6) brightness(.55);}
        .shop-item-name{font-family:'Press Start 2P',monospace;font-size:.34rem;color:var(--h-grn);}
        .shop-item.locked .shop-item-name{color:var(--h-dim);}
        .shop-item-price{font-family:'Press Start 2P',monospace;font-size:.36rem;color:#f5c16a;text-shadow:0 0 5px rgba(245,193,106,.4);}
        .shop-badge{
            position:absolute;top:-5px;right:-5px;
            font-family:'Press Start 2P',monospace;font-size:.28rem;padding:2px 4px;border-radius:3px;
        }
        .shop-item.owned .shop-badge{background:rgba(51,255,136,.18);border:1px solid rgba(51,255,136,.45);color:var(--h-grn);}
        .shop-buy-btn{
            padding:4px 10px; font-family:'Press Start 2P',monospace; font-size:.32rem;
            background:rgba(245,193,106,.12); color:#f5c16a;
            border:1px solid rgba(245,193,106,.4); border-radius:4px; border-bottom:2px solid rgba(245,193,106,.55);
            cursor:pointer; transition:background .1s,border-color .1s;
        }
        .shop-buy-btn:hover{background:rgba(245,193,106,.22);border-color:#f5c16a;}
        .shop-buy-btn:disabled{opacity:.35;cursor:not-allowed;}

        /* ── INVENTAIRE ── */
        #hud-inv{
            position:fixed;bottom:16px;left:50%;transform:translateX(-50%);
            z-index:1000;display:flex;align-items:center;gap:5px;padding:8px 11px;
            animation:hFUC .4s ease .4s both;
        }
        .islot{
            display:flex;flex-direction:column;align-items:center;gap:5px;
            cursor:pointer;padding:7px 10px;min-width:70px;
            border:2px solid rgba(51,255,136,.2);border-radius:var(--h-r);
            background:rgba(5,12,8,.75);
            box-shadow:0 0 0 1px rgba(0,0,0,.4);
            transition:border-color .1s,background .1s,transform .08s;position:relative;
        }
        .islot:hover{border-color:rgba(51,255,136,.6);background:rgba(51,255,136,.07);transform:translateY(-2px);}
        .islot.active{
            border-color:var(--h-grn);background:rgba(51,255,136,.1);
            box-shadow:0 0 0 1px rgba(0,0,0,.4),0 0 14px rgba(51,255,136,.2);
        }
        .islot.active::after{content:'';position:absolute;bottom:-6px;left:50%;width:5px;height:5px;background:var(--h-grn);transform:translateX(-50%) rotate(45deg);border-radius:1px;box-shadow:0 0 5px var(--h-grn);}
        .iico{display:flex;align-items:center;justify-content:center;height:32px;}
        .iico img{max-width:48px;max-height:28px;width:auto;height:auto;image-rendering:pixelated;image-rendering:crisp-edges;transition:filter .1s,transform .1s;}
        .islot:hover .iico img{transform:scale(1.08);}
        .islot.active .iico img{filter:brightness(1.15);}
        .inm{font-family:'Press Start 2P',monospace;font-size:.32rem;color:var(--h-dim);text-align:center;white-space:nowrap;}
        .islot.active .inm{color:var(--h-grn);}
        .ihk{position:absolute;top:3px;right:5px;font-family:'Press Start 2P',monospace;font-size:.32rem;color:rgba(51,255,136,.38);}
        .islot.active .ihk{color:rgba(51,255,136,.8);}
        .islot-ammo{position:absolute;bottom:3px;right:5px;font-family:'Press Start 2P',monospace;font-size:.3rem;text-shadow:0 0 4px currentColor;}
        .islot-empty{opacity:.7;cursor:default;}
        .islot-empty:hover{transform:none!important;border-color:rgba(51,255,136,.2)!important;background:transparent!important;}
        .idiv{width:2px;height:36px;background:repeating-linear-gradient(180deg,rgba(51,255,136,.25) 0,rgba(51,255,136,.25) 3px,transparent 3px,transparent 6px);border-radius:1px;}

        /* ── HP bars ── */
        .hud-hp-wrap{
            position:fixed;top:80px;left:50%;transform:translateX(-50%);
            z-index:1001;display:flex;gap:18px;
        }
        .hud-hp-wrap.hud-hidden{display:none!important;}
        .hud-hp{display:flex;flex-direction:column;align-items:center;gap:5px;padding:7px 12px;}
        .hud-hp-name{font-family:'Press Start 2P',monospace;font-size:.4rem;letter-spacing:.08em;text-shadow:0 0 10px currentColor;}
        .hud-hp-bar-wrap{width:100px;height:7px;background:rgba(0,0,0,.5);border:1px solid rgba(51,255,136,.2);border-radius:3px;overflow:hidden;}
        .hud-hp-bar{height:100%;border-radius:2px;transition:width .3s ease;}
        .hud-hp-val{font-family:'Press Start 2P',monospace;font-size:.34rem;color:var(--h-dim);}

        /* ── SHOP ── */
        #hud-shop-btn{bottom:16px;left:16px;width:58px;height:58px;animation:hFU .4s ease .2s both;}
        #hud-shop-popup{bottom:84px;left:16px;top:auto;transform-origin:bottom left;transform:translateY(6px) scale(.96)!important;}

        /* ── PELLE (creuser) ── */
        #hud-dig-btn{
            position:fixed; bottom:16px; left:84px;
            width:58px; height:58px; z-index:4000;
            background:rgba(8,16,24,.82); border:2px solid rgba(180,120,60,.45);
            border-radius:10px; border-bottom:3px solid rgba(180,120,60,.65);
            box-shadow:0 0 0 1px rgba(0,0,0,.5);
            display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px;
            cursor:pointer; pointer-events:auto;
            transition:border-color .12s, background .12s, box-shadow .12s, transform .1s;
            animation:hFU .4s ease .25s both;
        }
        #hud-dig-btn:hover { border-color:rgba(230,160,80,.8); background:rgba(180,120,60,.12); box-shadow:0 0 14px rgba(180,120,60,.3); transform:translateY(-2px); }
        #hud-dig-btn:active { transform:translateY(1px); }
        #hud-dig-btn.digging { border-color:#e8a050; background:rgba(180,120,60,.22); box-shadow:0 0 18px rgba(230,160,80,.45); animation: digBlink 0.15s steps(1) 4; }
        @keyframes digBlink {
            0%,100% { opacity:1; border-color:#e8a050; box-shadow:0 0 22px rgba(230,160,80,.9); }
            50%      { opacity:0.2; border-color:#ff6600; box-shadow:0 0 4px rgba(230,160,80,.2); }
        }
        #hud-dig-btn img { width:34px; height:34px; object-fit:contain; image-rendering:pixelated; }
        #hud-dig-btn .hb-lbl { font-size:.28rem; color:rgba(180,130,70,.8); letter-spacing:.06em; }

        /* ── AIDE ── */
        #hud-cmd-btn{top:16px;left:16px;width:54px;height:54px;animation:hFD .4s ease .1s both;}
        #hud-cmd-popup{top:16px;left:80px;transform-origin:top left!important;max-height:calc(100vh - 32px);overflow-y:auto;}
        #hud-cmd-popup.tl{transform:translateX(-6px) scale(.96);}
        #hud-cmd-popup.visible{transform:translateX(0) scale(1)!important;}

        /* ── OPTIONS ── */
        #hud-opt-btn{top:16px;right:16px;width:54px;height:54px;animation:hFD .4s ease .15s both;}
        #hud-opt-popup{top:16px;right:80px;transform-origin:top right!important;max-height:calc(100vh - 32px);overflow-y:auto;}
        #hud-opt-popup.tr{transform:translateX(6px) scale(.96);}
        #hud-opt-popup.visible{transform:translateX(0) scale(1)!important;}

        /* ── TOUR ── */
        #hud-turn{
            position:fixed;top:56px;left:0;right:0;margin:0 auto;width:fit-content;
            z-index:1001;padding:6px 16px;
            font-family:'Press Start 2P',monospace;font-size:.5rem;letter-spacing:.14em;
            text-transform:uppercase;
            text-shadow:0 0 12px currentColor;
            animation:hFD .4s ease .3s both;
        }

        /* ── MINIMAP ── */
        #hud-mm{position:fixed;bottom:16px;right:16px;z-index:1000;animation:hFU .4s ease .55s both;transition:opacity .25s,visibility .25s;}
        #hud-mm.hud-hidden{opacity:0!important;visibility:hidden;pointer-events:none;}
        #hud-inv.hud-hidden,#hud-cmd-btn.hud-hidden{opacity:0!important;visibility:hidden;pointer-events:none;}
        #hud-mm-inner{position:relative;overflow:hidden;border-radius:0 0 3px 3px;}
        #hud-mm-canvas{display:block;image-rendering:pixelated;image-rendering:crisp-edges;}
        #hud-mm-frame{position:absolute;inset:0;border:2px solid rgba(51,255,136,.28);border-radius:0 0 2px 2px;pointer-events:none;}
        #hud-mm-frame::before,#hud-mm-frame::after{content:'';position:absolute;width:7px;height:7px;border-color:rgba(51,255,136,.6);border-style:solid;}
        #hud-mm-frame::before{top:3px;left:3px;border-width:2px 0 0 2px;}
        #hud-mm-frame::after{bottom:3px;right:3px;border-width:0 2px 2px 0;}
        .mm-head{display:flex;align-items:center;justify-content:space-between;padding:5px 9px 4px;background:rgba(3,10,6,.92);border-bottom:2px solid rgba(51,255,136,.15);border-radius:3px 3px 0 0;}
        .mm-title{font-family:'Press Start 2P',monospace;font-size:.36rem;letter-spacing:.12em;color:rgba(51,255,136,.6);}
        .mm-leg{display:flex;align-items:center;gap:8px;}
        .mm-li{display:flex;align-items:center;gap:3px;font-family:'Press Start 2P',monospace;font-size:.3rem;color:rgba(180,230,200,.42);}

        /* ANIMATIONS */
        @keyframes hFD {from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes hFU {from{opacity:0;transform:translateY(8px)}  to{opacity:1;transform:translateY(0)}}
        /* animations pour éléments centrés (preservent translateX(-50%)) */
        @keyframes hFDC{from{opacity:0;transform:translateX(-50%) translateY(-8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
        @keyframes hFUC{from{opacity:0;transform:translateX(-50%) translateY(8px)} to{opacity:1;transform:translateX(-50%) translateY(0)}}
        @keyframes hPulse{0%,100%{box-shadow:0 0 0 0 rgba(51,255,136,.5);}60%{box-shadow:0 0 0 10px rgba(51,255,136,0);}}
        .hb.pulse{animation:hPulse 1s ease 3;}
    `;
    document.head.appendChild(style);

    /* ── helpers ── */
    const popups = [], btns = [];
    function makeBtn(id, inner) {
        const b = document.createElement('button'); b.id = id; b.className = 'hb'; b.setAttribute('data-hud', '');
        b.innerHTML = inner; document.body.appendChild(b); btns.push(b); return b;
    }
    function makePop(id, cls, inner) {
        const p = document.createElement('div'); p.id = id; p.className = `hpop hp ${cls}`; p.setAttribute('data-hud', '');
        p.innerHTML = inner; document.body.appendChild(p); popups.push(p); return p;
    }
    function closeAll() { popups.forEach(p => p.classList.remove('visible')); btns.forEach(b => b.classList.remove('active')); }
    function bind(btn, pop) {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const opening = !pop.classList.contains('visible');
            closeAll();
            if (opening) { pop.classList.add('visible'); btn.classList.add('active'); }
        });
        pop.addEventListener('click', e => e.stopPropagation());
    }
    function popHead(t) { return `<div class="pop-head"><div class="pop-gem">${px(GEM_SM, '#33ff88', 2)}</div><div class="pop-title">${t}</div></div>`; }

    /* ══ 1. AIDE ══════════════════════════════════════════ */
    const cmdBtn = makeBtn('hud-cmd-btn', `<div class="hb-ico">${px(ICON_HELP, '#33ff88', 2)}</div><span class="hb-lbl">Aide</span>`);
    const cmdPop = makePop('hud-cmd-popup', 'tl', `
        ${popHead('Commandes')}
        <div class="pop-body">
            <div>
                <div class="sec-lbl">Déplacements</div>
                <div class="hrow"><span class="hact">Gauche</span><div class="hkeys"><span class="hkey">Q</span><span style="color:rgba(51,255,136,.3)">/</span><span class="hkey">A</span></div></div>
                <div class="hrow"><span class="hact">Droite</span><div class="hkeys"><span class="hkey">D</span></div></div>
                <div class="hrow"><span class="hact">Sauter</span><div class="hkeys"><span class="hkey w">Espace</span><span style="color:rgba(51,255,136,.3)">/</span><span class="hkey">Z</span><span style="color:rgba(51,255,136,.3)">/</span><span class="hkey">W</span></div></div>
            </div>
            <div class="hdiv"></div>
            <div>
                <div class="sec-lbl">Combat</div>
                <div class="hrow"><span class="hact">Viser</span><div class="hkeys"><span class="hkey">🖱️</span></div></div>
                <div class="hrow"><span class="hact">Charger/Tirer</span><div class="hkeys"><span class="hkey w">Clic gauche</span></div></div>
                <div class="hrow"><span class="hact">Démarrer tour</span><div class="hkeys"><span class="hkey w">Toute touche</span></div></div>
            </div>
            <div class="hdiv"></div>
            <div>
                <div class="sec-lbl">Creuser</div>
                <div class="hrow"><span class="hact">Creuser devant soi</span><div class="hkeys"><span class="hkey w">Clic droit</span></div></div>
            </div>
            <div class="hdiv"></div>
            <div>
                <div class="sec-lbl">Shop</div>
                <div class="hrow"><span class="hact">Ouvrir/Fermer shop</span><div class="hkeys"><span class="hkey">E</span></div></div>
            </div>
            <div class="hdiv"></div>
            <div>
                <div class="sec-lbl">Construction</div>
                <div class="hrow"><span class="hact">Poser une plateforme</span><div class="hkeys"><span class="hkey">F</span></div></div>
                <div class="hrow"><span class="hact">Tourner (8 positions)</span><div class="hkeys"><span class="hkey w">Molette</span></div></div>
                <div class="hrow"><span class="hact">Point de rotation</span><div class="hkeys"><span class="hkey w">Curseur</span></div></div>
            </div>
            <div class="hdiv"></div>
            <div>
                <div class="sec-lbl">Armes (1–5)</div>
                <div class="hrow"><span class="hact">Changer d'arme</span><div class="hkeys"><span class="hkey">1</span><span class="hkey">2</span><span class="hkey">3</span><span class="hkey">4</span><span class="hkey">5</span></div></div>
            </div>
            <div class="hdiv"></div>
            <div>
                <div class="sec-lbl" style="color:#ffcc44">⚡ Événements Aléatoires</div>
                <div style="font-family:'Press Start 2P',monospace;font-size:.28rem;color:rgba(200,220,200,.7);line-height:1.8;margin-bottom:6px">
                    Entre deux tours, un événement tombe du ciel sur la moitié de map du joueur suivant.
                </div>
                <div class="hrow" style="align-items:flex-start;gap:8px">
                    <span style="font-size:.9rem">💣</span>
                    <div>
                        <div style="font-family:'Press Start 2P',monospace;font-size:.3rem;color:#ff6644">BOMBA — 50%</div>
                        <div style="font-family:'Press Start 2P',monospace;font-size:.26rem;color:rgba(200,200,200,.6)">BombBox tombe puis explose (puissance frigo)</div>
                    </div>
                </div>
                <div class="hrow" style="align-items:flex-start;gap:8px;margin-top:4px">
                    <span style="font-size:.9rem">❤️</span>
                    <div>
                        <div style="font-family:'Press Start 2P',monospace;font-size:.3rem;color:#00ff88">CAISSE DE SOINS — 25%</div>
                        <div style="font-family:'Press Start 2P',monospace;font-size:.26rem;color:rgba(200,200,200,.6)">HealBox à ramasser : +40 PV</div>
                    </div>
                </div>
                <div class="hrow" style="align-items:flex-start;gap:8px;margin-top:4px">
                    <span style="font-size:.9rem">🪙</span>
                    <div>
                        <div style="font-family:'Press Start 2P',monospace;font-size:.3rem;color:#ffd700">COFFRE DE PIÈCES — 25%</div>
                        <div style="font-family:'Press Start 2P',monospace;font-size:.26rem;color:rgba(200,200,200,.6)">MoneyBox à ramasser : +100 or</div>
                    </div>
                </div>
                <div style="font-family:'Press Start 2P',monospace;font-size:.25rem;color:rgba(255,200,50,.55);margin-top:8px;line-height:1.7">
                    Tirage sans remise — chaque événement sort une fois avant recharge de la roue.
                </div>
            </div>
        </div>
        <div class="tip-bar"><span class="tip-txt">Maintenez clic gauche puis relâchez pour tirer. Clic droit creuse. E ouvre le shop. F construit au curseur (1 plateforme max / tour).</span></div>
    `);
    bind(cmdBtn, cmdPop);

    /* ══ 2. OPTIONS ═══════════════════════════════════════ */
    const optBtn = makeBtn('hud-opt-btn', `<div class="hb-ico">${px(ICON_GEAR, '#33ff88', 2)}</div><span class="hb-lbl">Options</span>`);
    const optPop = makePop('hud-opt-popup', 'tr', `
        ${popHead('Options')}
        <div class="pop-body">
            <div>
                <div class="sec-lbl">Affichage</div>
                <div class="orow"><span class="olbl">Plein écran</span><div class="otog" id="opt-fs"></div></div>
                <div class="orow"><span class="olbl">Effets</span><div class="otog on" id="opt-fx"></div></div>
                <div class="orow"><span class="olbl">Minimap</span><div class="otog on" id="opt-mm"></div></div>
            </div>
            <div class="hdiv"></div>
            <div>
                <div class="sec-lbl">Interface</div>
                <div class="osl-row"><span class="osl-lbl">Taille UI</span><input type="range" class="oslider" id="sl-uiscale" min="75" max="150" value="100" step="25"><span class="osl-val" id="val-uiscale">100%</span></div>
                <div class="osl-row"><span class="osl-lbl">Opacité HUD</span><input type="range" class="oslider" id="sl-opacity" min="30" max="100" value="100"><span class="osl-val" id="val-opacity">100%</span></div>
                <div class="osl-row"><span class="osl-lbl">Zoom carte</span><input type="range" class="oslider" id="sl-zoom" min="1" max="3" value="2" step="1"><span class="osl-val" id="val-zoom">×1.5</span></div>
                <div class="osl-row"><span class="osl-lbl">Volume Musique</span><input type="range" class="oslider" id="sl-music-volume" min="0" max="100" value="50" step="5"><span class="osl-val" id="val-music-volume">50%</span></div>
                <div class="osl-row"><span class="osl-lbl">Volume SFX</span><input type="range" class="oslider" id="sl-sfx-volume" min="0" max="100" value="50" step="5"><span class="osl-val" id="val-sfx-volume">50%</span></div>
            </div>
        </div>
    `);
    bind(optBtn, optPop);

    document.getElementById('opt-fs').addEventListener('click', function () {
        this.classList.toggle('on');
        if (this.classList.contains('on')) document.documentElement.requestFullscreen?.().catch(() => this.classList.remove('on'));
        else document.exitFullscreen?.();
    });
    document.addEventListener('fullscreenchange', () => { const t = document.getElementById('opt-fs'); if (t) t.classList.toggle('on', !!document.fullscreenElement); });
    document.getElementById('opt-fx').addEventListener('click', function () {
        this.classList.toggle('on');
        const c = document.querySelector('body > canvas');
        if (c) c.style.filter = this.classList.contains('on') ? '' : 'saturate(.35) brightness(.8)';
    });
    document.getElementById('opt-mm').addEventListener('click', function () {
        this.classList.toggle('on');
        document.getElementById('hud-mm')?.classList.toggle('hud-hidden', !this.classList.contains('on'));
    });
    // Taille UI en temps réel
    const _savedScale = parseInt(localStorage.getItem('worm_ui_scale') || '100');
    document.getElementById('sl-uiscale').value = _savedScale;
    document.getElementById('val-uiscale').textContent = _savedScale + '%';
    document.getElementById('sl-uiscale').addEventListener('input', function () {
        const s = parseInt(this.value);
        document.getElementById('val-uiscale').textContent = s + '%';
        localStorage.setItem('worm_ui_scale', s);
        document.documentElement.style.fontSize = (16 * s / 100) + 'px';
    });

    // Volume Musique, 50% par defaut
    const _savedMusicVolume = parseInt(localStorage.getItem('worm_music_volume') || '50');
    const _clampedMusicVolume = Math.max(0, Math.min(100, _savedMusicVolume));
    document.getElementById('sl-music-volume').value = _clampedMusicVolume;
    document.getElementById('val-music-volume').textContent = _clampedMusicVolume + '%';
    audioManager.setMusicVolume(_clampedMusicVolume / 100);
    document.getElementById('sl-music-volume').addEventListener('input', function () {
        const v = parseInt(this.value);
        document.getElementById('val-music-volume').textContent = v + '%';
        localStorage.setItem('worm_music_volume', v);
        audioManager.setMusicVolume(v / 100);
    });

    // Volume SFX, 50% par defaut
    const _savedSFXVolume = parseInt(localStorage.getItem('worm_sfx_volume') || '50');
    const _clampedSFXVolume = Math.max(0, Math.min(100, _savedSFXVolume));
    document.getElementById('sl-sfx-volume').value = _clampedSFXVolume;
    document.getElementById('val-sfx-volume').textContent = _clampedSFXVolume + '%';
    audioManager.setSFXVolume(_clampedSFXVolume / 100);
    document.getElementById('sl-sfx-volume').addEventListener('input', function () {
        const v = parseInt(this.value);
        document.getElementById('val-sfx-volume').textContent = v + '%';
        localStorage.setItem('worm_sfx_volume', v);
        audioManager.setSFXVolume(v / 100);
    });

    const HUD_OPA = ['#hud-cmd-btn', '#hud-opt-btn', '#hud-shop-btn', '#hud-dig-btn', '#hud-inv', '#hud-mm', '#hud-hp-wrap'];
    document.getElementById('sl-opacity').addEventListener('input', function () {
        document.getElementById('val-opacity').textContent = this.value + '%';
        const a = (this.value / 100).toFixed(2);
        HUD_OPA.forEach(sel => { const el = document.querySelector(sel); if (el) { el.style.animation = 'none'; el.style.opacity = a; } });
    });
    const zL = { 1: '×1', 2: '×1.5', 3: '×2' }, zF = { 1: .5, 2: .75, 3: 1 };
    document.getElementById('sl-zoom').addEventListener('input', function () {
        const z = parseInt(this.value);
        document.getElementById('val-zoom').textContent = zL[z] || '×1';
        const mc = document.getElementById('hud-mm-canvas');
        if (mc) { mc.style.width = (MM_W * zF[z]) + 'px'; mc.style.height = (MM_H * zF[z]) + 'px'; }
    });

    /* ══ 3. SHOP — dynamic ═══════════════════════════════ */
    const shopBtn = makeBtn('hud-shop-btn', `<div class="hb-ico">${px(ICON_SWORD, '#33ff88', 2)}</div><span class="hb-lbl">Shop</span>`);

    // Shop popup shell — content filled dynamically on open
    const shopPop = document.createElement('div');
    shopPop.id = 'hud-shop-popup'; shopPop.className = 'hpop hp bl'; shopPop.setAttribute('data-hud', '');
    shopPop.innerHTML = popHead('Armurerie') + `<div id="shop-body" class="pop-body"></div>`;
    document.body.appendChild(shopPop);
    popups.push(shopPop);

    function renderShop() {
        const active = players.find(p => p.isActive) ?? players[0];
        if (!active) return;
        const body = document.getElementById('shop-body');
        if (!body) return;

        body.innerHTML = `
            <div class="shop-gold">
                <span class="shop-gold-ico">🪙</span>
                <span class="shop-gold-label">${active.playerName || 'Joueur'}</span>
                <span class="shop-gold-val" id="shop-gold-val">${active.gold} or</span>
            </div>
            <div class="sec-lbl" style="margin-top:10px">Arsenal</div>
            <div class="shop-grid" id="shop-grid-weapons"></div>
            <div class="sec-lbl" style="margin-top:10px">Consommables</div>
            <div class="shop-grid" id="shop-grid-consumables"></div>
        `;

        const weaponGrid = document.getElementById('shop-grid-weapons');
        const consumableGrid = document.getElementById('shop-grid-consumables');
        ALL_WEAPON_KEYS.forEach(key => {
            const cfg = WEAPONS_DATA[key];
            const cost = typeof WEAPON_COST === 'object' ? (WEAPON_COST[key] ?? 100) : WEAPON_COST;
            const grid = CONSUMABLE_KEYS.includes(key) ? consumableGrid : weaponGrid;
            if (!grid) return;

            // Consommable HEAL : soin instantané à l'achat
            if (cfg.isHeal) {
                const isFullHp = active.hp >= active.maxHp;
                const canAfford = active.gold >= cost;

                const item = document.createElement('div');
                item.className = isFullHp
                    ? 'shop-item owned locked'
                    : canAfford ? 'shop-item locked buyable' : 'shop-item locked broke';

                item.innerHTML = `
                    <img src="${cfg.shopAsset || cfg.asset}" alt="${WEAPON_NAMES[key]}" draggable="false">
                    <div class="shop-item-name">${WEAPON_NAMES[key]}</div>
                    ${isFullHp
                        ? `<div class="shop-badge">✓ PV MAX</div>`
                        : `<div class="shop-item-price">🪙 ${cost}</div>
                        <button class="shop-buy-btn" ${!canAfford ? 'disabled' : ''}>ACHETER</button>`
                    }
                `;

                if (!isFullHp) {
                    const btn = item.querySelector('.shop-buy-btn');
                    if (btn && canAfford) {
                        btn.addEventListener('click', async e => {
                            e.stopPropagation();
                            const ok = await active.buyWeapon(key);
                            if (ok) {
                                rebuildInv();
                                renderShop();
                            }
                        });
                        item.addEventListener('click', async e => {
                            if (e.target?.closest('.shop-buy-btn')) return;
                            e.stopPropagation();
                            const ok = await active.buyWeapon(key);
                            if (ok) {
                                rebuildInv();
                                renderShop();
                            }
                        });
                    }
                }

                grid.appendChild(item);
                return; // skip logique normale
            }

            // Cas spécial JUMPPOTION : achat multiple avec stock limité
            if (cfg.isJumpPotion) {
                const boostActive = !!active.jumpBoostActiveThisTurn;
                const canAfford = active.gold >= cost;

                const item = document.createElement('div');
                item.className = boostActive
                    ? 'shop-item owned'
                    : canAfford ? 'shop-item locked buyable' : 'shop-item locked broke';

                item.innerHTML = `
                    <img src="${cfg.shopAsset || cfg.asset}" alt="${WEAPON_NAMES[key]}" draggable="false">
                    <div class="shop-item-name">${WEAPON_NAMES[key]}</div>
                    ${boostActive
                        ? `<div class="shop-badge">✓ ACTIF</div>`
                        : `<div class="shop-item-price">🪙 ${cost}</div>
                        <button class="shop-buy-btn" ${!canAfford ? 'disabled' : ''}>ACHETER</button>`
                    }
                `;

                if (!boostActive) {
                    const btn = item.querySelector('.shop-buy-btn');
                    if (btn && canAfford) {
                        btn.addEventListener('click', async e => {
                            e.stopPropagation();
                            const ok = await active.buyWeapon(key);
                            if (ok) {
                                rebuildInv();
                                renderShop();
                            }
                        });
                        item.addEventListener('click', async e => {
                            if (e.target?.closest('.shop-buy-btn')) return;
                            e.stopPropagation();
                            const ok = await active.buyWeapon(key);
                            if (ok) {
                                rebuildInv();
                                renderShop();
                            }
                        });
                    }
                }

                grid.appendChild(item);
                return; // skip logique normale
            }

            // Logique normale pour toutes les autres armes
            const owned = active.ownedKeys.has(key);
            const canAfford = active.gold >= cost;
            const item = document.createElement('div');
            const cls = owned ? 'shop-item owned' : canAfford ? 'shop-item locked buyable' : 'shop-item locked broke';
            item.className = cls;
            item.innerHTML = `
                <img src="${cfg.shopAsset || cfg.asset}" alt="${WEAPON_NAMES[key]}" draggable="false">
                <div class="shop-item-name">${WEAPON_NAMES[key]}</div>
                ${owned
                    ? `<div class="shop-badge">✓ OK</div>`
                    : `<div class="shop-item-price">🪙 ${cost}</div>
                    <button class="shop-buy-btn" ${!canAfford ? 'disabled' : ''}>ACHETER</button>`
                }
            `;
            if (!owned) {
                const btn = item.querySelector('.shop-buy-btn');
                if (btn && canAfford) {
                    btn.addEventListener('click', async e => {
                        e.stopPropagation();
                        const ok = await active.buyWeapon(key);
                        if (ok) {
                            active._refreshWeaponSprite();
                            rebuildInv();
                            renderShop();
                        }
                    });
                    item.addEventListener('click', async e => {
                        if (e.target?.closest('.shop-buy-btn')) return;
                        e.stopPropagation();
                        const ok = await active.buyWeapon(key);
                        if (ok) {
                            active._refreshWeaponSprite();
                            rebuildInv();
                            renderShop();
                        }
                    });
                }
            }
            grid.appendChild(item);
        });

    }

    shopBtn.addEventListener('click', e => {
        e.stopPropagation();
        const opening = !shopPop.classList.contains('visible');
        closeAll();
        if (opening) { renderShop(); shopPop.classList.add('visible'); shopBtn.classList.add('active'); }
    });
    shopPop.addEventListener('click', e => e.stopPropagation());

    /* ══ 3b. PELLE (creuser) ═══════════════════════════ */
    const digBtn = document.createElement('div');
    digBtn.id = 'hud-dig-btn';
    digBtn.setAttribute('data-hud', '');
    digBtn.innerHTML = `<img src="assets/items/Shovel.png" alt="Creuser"><span class="hb-lbl">Clic droit</span>`;
    document.body.appendChild(digBtn);

    digBtn.addEventListener('click', e => {
        e.stopPropagation();
        // Déclenche l'action creuser via un mousedown bouton droit synthétique
        window.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true, cancelable: true }));
        // Flash visuel
        digBtn.classList.add('digging');
        setTimeout(() => digBtn.classList.remove('digging'), 200);
    });

    /* ══ 4. INVENTAIRE — dynamique ══════════════════════ */
    const inv = document.createElement('div'); inv.id = 'hud-inv'; inv.className = 'hp'; inv.setAttribute('data-hud', '');
    document.body.appendChild(inv);

    function rebuildInv() {
        const active = players.find(p => p.isActive) ?? players[0];
        if (!active) return;
        inv.innerHTML = active.weapons.map((w, i) => {
            const name = WEAPON_NAMES[w.config.type] || w.config.type;
            const isHeal = w.config.isHeal;
            const ammo = isHeal ? (active.ammo?.['HEAL'] ?? 0) : null;
            const empty = isHeal && ammo <= 0;
            const slotCls = `islot ${i === active.currentIndex ? 'active' : ''} ${empty ? 'islot-empty' : ''}`;
            const ammoTag = isHeal
                ? `<span class="islot-ammo" style="color:${ammo > 0 ? '#44ccff' : 'rgba(120,120,120,.5)'}">×${ammo}</span>`
                : '';
            return `
                <div class="${slotCls}" data-i="${i}">
                    <span class="ihk">${i + 1}</span>
                    <div class="iico"><img src="${w.config.shopAsset || w.config.asset}" alt="${name}" draggable="false" ${empty ? 'style="opacity:.3;filter:grayscale(1)"' : ''}></div>
                    <span class="inm">${name}</span>
                    ${ammoTag}
                </div>${i < active.weapons.length - 1 ? '<div class="idiv"></div>' : ''}
            `;
        }).join('');

        inv.querySelectorAll('.islot').forEach(s => {
            s.addEventListener('click', () => {
                const act = players.find(p => p.isActive);
                if (act) act.switchWeapon(parseInt(s.dataset.i));
            });
        });
    }

    let _lastActiveId = null;
    let _lastWeaponCount = 0;
    let _lastHealAmmo = -1;

    function syncInv() {
        const active = players.find(p => p.isActive) ?? players[0];
        if (!active) return;
        const healAmmo = active.ammo?.['HEAL'] ?? -1;
        if (active.id !== _lastActiveId || active.weapons.length !== _lastWeaponCount || healAmmo !== _lastHealAmmo) {
            _lastActiveId = active.id;
            _lastWeaponCount = active.weapons.length;
            _lastHealAmmo = healAmmo;
            rebuildInv();
            return;
        }
        // Rebuild if active player changed or weapon count changed (purchase)
        if (active.id !== _lastActiveId || active.weapons.length !== _lastWeaponCount) {
            _lastActiveId = active.id;
            _lastWeaponCount = active.weapons.length;
            rebuildInv();
            return;
        }
        inv.querySelectorAll('.islot').forEach((s, i) => s.classList.toggle('active', i === active.currentIndex));
    }

    /* ══ 5. HP BARS ══════════════════════════════════════ */
    const hpWrap = document.createElement('div'); hpWrap.id = 'hud-hp-wrap'; hpWrap.setAttribute('data-hud', '');
    hpWrap.innerHTML = players.map((p, i) => `
        <div class="hp hud-hp">
            <div class="hud-hp-name" style="color:${P_COLORS[i]}">${p.playerName || 'Joueur ' + (i + 1)}</div>
            <div class="hud-hp-bar-wrap"><div class="hud-hp-bar" id="hud-hp-bar-${i}" style="width:100%;background:${P_COLORS[i]};box-shadow:0 0 5px ${P_COLORS[i]}"></div></div>
            <div class="hud-hp-val" id="hud-hp-val-${i}">100 PV</div>
        </div>`).join('');
    document.body.appendChild(hpWrap);

    function syncHP() {
        players.forEach((p, i) => {
            const bar = document.getElementById(`hud-hp-bar-${i}`);
            const val = document.getElementById(`hud-hp-val-${i}`);
            if (bar) bar.style.width = Math.max(0, p.hp / p.maxHp * 100) + '%';
            if (val) val.textContent = `${Math.max(0, Math.ceil(p.hp))}/${Math.max(1, Math.ceil(p.maxHp))} PV`;
        });
    }

    /* ══ 6. TOUR BADGE ════════════════════════════════════ */
    const turnBadge = document.createElement('div'); turnBadge.id = 'hud-turn'; turnBadge.className = 'hp'; turnBadge.setAttribute('data-hud', '');
    document.body.appendChild(turnBadge);

    function syncTurn() {
        const active = players.find(p => p.isActive); if (!active) return;
        turnBadge.textContent = `TOUR : ${(active.playerName || 'Joueur ' + active.id).toUpperCase()}`;
        turnBadge.style.color = P_COLORS[active.id - 1];
        turnBadge.style.textShadow = `0 0 12px ${P_COLORS[active.id - 1]}`;
    }

    /* ══ 7. MINIMAP ══════════════════════════════════════ */
    const SCALE = 12, MM_W = Math.floor(GAME_CONFIG.WORLD_WIDTH / SCALE), MM_H = Math.floor(GAME_CONFIG.WORLD_HEIGHT / SCALE);
    const mmWrap = document.createElement('div'); mmWrap.id = 'hud-mm'; mmWrap.setAttribute('data-hud', '');
    mmWrap.innerHTML = `
        <div class="hp" style="overflow:hidden;">
            <div class="mm-head">
                <span class="mm-title">Carte</span>
                <div class="mm-leg">
                    <div class="mm-li"><svg viewBox="0 0 6 6" width="6" height="6" fill="#33ff88" style="image-rendering:pixelated"><rect width="6" height="6"/></svg>P1</div>
                    <div class="mm-li"><svg viewBox="0 0 6 6" width="6" height="6" fill="#44ccff" style="image-rendering:pixelated"><rect width="6" height="6"/></svg>P2</div>
                </div>
            </div>
            <div id="hud-mm-inner">
                <canvas id="hud-mm-canvas" width="${MM_W}" height="${MM_H}" style="width:${Math.round(MM_W * .75)}px;height:${Math.round(MM_H * .75)}px;"></canvas>
                <div id="hud-mm-frame"></div>
            </div>
        </div>`;
    document.body.appendChild(mmWrap);

    const mmCanvas = document.getElementById('hud-mm-canvas'), ctx = mmCanvas.getContext('2d');
    const sky = document.createElement('canvas'); sky.width = MM_W; sky.height = MM_H;
    const sctx = sky.getContext('2d'); sctx.fillStyle = '#050e08'; sctx.fillRect(0, 0, MM_W, MM_H);

    /* ── tick ── */
    function tick() {
        ctx.clearRect(0, 0, MM_W, MM_H); ctx.drawImage(sky, 0, 0);
        if (terrain?.blocks?.length > 0) {
            ctx.fillStyle = '#4a7a30';
            terrain.blocks.forEach(b => ctx.fillRect(Math.floor(b.body.position.x / SCALE), Math.floor(b.body.position.y / SCALE), 2, 2));
        }
        players.forEach((p, i) => {
            if (!p?.body) return;
            const x = Math.floor(p.body.position.x / SCALE), y = Math.floor(p.body.position.y / SCALE), col = P_COLORS[i] || '#fff';
            ctx.shadowColor = col; ctx.shadowBlur = p.isActive ? 8 : 3;
            ctx.fillStyle = col;
            ctx.fillRect(x - 2, y - 2, p.isActive ? 6 : 4, p.isActive ? 6 : 4);
            ctx.shadowBlur = 0;
        });
        syncInv(); syncTurn(); syncHP();
        // refresh gold in shop if open
        const gv = document.getElementById('shop-gold-val');
        if (gv) { const a = players.find(p => p.isActive) ?? players[0]; if (a) gv.textContent = a.gold + ' or'; }
    }

    document.addEventListener('click', () => closeAll());
    setTimeout(() => cmdBtn.classList.add('pulse'), 600);
    return { tick, renderShop };
}
