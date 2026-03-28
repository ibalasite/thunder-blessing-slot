-- Thunder Blessing Slot — Initial Schema (Phase 2A)
-- Version: 1.0.0 | Date: 2026-03-28
-- EDD Reference: §9-C PostgreSQL DB Schema

-- ═══════════════════════════════════════════════════════
-- Extensions
-- ═══════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- fuzzy search

-- ═══════════════════════════════════════════════════════
-- 1. 會員 (Users)
-- ═══════════════════════════════════════════════════════
CREATE TABLE users (
    id              BIGSERIAL       PRIMARY KEY,
    username        VARCHAR(50)     NOT NULL UNIQUE,
    email           VARCHAR(255)    NOT NULL UNIQUE,
    password_hash   VARCHAR(72)     NOT NULL,  -- bcrypt output ≤ 72 bytes
    role            VARCHAR(20)     NOT NULL DEFAULT 'player'
                        CHECK (role IN ('player','admin','auditor')),
    status          VARCHAR(20)     NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','suspended','deleted')),
    login_fail_count INT            NOT NULL DEFAULT 0,
    locked_until    TIMESTAMPTZ,               -- NULL = not locked
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════
-- 2. 登入 Session (Refresh Token Storage)
-- ═══════════════════════════════════════════════════════
CREATE TABLE user_sessions (
    id              BIGSERIAL       PRIMARY KEY,
    user_id         BIGINT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      CHAR(64)        NOT NULL UNIQUE,  -- SHA-256(refresh_token) hex
    user_agent      TEXT,
    ip_address      INET,
    expires_at      TIMESTAMPTZ     NOT NULL,
    revoked_at      TIMESTAMPTZ,                      -- NULL = valid
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_user_sessions_user_id   ON user_sessions(user_id, expires_at);
CREATE INDEX idx_user_sessions_token     ON user_sessions(token_hash) WHERE revoked_at IS NULL;

-- ═══════════════════════════════════════════════════════
-- 3. 錢包 (Wallets)
-- ═══════════════════════════════════════════════════════
CREATE TABLE wallets (
    id              BIGSERIAL       PRIMARY KEY,
    user_id         BIGINT          NOT NULL UNIQUE REFERENCES users(id),
    balance         NUMERIC(18,4)   NOT NULL DEFAULT 0 CHECK (balance >= 0),
    currency        CHAR(3)         NOT NULL DEFAULT 'USD'
                        CHECK (currency IN ('USD', 'TWD')),  -- S-11: currency whitelist
    version         BIGINT          NOT NULL DEFAULT 0,      -- optimistic lock version
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Wallet transaction stored procedure (atomic debit/credit)
CREATE OR REPLACE FUNCTION wallet_transact(
    p_wallet_id   BIGINT,
    p_amount      NUMERIC(18,4),
    p_type        VARCHAR(20),
    p_direction   VARCHAR(10),   -- 'credit' | 'debit'
    p_reference_id VARCHAR(64)
) RETURNS wallets AS $$
DECLARE
    v_wallet wallets;
    v_balance_before NUMERIC(18,4);
    v_balance_after  NUMERIC(18,4);
BEGIN
    SELECT * INTO v_wallet FROM wallets WHERE id = p_wallet_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'wallet_not_found';
    END IF;

    v_balance_before := v_wallet.balance;

    IF p_direction = 'credit' THEN
        v_balance_after := v_balance_before + p_amount;
    ELSIF p_direction = 'debit' THEN
        IF v_balance_before < p_amount THEN
            RAISE EXCEPTION 'insufficient_funds';
        END IF;
        v_balance_after := v_balance_before - p_amount;
    ELSE
        RAISE EXCEPTION 'invalid_direction: %', p_direction;
    END IF;

    UPDATE wallets
    SET balance = v_balance_after, version = version + 1, updated_at = NOW()
    WHERE id = p_wallet_id;

    INSERT INTO wallet_transactions
        (wallet_id, type, amount, balance_before, balance_after, reference_id)
    VALUES
        (p_wallet_id, p_type, p_amount, v_balance_before, v_balance_after, p_reference_id);

    SELECT * INTO v_wallet FROM wallets WHERE id = p_wallet_id;
    RETURN v_wallet;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════
-- 4. 錢包交易明細 (Immutable Ledger)
-- ═══════════════════════════════════════════════════════
CREATE TABLE wallet_transactions (
    id              BIGSERIAL       PRIMARY KEY,
    wallet_id       BIGINT          NOT NULL REFERENCES wallets(id),
    type            VARCHAR(20)     NOT NULL
                        CHECK (type IN ('deposit','withdraw','spin_debit','spin_credit','bet','win','bonus','adjustment')),
    amount          NUMERIC(18,4)   NOT NULL,           -- always positive
    balance_before  NUMERIC(18,4)   NOT NULL,
    balance_after   NUMERIC(18,4)   NOT NULL,
    reference_id    VARCHAR(64),                        -- spin_id / payment_id
    idempotency_key VARCHAR(64)     UNIQUE,             -- deposit/withdraw idempotency
    metadata        JSONB,                              -- extra context
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_wallet_tx_wallet_id  ON wallet_transactions(wallet_id, created_at DESC);
CREATE INDEX idx_wallet_tx_ref        ON wallet_transactions(reference_id);
-- Immutable ledger: no UPDATE or DELETE
CREATE RULE wallet_tx_no_update AS ON UPDATE TO wallet_transactions DO INSTEAD NOTHING;
CREATE RULE wallet_tx_no_delete AS ON DELETE TO wallet_transactions DO INSTEAD NOTHING;

-- ═══════════════════════════════════════════════════════
-- 5. Spin 審計日誌 (PARTITION BY YEAR, 2-year retention)
-- ═══════════════════════════════════════════════════════
CREATE TABLE spin_logs (
    id              BIGSERIAL,
    spin_id         UUID            NOT NULL DEFAULT gen_random_uuid(),

    -- Player info
    user_id         BIGINT          NOT NULL,   -- no FK (partition table limitation)
    session_id      BIGINT,

    -- Spin parameters
    mode            VARCHAR(20)     NOT NULL CHECK (mode IN ('main','extraBet','buyFG')),
    extra_bet_on    BOOLEAN         NOT NULL DEFAULT false,

    -- Currency & normalization (§9-M)
    currency        CHAR(3)         NOT NULL DEFAULT 'USD',
    bet_level       INTEGER         NOT NULL CHECK (bet_level > 0),
    win_level       INTEGER         NOT NULL DEFAULT 0,
    base_unit       NUMERIC(18,8)   NOT NULL,
    player_bet      NUMERIC(18,4)   NOT NULL,
    player_win      NUMERIC(18,4)   NOT NULL DEFAULT 0,

    -- RNG audit bytes (§9-N-1 CryptoRNGProvider)
    rng_bytes       BYTEA,
    rng_byte_count  SMALLINT        NOT NULL DEFAULT 0,
    server_seed     CHAR(64),       -- hex, for provably-fair verification
    client_seed     VARCHAR(64),    -- optional player-provided seed

    -- Result
    fg_triggered    BOOLEAN         NOT NULL DEFAULT false,

    -- Full spin result JSON (fast replay, no recompute)
    grid_snapshot   JSONB           NOT NULL DEFAULT '{}',

    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    PRIMARY KEY (id, created_at),
    UNIQUE (spin_id, created_at)
) PARTITION BY RANGE (created_at);

-- Year partitions
CREATE TABLE spin_logs_2026 PARTITION OF spin_logs
    FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
CREATE TABLE spin_logs_2027 PARTITION OF spin_logs
    FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');

-- Indexes (inherited by partitions)
CREATE INDEX idx_spin_logs_user_created  ON spin_logs(user_id, created_at DESC);
CREATE INDEX idx_spin_logs_spin_id       ON spin_logs(spin_id);
CREATE INDEX idx_spin_logs_currency_rtp  ON spin_logs(currency, created_at DESC);

-- Immutable: no UPDATE or DELETE
CREATE RULE spin_logs_no_update AS ON UPDATE TO spin_logs DO INSTEAD NOTHING;
CREATE RULE spin_logs_no_delete AS ON DELETE TO spin_logs DO INSTEAD NOTHING;

-- ═══════════════════════════════════════════════════════
-- 6. 密碼重置 Token
-- ═══════════════════════════════════════════════════════
CREATE TABLE password_reset_tokens (
    id              BIGSERIAL       PRIMARY KEY,
    user_id         BIGINT          NOT NULL REFERENCES users(id),
    token_hash      CHAR(64)        NOT NULL UNIQUE,    -- SHA-256(token)
    expires_at      TIMESTAMPTZ     NOT NULL,
    used_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════
-- 7. RTP 告警記錄
-- ═══════════════════════════════════════════════════════
CREATE TABLE rtp_alerts (
    id              BIGSERIAL       PRIMARY KEY,
    currency        CHAR(3)         NOT NULL,
    window_size     INTEGER         NOT NULL,           -- 1000 | 10000 | 100000
    measured_rtp    NUMERIC(8,6)    NOT NULL,
    target_rtp      NUMERIC(8,6)    NOT NULL DEFAULT 0.975,
    deviation       NUMERIC(8,6)    NOT NULL,
    threshold       NUMERIC(8,6)    NOT NULL DEFAULT 0.02,
    sample_from     TIMESTAMPTZ     NOT NULL,
    sample_to       TIMESTAMPTZ     NOT NULL,
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_rtp_alerts_unresolved ON rtp_alerts(created_at DESC) WHERE resolved_at IS NULL;

-- ═══════════════════════════════════════════════════════
-- 8. 錯誤日誌
-- ═══════════════════════════════════════════════════════
CREATE TABLE error_logs (
    id              BIGSERIAL       PRIMARY KEY,
    error_code      VARCHAR(50)     NOT NULL,
    http_status     SMALLINT,
    message         TEXT            NOT NULL,
    stack           TEXT,
    user_id         BIGINT,
    spin_id         UUID,
    request_path    VARCHAR(255),
    request_id      VARCHAR(64),
    metadata        JSONB,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_error_logs_code    ON error_logs(error_code, created_at DESC);
CREATE INDEX idx_error_logs_user    ON error_logs(user_id, created_at DESC);
CREATE INDEX idx_error_logs_recent  ON error_logs(created_at DESC);

-- ═══════════════════════════════════════════════════════
-- 9. 每日 RTP 統計報表
-- ═══════════════════════════════════════════════════════
CREATE TABLE rtp_daily_reports (
    id              BIGSERIAL       PRIMARY KEY,
    report_date     DATE            NOT NULL,
    currency        CHAR(3)         NOT NULL,
    mode            VARCHAR(20)     NOT NULL CHECK (mode IN ('main','extraBet','buyFG','all')),
    total_spins     BIGINT          NOT NULL DEFAULT 0,
    total_bet_level BIGINT          NOT NULL DEFAULT 0,
    total_win_level BIGINT          NOT NULL DEFAULT 0,
    rtp             NUMERIC(8,6)    NOT NULL,
    fg_trigger_rate NUMERIC(8,6),
    avg_bet_level   NUMERIC(10,2),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    UNIQUE (report_date, currency, mode)
);
CREATE INDEX idx_rtp_daily_date ON rtp_daily_reports(report_date DESC, currency);

-- ═══════════════════════════════════════════════════════
-- Helper: ensure_spin_log_partition (for worker)
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION ensure_spin_log_partition(p_year INTEGER)
RETURNS VOID AS $$
DECLARE
    partition_name TEXT;
    start_date     DATE;
    end_date       DATE;
BEGIN
    partition_name := 'spin_logs_' || p_year;
    start_date     := make_date(p_year, 1, 1);
    end_date       := make_date(p_year + 1, 1, 1);

    IF NOT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = partition_name
    ) THEN
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF spin_logs FOR VALUES FROM (%L) TO (%L)',
            partition_name, start_date, end_date
        );
    END IF;
END;
$$ LANGUAGE plpgsql;
