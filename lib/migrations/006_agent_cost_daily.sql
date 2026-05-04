-- v2 §7 Phase 4 line 264: per-agent cost monitoring before v1 retirement.
-- Per-agent + per-provider daily rollup, populated nightly by
-- ~/.openclaw/v2/bin/producer-cost-rollup.py
--
-- shadow_cost_usd: for Pocketbook membership rows, what direct Anthropic
-- would have charged. Makes membership value visible + flags regressions.

CREATE TABLE IF NOT EXISTS agent_cost_daily (
    agent TEXT NOT NULL,
    day TEXT NOT NULL,
    provider TEXT NOT NULL,
    turns INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    total_cost_usd REAL NOT NULL DEFAULT 0,
    shadow_cost_usd REAL NOT NULL DEFAULT 0,
    rolled_up_at TEXT NOT NULL,
    PRIMARY KEY (agent, day, provider)
);

CREATE INDEX IF NOT EXISTS idx_agent_cost_day ON agent_cost_daily(day);
CREATE INDEX IF NOT EXISTS idx_agent_cost_agent ON agent_cost_daily(agent, day);
