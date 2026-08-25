-- Migration Down: Remove Subscriptions Schema for Scenario 2
-- Version: 000009

DROP TABLE IF EXISTS user_subscriptions CASCADE;
DROP TABLE IF EXISTS subscription_packages CASCADE;
