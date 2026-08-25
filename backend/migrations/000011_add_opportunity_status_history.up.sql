-- 000011_add_opportunity_status_history.up.sql
-- Order status history log tracking every status transition

CREATE TABLE IF NOT EXISTS opportunity_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    from_status VARCHAR(50),
    to_status VARCHAR(50) NOT NULL,
    changed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opp_status_history_opp ON opportunity_status_history(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opp_status_history_created ON opportunity_status_history(created_at);
