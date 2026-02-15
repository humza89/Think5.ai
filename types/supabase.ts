export type UserRole = 'admin' | 'candidate' | 'recruiter' | 'hiring_manager';

export type Profile = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  avatar_url: string | null;
  email_verified: boolean;
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
    };
    Views: {};
    Functions: {};
  };
}
