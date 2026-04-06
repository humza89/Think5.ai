# Disaster Recovery Plan — Paraform

## Recovery Objectives

| Metric | Target | Current Architecture |
|--------|--------|---------------------|
| **RTO** (Recovery Time Objective) | 1 hour | Vercel auto-redeploy + Supabase managed failover |
| **RPO** (Recovery Point Objective) | 5 minutes | Supabase WAL replication + point-in-time recovery |

## Backup Strategy

### Database (Supabase PostgreSQL)
- **Daily automated backups**: Supabase Pro plan includes daily backups with 7-day retention
- **Point-in-time recovery (PITR)**: Available on Pro+ plans, allows recovery to any point within retention window
- **WAL archiving**: Continuous write-ahead log shipping for minimal data loss

### Redis (Upstash)
- **No persistent backup needed**: Redis is used as a cache/session store with fallback
- **Session reconstruction**: If Redis is lost, sessions rebuild from Postgres canonical ledger (`lib/session-store.ts`)
- **Rate limit state**: Resets naturally (no data loss impact)

### File Storage (Supabase Storage / Cloudflare R2)
- **Interview recordings**: Stored in Supabase Storage `secure-recordings` bucket
- **Supabase Storage**: Backed by S3-compatible infrastructure with built-in redundancy
- **Signed URLs**: 48-hour expiry, refreshable on demand

## Failure Scenarios

### 1. Vercel Platform Outage
- **Impact**: All API and frontend unavailable
- **Detection**: Sentry alerting + external health check monitoring
- **Recovery**: Automatic — Vercel has multi-region failover
- **Manual action**: If prolonged (>30min), deploy to backup platform (Render/Railway)

### 2. Supabase Database Outage
- **Impact**: All data operations fail; interviews cannot start
- **Detection**: Database connection errors in Sentry
- **Recovery**: Supabase manages failover to standby replica
- **Manual action**: If PITR needed, use Supabase dashboard to restore

### 3. Redis (Upstash) Outage
- **Impact**: Rate limiting falls back to in-memory; sessions fall back to Postgres reconstruction
- **Detection**: Redis connection errors logged (non-fatal)
- **Recovery**: Automatic — in-memory fallback activates immediately
- **Note**: Session locks may be briefly inconsistent; duplicate session prevention degrades

### 4. Gemini API Outage
- **Impact**: Voice interviews unavailable; scoring delays
- **Detection**: Model health check in `lib/model-router.ts`
- **Recovery**: Automatic fallback to Claude API for scoring; voice falls back to text-SSE mode
- **Manual action**: Monitor model health dashboard; communicate to users if voice is degraded

### 5. Sentry Outage
- **Impact**: No error tracking or session replays
- **Detection**: Check Sentry status page
- **Recovery**: Errors still logged to console; alerts resume when Sentry recovers

## Runbooks

### Redis Failure Recovery
1. Verify fallback to in-memory is active (check logs for "falling back to in-memory")
2. Monitor for duplicate sessions (check for DEDUP_AUTHORITY_BREACH in interview events)
3. When Redis recovers, sessions will automatically use Redis again (lazy initialization)
4. No manual intervention needed unless anomalies detected

### Gemini Outage Recovery
1. Check model health: `GET /api/admin/reliability` → modelHealth section
2. If Gemini down, scoring falls back to Claude automatically
3. Voice interviews fall back to text-SSE mode
4. Monitor AI usage costs (Claude pricing differs from Gemini)
5. When Gemini recovers, traffic routes back automatically

### Database Restore
1. Go to Supabase Dashboard → Database → Backups
2. Select restore point (PITR or daily backup)
3. Restore creates a new database instance
4. Update `DATABASE_URL` in Vercel environment
5. Redeploy application
6. Verify data integrity: `npx prisma validate`

## Contact Points
- **Infrastructure**: Vercel support, Supabase support, Upstash support
- **AI providers**: Google AI support, Anthropic support
- **Monitoring**: Sentry status page
