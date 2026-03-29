import { supabase } from './supabaseClient.js';

async function upsertPlayerByPseudo(pseudo) {
    const cleanPseudo = (pseudo || '').trim();
    if (!cleanPseudo) throw new Error('Pseudo manquant');

    const { data, error } = await supabase
        .from('players')
        .upsert({ pseudo: cleanPseudo }, { onConflict: 'pseudo' })
        .select('player_id, pseudo')
        .single();

    if (error) throw error;
    return data;
}

export async function saveSingleMatchResult(players, winnerPlayerId) {
    if (!supabase) {
        console.warn('Supabase non configure: enregistrement ignore.');
        return false;
    }

    const [p1, p2] = players;
    if (!p1 || !p2) return false;

    try {
        const dbP1 = await upsertPlayerByPseudo(p1.playerName);
        const dbP2 = await upsertPlayerByPseudo(p2.playerName);

        const winnerDbId = winnerPlayerId === p1.id ? dbP1.player_id : dbP2.player_id;

        const { data: matchRow, error: matchErr } = await supabase
            .from('matches')
            .insert({
                format_label: 'SINGLE',
                status: 'FINISHED',
                winner_player_id: winnerDbId,
                finished_at: new Date().toISOString(),
            })
            .select('match_id')
            .single();

        if (matchErr) throw matchErr;

        const matchId = matchRow.match_id;

        const { error: mpErr } = await supabase
            .from('match_players')
            .insert([
                { match_id: matchId, player_id: dbP1.player_id, seat: 1 },
                { match_id: matchId, player_id: dbP2.player_id, seat: 2 },
            ]);

        if (mpErr) throw mpErr;

        const p1Win = winnerPlayerId === p1.id;

        const { error: statsErr } = await supabase
            .from('match_player_stats')
            .insert([
                {
                    match_id: matchId,
                    player_id: dbP1.player_id,
                    result: p1Win ? 'WIN' : 'LOSS',
                    money_spent: Math.max(0, p1.matchStats?.moneySpent ?? 0),
                    money_earned: Math.max(0, p1.matchStats?.moneyEarned ?? 0),
                    bullets_fired: Math.max(0, p1.matchStats?.bulletsFired ?? 0),
                    bullets_hit: Math.max(0, p1.matchStats?.bulletsHit ?? 0),
                },
                {
                    match_id: matchId,
                    player_id: dbP2.player_id,
                    result: p1Win ? 'LOSS' : 'WIN',
                    money_spent: Math.max(0, p2.matchStats?.moneySpent ?? 0),
                    money_earned: Math.max(0, p2.matchStats?.moneyEarned ?? 0),
                    bullets_fired: Math.max(0, p2.matchStats?.bulletsFired ?? 0),
                    bullets_hit: Math.max(0, p2.matchStats?.bulletsHit ?? 0),
                },
            ]);

        if (statsErr) throw statsErr;

        return true;
    } catch (err) {
        console.error('Erreur enregistrement match Supabase:', err);
        return false;
    }
}
