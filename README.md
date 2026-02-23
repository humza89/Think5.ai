# Think5 - AI-Powered Recruitment Dashboard

A full-stack recruitment agency platform that automatically matches candidates with job roles using AI-powered embeddings and semantic similarity.

## Features

### Core Functionality
- **Candidate Management**: Upload resumes (PDF/DOCX) or LinkedIn profiles
- **AI Resume Parsing**: Automatic extraction of skills, experience, and contact info
- **Client & Role Management**: Track companies and their open positions
- **Smart Matching Engine**: AI-powered candidate-to-role matching with fit scores
- **Dashboard Analytics**: Overview of candidates, clients, roles, and top matches
- **Status Tracking**: Pipeline management (Sourced, Contacted, Interviewed, etc.)

### Technical Features
- Next.js 15 with App Router and Server Components
- TypeScript for type safety
- PostgreSQL database with Prisma ORM
- OpenAI API for embeddings and parsing
- Tailwind CSS + ShadCN UI components
- RESTful API architecture

## Tech Stack

### Frontend
- **Framework**: Next.js 15
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: ShadCN UI (Radix UI primitives)
- **Icons**: Lucide React

### Backend
- **Runtime**: Node.js
- **Database**: PostgreSQL
- **ORM**: Prisma
- **AI/ML**: OpenAI API (text-embedding-3-large, GPT-4)
- **File Parsing**: pdf-parse, mammoth

### AI Features
- **Resume Parsing**: OpenAI GPT-4 for structured data extraction
- **Embeddings**: text-embedding-3-large for semantic search
- **Matching**: Cosine similarity algorithm
- **Summaries**: AI-generated candidate and match summaries

## Project Structure

```
think5/
├── app/
│   ├── api/
│   │   ├── candidates/     # Candidate CRUD endpoints
│   │   ├── clients/        # Client CRUD endpoints
│   │   ├── roles/          # Role CRUD endpoints
│   │   ├── matches/        # Matching engine endpoints
│   │   └── upload/         # File upload & parsing
│   ├── dashboard/          # Dashboard page
│   ├── candidates/         # Candidates management page
│   ├── clients/            # Clients & roles page
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   └── ui/                 # ShadCN UI components
├── lib/
│   ├── prisma.ts          # Database client
│   ├── openai.ts          # OpenAI utilities
│   ├── resume-parser.ts   # Resume parsing logic
│   ├── linkedin-scraper.ts # LinkedIn integration
│   ├── matching-engine.ts  # AI matching algorithm
│   └── utils.ts           # Utility functions
├── prisma/
│   └── schema.prisma      # Database schema
└── public/                # Static assets
```

## Database Schema

### Tables
- **Candidate**: Stores candidate profiles, skills, experience, embeddings
- **Client**: Company information
- **Role**: Job openings with requirements
- **Match**: Candidate-role matches with fit scores
- **Recruiter**: Recruitment staff
- **Note**: Private notes on candidates

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL database
- OpenAI API key

### Installation

1. **Clone and install dependencies**:
```bash
cd Think5
npm install
```

2. **Set up environment variables**:
```bash
cp .env.example .env
```

Edit `.env` and add:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/think5"
OPENAI_API_KEY="your-openai-api-key"
JWT_SECRET="your-secret-key"
```

3. **Set up the database**:
```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev --name init

# Optional: Open Prisma Studio to view data
npx prisma studio
```

4. **Run the development server**:
```bash
npm run dev
```

5. **Open your browser**:
Navigate to [http://localhost:3000](http://localhost:3000)

## Usage Guide

### Adding Candidates

1. Go to **Candidates** page
2. Click **Add Candidate**
3. Either:
   - Upload a resume (PDF or DOCX)
   - Paste a LinkedIn URL
4. The system will automatically:
   - Parse the resume/LinkedIn profile
   - Extract skills, experience, contact info
   - Generate an AI summary
   - Create embeddings for matching

### Adding Clients & Roles

1. Go to **Clients** page
2. Click **Add Client** to create a company
3. Fill in company details (name, industry, funding, size)
4. Click **Add Role** on a client card
5. Enter job details:
   - Title, location, salary range
   - Required skills (comma-separated)
   - Job description
6. The system will automatically:
   - Generate embeddings for the role
   - Find and rank matching candidates

### Viewing Matches

- **Dashboard**: See top matches across all roles
- **Client Page**: View best candidates for each role
- **Candidate Page**: See role recommendations for each candidate

Matches are scored 0-100% based on:
- Skill overlap
- Experience level alignment
- Industry match
- Semantic similarity of embeddings

## API Endpoints

### Candidates
- `GET /api/candidates` - List all candidates
- `POST /api/candidates` - Create candidate
- `GET /api/candidates/[id]` - Get candidate details
- `PATCH /api/candidates/[id]` - Update candidate
- `DELETE /api/candidates/[id]` - Delete candidate

### Clients
- `GET /api/clients` - List all clients
- `POST /api/clients` - Create client

### Roles
- `GET /api/roles` - List all roles
- `POST /api/roles` - Create role (auto-generates matches)

### Matches
- `GET /api/matches` - List matches (filterable)
- `POST /api/matches` - Generate matches for candidate or role

### Upload
- `POST /api/upload` - Upload and parse resume/LinkedIn

## AI Matching Algorithm

### How It Works

1. **Embedding Generation**: Convert candidate profiles and job descriptions into vector embeddings using OpenAI's text-embedding-3-large model

2. **Cosine Similarity**: Calculate similarity between candidate and role vectors:
   ```
   similarity = (A · B) / (||A|| × ||B||)
   ```

3. **Fit Score**: Convert similarity to 0-100 scale:
   ```
   fitScore = (similarity + 1) × 50
   ```

4. **Reasoning**: Use GPT-4 to generate human-readable match explanations

### Matching Factors
- **Skills**: Technical abilities and tools
- **Experience**: Years of experience and seniority
- **Industry**: Domain expertise alignment
- **Semantic Content**: Overall profile-to-job description similarity

## Configuration

### OpenAI API
The system uses:
- **text-embedding-3-large**: High-quality embeddings (3072 dimensions)
- **gpt-4o-mini**: Resume parsing and summary generation

### File Upload
- Supported formats: PDF, DOCX
- Max file size: 10MB (configurable in `.env`)
- Files stored in `/uploads` directory

### LinkedIn Integration
The current implementation uses mock data. For production:
1. Use LinkedIn API (requires OAuth)
2. Use third-party services (Proxycurl, ScrapingBee)
3. Implement browser automation (Puppeteer/Playwright)

## Deployment

### Build for Production
```bash
npm run build
npm start
```

### Environment Variables (Production)
- Set `DATABASE_URL` to production PostgreSQL
- Add `OPENAI_API_KEY`
- Set secure `JWT_SECRET`
- Configure file storage (S3, etc.)

### Recommended Platforms
- **Vercel**: Easiest deployment for Next.js
- **Railway**: Includes PostgreSQL hosting
- **AWS/GCP**: Full control with EC2/Compute Engine

## Future Enhancements

### Planned Features
- [ ] Real LinkedIn integration
- [ ] Email automation (outreach, follow-ups)
- [ ] Calendar integration for interviews
- [ ] Advanced filtering and search
- [ ] Bulk candidate import
- [ ] Custom matching weights
- [ ] Client portal access
- [ ] Analytics dashboard
- [ ] Multi-tenant support
- [ ] Role templates

### Technical Improvements
- [ ] Add authentication (NextAuth.js)
- [ ] Implement file storage (S3/Cloudinary)
- [ ] Add rate limiting
- [ ] Implement caching (Redis)
- [ ] Add testing (Jest, Playwright)
- [ ] Real-time updates (WebSockets)
- [ ] Background job processing (Bull/BullMQ)

## Security Considerations

- Store files encrypted (use S3 with encryption)
- Add JWT authentication for API routes
- Implement role-based access control
- Rate limit API endpoints
- Validate all user inputs
- Use environment variables for secrets
- LinkedIn scraping: Only use public data

## Troubleshooting

### Common Issues

**Database connection error**:
- Verify PostgreSQL is running
- Check `DATABASE_URL` in `.env`
- Run `npx prisma migrate dev`

**OpenAI API errors**:
- Verify `OPENAI_API_KEY` is set correctly
- Check API quota and billing
- Handle rate limits gracefully

**File upload fails**:
- Check file size limit
- Verify `/uploads` directory exists and is writable
- Ensure supported file format (PDF/DOCX)

**No matches generated**:
- Ensure OpenAI API key is configured
- Check that embeddings were generated (Prisma Studio)
- Verify cosine similarity threshold (currently >50%)

## Contributing

This is a demonstration project. To extend:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - feel free to use this project as a starting point for your own recruitment platform.

## Support

For issues or questions:
- Check the troubleshooting section
- Review the code comments
- Open an issue with detailed information

## Acknowledgments

- Built with Next.js, React, and TypeScript
- UI components from ShadCN UI
- AI powered by OpenAI
- Icons from Lucide React
- Inspired by Think5's recruitment platform

---

**Note**: This is a full-featured recruitment platform starter. Remember to:
- Add proper authentication before production use
- Configure secure file storage
- Set up proper LinkedIn scraping (or use mock data)
- Add monitoring and logging
- Implement proper error handling
- Scale database and API as needed
