-- ============================================
-- Add account_status to profiles
-- ============================================

-- Create enum type for account status
CREATE TYPE account_status AS ENUM ('active', 'suspended', 'deactivated');

-- Add account_status column with default 'active'
ALTER TABLE public.profiles
  ADD COLUMN account_status account_status NOT NULL DEFAULT 'active';

-- Create index for filtering by account status
CREATE INDEX idx_profiles_account_status ON public.profiles(account_status);
