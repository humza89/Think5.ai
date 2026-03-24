-- Fix: handle_new_user trigger failing on email uniqueness conflicts or other
-- exceptions, which rolls back the entire auth.users INSERT and causes
-- "Database error creating new user" (AuthApiError 500).
--
-- Changes:
--   1. ON CONFLICT DO NOTHING (was ON CONFLICT (id) DO NOTHING) to catch
--      all unique constraint violations (id AND email).
--   2. EXCEPTION WHEN OTHERS block so the trigger never aborts the transaction.
--      The registration API route already has a fallback to create the profile
--      manually if the trigger didn't.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, first_name, last_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
        COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'candidate')
    )
    ON CONFLICT DO NOTHING;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user trigger failed for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
