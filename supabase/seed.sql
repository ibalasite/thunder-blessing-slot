-- Thunder Blessing Slot — Seed Data (dev/test only)
-- Creates a test user + wallet for local development

-- Test player (password: test1234!)
INSERT INTO users (username, email, password_hash, role)
VALUES (
    'testplayer',
    'test@thunder.local',
    '$2b$12$examplehashforlocaldevelopmentonly',  -- bcrypt('test1234!', 12) placeholder
    'player'
)
ON CONFLICT (email) DO NOTHING;

-- Test player wallet (USD, $100 starting balance)
INSERT INTO wallets (user_id, balance, currency)
SELECT id, 100.0000, 'USD' FROM users WHERE email = 'test@thunder.local'
ON CONFLICT (user_id) DO NOTHING;

-- Test admin
INSERT INTO users (username, email, password_hash, role)
VALUES (
    'admin',
    'admin@thunder.local',
    '$2b$12$examplehashforlocaldevelopmentonly',
    'admin'
)
ON CONFLICT (email) DO NOTHING;
