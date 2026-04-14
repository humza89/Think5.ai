-- Track 5 Task 20: Candidate device fingerprint
--
-- Adds a nullable SHA-256 hex column to Interview for binding an
-- access token to the first device that successfully validates. A
-- subsequent validate with a different device fingerprint is rejected
-- as a leaked-token replay attempt.
--
-- The field is lazily populated — null until first validate. Existing
-- interviews are unaffected (null allowed). Safe to roll forward.
--
-- Rollback:
--   ALTER TABLE "Interview" DROP COLUMN "candidateDeviceFingerprint";

ALTER TABLE "Interview"
  ADD COLUMN "candidateDeviceFingerprint" TEXT;
