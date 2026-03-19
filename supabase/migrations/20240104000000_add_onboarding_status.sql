-- ============================================
-- Add onboarding_status to profiles
-- ============================================
-- Enables proxy-level onboarding/approval gates without needing Prisma access.
-- Values mirror Prisma OnboardingStatus / RecruiterOnboardingStatus:
--   not_started, in_progress, pending_approval, approved, rejected, on_hold, completed

ALTER TABLE public.profiles
  ADD COLUMN onboarding_status TEXT NOT NULL DEFAULT 'not_started';

-- Index for filtering
CREATE INDEX idx_profiles_onboarding_status ON public.profiles(onboarding_status);
