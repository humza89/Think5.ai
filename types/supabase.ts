export type UserRole = 'admin' | 'candidate' | 'recruiter' | 'hiring_manager';

export type AccountStatus = 'active' | 'suspended' | 'deactivated';

export type OnboardingStatusValue = 'not_started' | 'in_progress' | 'pending_approval' | 'approved' | 'rejected' | 'on_hold' | 'completed';

export type Profile = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  avatar_url: string | null;
  email_verified: boolean;
  account_status: AccountStatus;
  onboarding_status: OnboardingStatusValue;
  created_at: string;
  updated_at: string;
};

export type VerificationToken = {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  created_at: string;
};

export type PasswordResetToken = {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
};

type GenericRelationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne?: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>;
        Relationships: GenericRelationship[];
      };
      verification_tokens: {
        Row: VerificationToken;
        Insert: Omit<VerificationToken, 'id' | 'created_at'>;
        Update: Partial<Omit<VerificationToken, 'id' | 'created_at'>>;
        Relationships: GenericRelationship[];
      };
      password_reset_tokens: {
        Row: PasswordResetToken;
        Insert: Omit<PasswordResetToken, 'id' | 'created_at' | 'used_at'>;
        Update: Partial<Omit<PasswordResetToken, 'id' | 'created_at'>>;
        Relationships: GenericRelationship[];
      };
    };
    Views: {};
    Functions: {};
  };
}
