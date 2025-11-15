# Performance Optimization Implementation

## Overview

This document tracks the implementation of Phase 2 Item #4: Performance Optimizations

**Goal**: Reduce sync time by 50% and improve API response times

---

## Baseline Metrics

Based on profiling (`npm run profile-performance`):

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Sync 200 bills | ~20s | <10s | ⏳ |
| Sync 50 bills | 9.9s | <5s | ⏳ |
| API fetch per bill | 198ms | 50ms (parallel) | ⏳ |
| Sequential DB inserts | 50ms each | 17ms (batch) | ⏳ |
| API response time (p95) | TBD | <100ms | ⏳ |

**Key Finding**: 82% of sync time is API fetching (sequential)

---

## Optimization Strategy

### 1. Parallel API Requests ⚡ (Highest Impact)

**Problem**: Bills are fetched sequentially
- 50 bills × 198ms = 9,900ms
- 200 bills × 198ms = ~40s

**Solution**: Fetch multiple bills concurrently
- Concurrency: 5 simultaneous requests
- Rate limit: 5000 req/hour = ~1.4/sec
- With delay: 100ms between starts = 10/sec (safe buffer)
- Expected: 50 bills in ~2-3s (70-85% faster)

**Implementation**:
- Created `ParallelExecutor` utility
- Supports concurrency limits
- Built-in rate limiting
- Automatic retry
- Progress tracking

**Files**:
- `src/app/utils/parallel-executor.ts` (new)
- `src/app/services/sync/bill-sync.service.ts` (to update)

**Expected Improvement**: **70-80% reduction in sync time**

---

### 2. Batch Database Operations 📦 (High Impact)

**Problem**: Sequential database operations are slow
- 10 inserts × 50ms = 500ms
- 10 batch inserts × 17ms = 170ms (3x faster)

**Solution**: Use Prisma's `createMany` and `updateMany`

**Implementation**:
- Collect all bill data first
- Use `createMany` for new bills
- Use transaction for updates
- Batch change log entries

**Expected Improvement**: **50-70% reduction in DB operation time**

---

### 3. Query Optimization 🔍 (Medium Impact)

**Problem**: Some queries are slow
- Count query: 916ms
- Complex queries with relations: 429ms vs 87ms without

**Solution**:
- Add strategic indexes
- Use `select` to limit fields
- Avoid loading relations when not needed
- Use database-level counting

**Database Indexes to Add**:
```sql
-- Already have these indexes in schema.prisma:
@@index([congress, billType])
@@index([sponsorBioguideId])
@@index([updateDate])
@@index([introducedDate])
@@index([lastSyncedAt])
@@index([priority])

-- Additional indexes to consider:
@@index([congress, billType, billNumber]) -- composite for unique lookups
@@index([latestActionDate]) -- for sorting by recent activity
@@index([isLaw]) -- for filtering laws
```

**Expected Improvement**: **20-30% reduction in query time**

---

### 4. Connection Pooling 🏊 (Low Impact, but important)

**Problem**: Default Prisma connection pool may be small

**Solution**: Configure Prisma connection pool
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  // Add connection pooling via URL parameters:
  // ?connection_limit=10&pool_timeout=60
}
```

**Or in DATABASE_URL**:
```
postgresql://user:password@host:5432/db?connection_limit=20&pool_timeout=60
```

**Expected Improvement**: **10-20% improvement under load**

---

### 5. Response Caching (Future - not in this phase)

**Problem**: Same bills queried repeatedly

**Solution**: Redis caching
- Cache bills for 1 hour
- Invalidate on sync
- Cache popular queries

**Not implementing yet** - leaving for later phase

---

## Implementation Plan

### Phase 1: Parallel API Requests (CURRENT)

**Steps**:
1. ✅ Create `ParallelExecutor` utility
2. ⏳ Update `BillSyncService` to use parallel fetching
3. ⏳ Test with 50 bills
4. ⏳ Test with 200 bills
5. ⏳ Verify no rate limit issues

**Expected Time**: 2-3 hours

### Phase 2: Batch Operations

**Steps**:
1. Update bill creation to use `createMany`
2. Batch change log entries
3. Use transactions for complex updates
4. Test performance improvement

**Expected Time**: 1-2 hours

### Phase 3: Query Optimization

**Steps**:
1. Review slow queries
2. Add missing indexes
3. Optimize relation loading
4. Use select to limit fields

**Expected Time**: 1 hour

### Phase 4: Connection Pooling

**Steps**:
1. Configure Prisma pool settings
2. Update DATABASE_URL
3. Test under load

**Expected Time**: 30 minutes

---

## Testing Plan

### Performance Tests

1. **Baseline** (✅ Complete):
   - 50 bills: 9.9s
   - Sequential inserts: 50ms each
   - Batch inserts: 17ms each

2. **After Parallel API** (⏳ Pending):
   - 50 bills: Target <3s
   - 200 bills: Target <10s

3. **After Batch Operations** (⏳ Pending):
   - Large sync (500 bills): Target <15s
   - DB operations: Target 15-20ms per bill

4. **After Full Optimization** (⏳ Pending):
   - 200 bills: Target <8s
   - API response time: Target <100ms (p95)
   - Memory usage: Should stay under 200MB

### Load Tests

1. Multiple concurrent syncs
2. High-frequency API requests
3. Large dataset queries

---

## Monitoring

### Metrics to Track

**Sync Performance**:
- Duration per sync run
- Records per second
- API calls per second
- Errors per sync

**Database Performance**:
- Query execution time
- Connection pool usage
- Transaction duration
- Index usage

**API Performance**:
- Response time (p50, p95, p99)
- Throughput (req/sec)
- Error rate
- Cache hit rate (when implemented)

**System Resources**:
- CPU usage
- Memory usage
- Database connections
- API rate limit usage

---

## Rollout Strategy

### Stage 1: Development Testing
- Test with small datasets (50 bills)
- Verify correctness
- Measure performance gains

### Stage 2: Staging Testing
- Test with production-size datasets (200+ bills)
- Run for 24 hours
- Monitor for issues

### Stage 3: Production Gradual Rollout
- Enable parallel fetching (concurrency=2)
- Monitor for 48 hours
- Gradually increase concurrency (3, 4, 5)
- Monitor rate limits

### Stage 4: Full Deployment
- Enable all optimizations
- Update documentation
- Train team on new metrics

---

## Risks & Mitigation

### Risk 1: Rate Limiting
**Problem**: Too many parallel requests hit rate limit
**Mitigation**:
- Start with conservative concurrency (2-3)
- Monitor rate limit headers
- Implement backoff if hit
- Track API usage in real-time

### Risk 2: Database Overload
**Problem**: Parallel operations overwhelm database
**Mitigation**:
- Use connection pooling
- Implement query timeouts
- Monitor database metrics
- Add circuit breaker if needed

### Risk 3: Data Consistency
**Problem**: Parallel operations cause race conditions
**Mitigation**:
- Use database transactions
- Implement optimistic locking
- Add conflict resolution
- Test thoroughly

### Risk 4: Memory Usage
**Problem**: Loading many bills in memory
**Mitigation**:
- Process in chunks
- Stream results when possible
- Monitor memory usage
- Add garbage collection hints

---

## Success Criteria

✅ **Must Have**:
- 50% reduction in sync time (20s → 10s for 200 bills)
- No increase in error rate
- No rate limit violations
- Data consistency maintained

🎯 **Nice to Have**:
- 70% reduction in sync time (20s → 6s)
- Improved API response times
- Better resource utilization
- Comprehensive monitoring

---

## Future Optimizations (Phase 3+)

1. **Redis Caching**: Cache frequently accessed data
2. **CDN Integration**: Cache static responses
3. **Database Read Replicas**: Separate read/write load
4. **GraphQL DataLoader**: Batch and cache data loading
5. **Incremental Sync**: Only fetch changed bills
6. **Compression**: Compress API responses
7. **HTTP/2**: Use HTTP/2 for multiplexing

---

## Related Documentation

- `ROADMAP.md` - Full project roadmap
- `PHASE_2.md` - Phase 2 detailed plan
- `DEVELOPMENT.md` - Developer guide

---

**Created**: November 15, 2025
**Status**: In Progress
**Current Phase**: Parallel API Requests
**Next Milestone**: Test 50% improvement
