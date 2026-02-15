// Mock database for testing without PostgreSQL
// Replace this with real Prisma once database is set up

interface Candidate {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  profileImage: string | null;
  currentTitle: string | null;
  currentCompany: string | null;
  skills: string[];
  experienceYears: number | null;
  industries: string[];
  resumeText: string | null;
  resumeUrl: string | null;
  status: string;
  recruiterId: string;
  aiSummary: string | null;
  embedding: number[] | null;
  createdAt: Date;
  updatedAt: Date;
}

interface Client {
  id: string;
  name: string;
  industry: string | null;
  funding: string | null;
  companySize: string | null;
  logoUrl: string | null;
  website: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface Role {
  id: string;
  clientId: string;
  title: string;
  location: string | null;
  salaryRange: string | null;
  skillsRequired: string[];
  description: string;
  experienceYears: string | null;
  embedding: number[] | null;
  createdAt: Date;
  updatedAt: Date;
}

interface Match {
  id: string;
  candidateId: string;
  roleId: string;
  fitScore: number;
  reasoning: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// In-memory storage
const mockDb = {
  candidates: [] as Candidate[],
  clients: [] as Client[],
  roles: [] as Role[],
  matches: [] as Match[],
  recruiters: [
    {
      id: "default-recruiter",
      name: "Default Recruiter",
      email: "default@example.com",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
};

function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export const mockPrisma = {
  candidate: {
    async findMany(args?: any) {
      let results = [...mockDb.candidates];

      if (args?.where?.status) {
        results = results.filter((c) => c.status === args.where.status);
      }

      if (args?.orderBy?.createdAt === "desc") {
        results.sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
        );
      }

      return results.map((c) => ({
        ...c,
        recruiter: mockDb.recruiters[0],
        matches: [],
      }));
    },

    async findUnique(args: any) {
      const candidate = mockDb.candidates.find((c) => c.id === args.where.id);
      if (!candidate) return null;

      return {
        ...candidate,
        recruiter: mockDb.recruiters[0],
        notes: [],
        matches: mockDb.matches
          .filter((m) => m.candidateId === candidate.id)
          .map((m) => {
            const role = mockDb.roles.find((r) => r.id === m.roleId);
            const client = role
              ? mockDb.clients.find((c) => c.id === role.clientId)
              : null;
            return {
              ...m,
              role: role
                ? {
                    ...role,
                    client,
                  }
                : null,
            };
          }),
      };
    },

    async create(args: any) {
      const candidate: Candidate = {
        id: generateId(),
        ...args.data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockDb.candidates.push(candidate);
      return candidate;
    },

    async update(args: any) {
      const index = mockDb.candidates.findIndex(
        (c) => c.id === args.where.id
      );
      if (index === -1) throw new Error("Candidate not found");

      mockDb.candidates[index] = {
        ...mockDb.candidates[index],
        ...args.data,
        updatedAt: new Date(),
      };
      return mockDb.candidates[index];
    },

    async delete(args: any) {
      const index = mockDb.candidates.findIndex(
        (c) => c.id === args.where.id
      );
      if (index === -1) throw new Error("Candidate not found");

      const deleted = mockDb.candidates[index];
      mockDb.candidates.splice(index, 1);
      return deleted;
    },
  },

  client: {
    async findMany(args?: any) {
      return mockDb.clients.map((c) => ({
        ...c,
        roles: mockDb.roles.filter((r) => r.clientId === c.id),
      }));
    },

    async create(args: any) {
      const client: Client = {
        id: generateId(),
        ...args.data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockDb.clients.push(client);
      return client;
    },
  },

  role: {
    async findMany(args?: any) {
      let results = [...mockDb.roles];

      if (args?.where?.clientId) {
        results = results.filter((r) => r.clientId === args.where.clientId);
      }

      return results.map((r) => ({
        ...r,
        client: mockDb.clients.find((c) => c.id === r.clientId),
        matches: mockDb.matches
          .filter((m) => m.roleId === r.id)
          .slice(0, 10)
          .map((m) => ({
            ...m,
            candidate: mockDb.candidates.find((c) => c.id === m.candidateId),
          })),
      }));
    },

    async findUnique(args: any) {
      return mockDb.roles.find((r) => r.id === args.where.id) || null;
    },

    async create(args: any) {
      const role: Role = {
        id: generateId(),
        ...args.data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockDb.roles.push(role);

      const client = mockDb.clients.find((c) => c.id === role.clientId);
      return {
        ...role,
        client,
      };
    },

    async update(args: any) {
      const index = mockDb.roles.findIndex((r) => r.id === args.where.id);
      if (index === -1) throw new Error("Role not found");

      mockDb.roles[index] = {
        ...mockDb.roles[index],
        ...args.data,
        updatedAt: new Date(),
      };
      return mockDb.roles[index];
    },
  },

  match: {
    async findMany(args?: any) {
      let results = [...mockDb.matches];

      if (args?.where?.candidateId) {
        results = results.filter(
          (m) => m.candidateId === args.where.candidateId
        );
      }

      if (args?.where?.roleId) {
        results = results.filter((m) => m.roleId === args.where.roleId);
      }

      if (args?.where?.fitScore?.gte) {
        results = results.filter((m) => m.fitScore >= args.where.fitScore.gte);
      }

      if (args?.orderBy?.fitScore === "desc") {
        results.sort((a, b) => b.fitScore - a.fitScore);
      }

      return results.map((m) => ({
        ...m,
        candidate: {
          ...mockDb.candidates.find((c) => c.id === m.candidateId),
          recruiter: mockDb.recruiters[0],
        },
        role: (() => {
          const role = mockDb.roles.find((r) => r.id === m.roleId);
          return role
            ? {
                ...role,
                client: mockDb.clients.find((c) => c.id === role.clientId),
              }
            : null;
        })(),
      }));
    },

    async upsert(args: any) {
      const existingIndex = mockDb.matches.findIndex(
        (m) =>
          m.candidateId === args.where.candidateId_roleId.candidateId &&
          m.roleId === args.where.candidateId_roleId.roleId
      );

      if (existingIndex >= 0) {
        mockDb.matches[existingIndex] = {
          ...mockDb.matches[existingIndex],
          ...args.update,
          updatedAt: new Date(),
        };
        return mockDb.matches[existingIndex];
      } else {
        const match: Match = {
          id: generateId(),
          ...args.create,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockDb.matches.push(match);
        return match;
      }
    },
  },

  recruiter: {
    async findUnique(args: any) {
      return mockDb.recruiters[0];
    },

    async create(args: any) {
      return mockDb.recruiters[0];
    },
  },
};

// Check if we should use mock database
// Only use mock if DATABASE_URL is not set or contains the placeholder
export const useMockDb = !process.env.DATABASE_URL ||
  process.env.DATABASE_URL === "postgresql://user:password@localhost:5432/dbname";
