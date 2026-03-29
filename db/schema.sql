-- PostgreSQL/Supabase schema for storing multiplayer single-game results
-- One match = one game (no BO system).

BEGIN;

CREATE TABLE IF NOT EXISTS public.players (
    player_id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pseudo            VARCHAR(32) NOT NULL UNIQUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Case-sensitive pseudo uniqueness is preserved in PostgreSQL by default
-- ('Alice' and 'alice' are distinct values).

CREATE TABLE IF NOT EXISTS public.matches (
    match_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    format_label      VARCHAR(24) NOT NULL DEFAULT 'SINGLE',
    status            VARCHAR(16) NOT NULL DEFAULT 'IN_PROGRESS'
                     CHECK (status IN ('IN_PROGRESS', 'FINISHED', 'CANCELLED')),
    started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at       TIMESTAMPTZ,
    winner_player_id  BIGINT REFERENCES public.players(player_id)
);

CREATE INDEX IF NOT EXISTS idx_matches_status ON public.matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_winner ON public.matches(winner_player_id);

-- Exactly 2 rows per match should be enforced at application level.
CREATE TABLE IF NOT EXISTS public.match_players (
    match_id          BIGINT NOT NULL REFERENCES public.matches(match_id) ON DELETE CASCADE,
    player_id         BIGINT NOT NULL REFERENCES public.players(player_id),
    seat              SMALLINT NOT NULL CHECK (seat IN (1, 2)),
    PRIMARY KEY (match_id, player_id),
    UNIQUE (match_id, seat)
);

CREATE INDEX IF NOT EXISTS idx_match_players_player ON public.match_players(player_id);

CREATE TABLE IF NOT EXISTS public.match_player_stats (
    match_id          BIGINT NOT NULL REFERENCES public.matches(match_id) ON DELETE CASCADE,
    player_id         BIGINT NOT NULL REFERENCES public.players(player_id),
    result            VARCHAR(8) NOT NULL CHECK (result IN ('WIN', 'LOSS')),
    money_spent       INTEGER NOT NULL DEFAULT 0 CHECK (money_spent >= 0),
    money_earned      INTEGER NOT NULL DEFAULT 0 CHECK (money_earned >= 0),
    bullets_fired     INTEGER NOT NULL DEFAULT 0 CHECK (bullets_fired >= 0),
    bullets_hit       INTEGER NOT NULL DEFAULT 0 CHECK (bullets_hit >= 0 AND bullets_hit <= bullets_fired),
    PRIMARY KEY (match_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_match_player_stats_player ON public.match_player_stats(player_id);

DROP VIEW IF EXISTS public.v_player_career_stats;
CREATE VIEW public.v_player_career_stats AS
SELECT
    p.player_id,
    p.pseudo,
    COALESCE(SUM(CASE WHEN mps.result = 'WIN'  THEN 1 ELSE 0 END), 0) AS total_wins,
    COALESCE(SUM(CASE WHEN mps.result = 'LOSS' THEN 1 ELSE 0 END), 0) AS total_losses,
    COALESCE(SUM(mps.money_spent), 0)   AS total_money_spent,
    COALESCE(SUM(mps.money_earned), 0)  AS total_money_earned,
    COALESCE(SUM(mps.bullets_fired), 0) AS total_bullets_fired,
    COALESCE(SUM(mps.bullets_hit), 0)   AS total_bullets_hit,
    CASE
        WHEN COALESCE(SUM(mps.bullets_fired), 0) = 0 THEN 0
        ELSE ROUND((SUM(mps.bullets_hit)::NUMERIC / SUM(mps.bullets_fired)::NUMERIC) * 100, 2)
    END AS accuracy_pct
FROM public.players p
LEFT JOIN public.match_player_stats mps
    ON mps.player_id = p.player_id
GROUP BY p.player_id, p.pseudo;

DROP VIEW IF EXISTS public.v_match_summary;
CREATE VIEW public.v_match_summary AS
SELECT
    m.match_id,
    m.format_label,
    m.started_at,
    m.finished_at,
    m.status,
    p1.pseudo AS player1,
    CASE WHEN s1.result = 'WIN' THEN 1 ELSE 0 END AS player1_wins,
    CASE WHEN s1.result = 'LOSS' THEN 1 ELSE 0 END AS player1_losses,
    p2.pseudo AS player2,
    CASE WHEN s2.result = 'WIN' THEN 1 ELSE 0 END AS player2_wins,
    CASE WHEN s2.result = 'LOSS' THEN 1 ELSE 0 END AS player2_losses,
    pw.pseudo AS winner
FROM public.matches m
LEFT JOIN public.match_players mp1
    ON mp1.match_id = m.match_id AND mp1.seat = 1
LEFT JOIN public.match_players mp2
    ON mp2.match_id = m.match_id AND mp2.seat = 2
LEFT JOIN public.match_player_stats s1
    ON s1.match_id = m.match_id AND s1.player_id = mp1.player_id
LEFT JOIN public.match_player_stats s2
    ON s2.match_id = m.match_id AND s2.player_id = mp2.player_id
LEFT JOIN public.players p1
    ON p1.player_id = mp1.player_id
LEFT JOIN public.players p2
    ON p2.player_id = mp2.player_id
LEFT JOIN public.players pw
    ON pw.player_id = m.winner_player_id;

COMMIT;
