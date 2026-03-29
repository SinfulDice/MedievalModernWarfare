import { Container } from 'pixi.js';
import { supabase } from '../services/supabaseClient.js';

export class LeaderboardScene {
    constructor(app, manager) {
        this.app = app;
        this.manager = manager;
        this.container = new Container();
        this.overlay = null;
        this.mode = 'players';
    }

    async init() {
        if (!document.getElementById('leaderboard-fonts')) {
            const l = document.createElement('link');
            l.id = 'leaderboard-fonts';
            l.rel = 'stylesheet';
            l.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';
            document.head.appendChild(l);
        }

        if (!document.getElementById('leaderboard-style')) {
            const style = document.createElement('style');
            style.id = 'leaderboard-style';
            style.textContent = `
                #leaderboard-screen {
                    position: fixed; inset: 0; z-index: 9000;
                    background: #080c10;
                    display: flex; align-items: center; justify-content: center;
                    font-family: 'Press Start 2P', monospace;
                    color: #c8e8d8;
                }
                #leaderboard-screen::before {
                    content: ''; position: absolute; inset: 0; pointer-events: none;
                    background: repeating-linear-gradient(0deg,rgba(0,0,0,.12) 0px,rgba(0,0,0,.12) 1px,transparent 1px,transparent 3px);
                }
                .lb-card {
                    width: min(1200px, 94vw);
                    max-height: 86vh;
                    background: rgba(5,14,10,.92);
                    border: 2px solid rgba(51,255,136,.35);
                    border-radius: 10px;
                    box-shadow: 0 0 0 1px rgba(0,0,0,.6), 0 0 20px rgba(51,255,136,.15);
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    z-index: 1;
                }
                .lb-head {
                    display: flex; align-items: center; justify-content: space-between;
                    gap: 12px;
                    padding: 16px 18px;
                    border-bottom: 1px solid rgba(51,255,136,.18);
                    background: rgba(0,12,6,.55);
                }
                .lb-title {
                    font-size: .62rem;
                    letter-spacing: .12em;
                    color: #33ff88;
                    text-shadow: 0 0 12px rgba(51,255,136,.45);
                }
                .lb-sub {
                    font-size: .34rem;
                    color: rgba(180,230,200,.6);
                    letter-spacing: .08em;
                }
                .lb-back {
                    padding: 10px 16px;
                    font-family: 'Press Start 2P', monospace;
                    font-size: .38rem;
                    letter-spacing: .08em;
                    border: 2px solid rgba(68,204,255,.35);
                    border-bottom: 3px solid rgba(68,204,255,.5);
                    border-radius: 7px;
                    color: #44ccff;
                    background: rgba(8,16,24,.8);
                    cursor: pointer;
                    text-transform: uppercase;
                    transition: transform .08s, box-shadow .12s, border-color .12s;
                }
                .lb-back:hover {
                    border-color: #44ccff;
                    box-shadow: 0 0 14px rgba(68,204,255,.25);
                    transform: translateY(-1px);
                }
                .lb-wrap {
                    overflow: auto;
                    padding: 12px;
                }
                .lb-tabs {
                    display: flex;
                    gap: 8px;
                    padding: 10px 12px;
                    border-bottom: 1px solid rgba(51,255,136,.14);
                    background: rgba(0,10,7,.45);
                }
                .lb-tab {
                    padding: 8px 12px;
                    font-family: 'Press Start 2P', monospace;
                    font-size: .32rem;
                    letter-spacing: .07em;
                    border: 2px solid rgba(51,255,136,.25);
                    border-bottom: 3px solid rgba(51,255,136,.4);
                    border-radius: 6px;
                    background: rgba(8,16,12,.75);
                    color: rgba(180,230,200,.6);
                    cursor: pointer;
                    text-transform: uppercase;
                }
                .lb-tab.active {
                    border-color: #33ff88;
                    color: #33ff88;
                    background: rgba(51,255,136,.12);
                    box-shadow: 0 0 12px rgba(51,255,136,.2);
                }
                .lb-table {
                    width: 100%;
                    border-collapse: collapse;
                    min-width: 980px;
                }
                .lb-table thead th {
                    position: sticky;
                    top: 0;
                    z-index: 2;
                    background: rgba(8,18,14,.96);
                    color: #33ff88;
                    font-size: .32rem;
                    letter-spacing: .08em;
                    text-align: left;
                    padding: 10px 8px;
                    border-bottom: 1px solid rgba(51,255,136,.25);
                }
                .lb-table tbody td {
                    font-size: .33rem;
                    color: #c8e8d8;
                    padding: 10px 8px;
                    border-bottom: 1px dashed rgba(51,255,136,.14);
                    white-space: nowrap;
                }
                .lb-table tbody tr:hover td {
                    background: rgba(51,255,136,.06);
                }
                .lb-rank {
                    color: #f5c16a;
                }
                .lb-time {
                    color: rgba(180,230,200,.72);
                }
                .lb-empty {
                    padding: 26px;
                    text-align: center;
                    font-size: .4rem;
                    color: rgba(180,230,200,.6);
                }
                .lb-error {
                    color: #ff866c;
                }
            `;
            document.head.appendChild(style);
        }

        const ov = document.createElement('div');
        ov.id = 'leaderboard-screen';

        const card = document.createElement('div');
        card.className = 'lb-card';
        card.innerHTML = `
            <div class="lb-head">
                <div>
                    <div class="lb-title">LEADERBOARD</div>
                    <div class="lb-sub" id="lb-sub">Stats totales de tous les joueurs</div>
                </div>
                <button class="lb-back">Retour menu</button>
            </div>
            <div class="lb-tabs">
                <button class="lb-tab active" id="lb-tab-players">Stats joueurs</button>
                <button class="lb-tab" id="lb-tab-recent">5 dernieres parties</button>
            </div>
            <div class="lb-wrap" id="lb-wrap"></div>
        `;

        const back = card.querySelector('.lb-back');
        back.addEventListener('click', () => this.manager.changeScene('menu'));

        const tabPlayers = card.querySelector('#lb-tab-players');
        const tabRecent = card.querySelector('#lb-tab-recent');
        tabPlayers.addEventListener('click', async () => {
            this.mode = 'players';
            tabPlayers.classList.add('active');
            tabRecent.classList.remove('active');
            await this._renderCurrentMode();
        });
        tabRecent.addEventListener('click', async () => {
            this.mode = 'recent';
            tabRecent.classList.add('active');
            tabPlayers.classList.remove('active');
            await this._renderCurrentMode();
        });

        ov.appendChild(card);
        document.body.appendChild(ov);
        this.overlay = ov;

        await this._renderCurrentMode();
    }

    async _renderCurrentMode() {
        if (this.mode === 'recent') return this._renderRecentMatches();
        return this._renderLeaderboard();
    }

    async _renderLeaderboard() {
        const wrap = document.getElementById('lb-wrap');
        const sub = document.getElementById('lb-sub');
        if (!wrap) return;
        if (sub) sub.textContent = 'Stats totales de tous les joueurs';

        if (!supabase) {
            wrap.innerHTML = '<div class="lb-empty lb-error">Supabase non configure.</div>';
            return;
        }

        const { data, error } = await supabase
            .from('v_player_career_stats')
            .select('*')
            .order('total_wins', { ascending: false })
            .order('accuracy_pct', { ascending: false })
            .order('pseudo', { ascending: true });

        if (error) {
            wrap.innerHTML = `<div class="lb-empty lb-error">Erreur chargement leaderboard: ${error.message}</div>`;
            return;
        }

        if (!data || data.length === 0) {
            wrap.innerHTML = '<div class="lb-empty">Aucune partie enregistree pour le moment.</div>';
            return;
        }

        const rows = data.map((r, i) => `
            <tr>
                <td class="lb-rank">#${i + 1}</td>
                <td>${r.pseudo}</td>
                <td>${r.total_wins}</td>
                <td>${r.total_losses}</td>
                <td>${r.total_money_spent}</td>
                <td>${r.total_money_earned}</td>
                <td>${r.total_bullets_fired}</td>
                <td>${r.total_bullets_hit}</td>
                <td>${r.accuracy_pct}%</td>
            </tr>
        `).join('');

        wrap.innerHTML = `
            <table class="lb-table">
                <thead>
                    <tr>
                        <th>Rang</th>
                        <th>Pseudo</th>
                        <th>Victoires</th>
                        <th>Defaites</th>
                        <th>Argent utilise</th>
                        <th>Argent gagne</th>
                        <th>Balles tirees</th>
                        <th>Balles touchees</th>
                        <th>Precision</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }

    async _renderRecentMatches() {
        const wrap = document.getElementById('lb-wrap');
        const sub = document.getElementById('lb-sub');
        if (!wrap) return;
        if (sub) sub.textContent = 'Les 5 parties les plus recentes';

        if (!supabase) {
            wrap.innerHTML = '<div class="lb-empty lb-error">Supabase non configure.</div>';
            return;
        }

        const { data, error } = await supabase
            .from('v_match_summary')
            .select('*')
            .order('finished_at', { ascending: false, nullsFirst: false })
            .order('started_at', { ascending: false })
            .limit(20);

        if (error) {
            wrap.innerHTML = `<div class="lb-empty lb-error">Erreur chargement des parties: ${error.message}</div>`;
            return;
        }

        if (!data || data.length === 0) {
            wrap.innerHTML = '<div class="lb-empty">Aucune partie enregistree pour le moment.</div>';
            return;
        }

        const uniqueMatches = [];
        const seen = new Set();
        for (const row of (data || [])) {
            if (seen.has(row.match_id)) continue;
            seen.add(row.match_id);
            uniqueMatches.push(row);
            if (uniqueMatches.length >= 5) break;
        }

        const fmt = (iso) => {
            if (!iso) return '-';
            const d = new Date(iso);
            if (Number.isNaN(d.getTime())) return '-';
            return d.toLocaleString('fr-FR');
        };

        const rows = uniqueMatches.map((m, i) => `
            <tr>
                <td class="lb-rank">#${i + 1}</td>
                <td>${m.player1 || '-'}</td>
                <td>${m.player1_wins ?? 0}</td>
                <td>${m.player2 || '-'}</td>
                <td>${m.player2_wins ?? 0}</td>
                <td>${m.winner || '-'}</td>
                <td>${m.status || '-'}</td>
                <td class="lb-time">${fmt(m.finished_at || m.started_at)}</td>
            </tr>
        `).join('');

        wrap.innerHTML = `
            <table class="lb-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Joueur 1</th>
                        <th>Score J1</th>
                        <th>Joueur 2</th>
                        <th>Score J2</th>
                        <th>Vainqueur</th>
                        <th>Statut</th>
                        <th>Date</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }

    update() {}

    destroy() {
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
    }
}
