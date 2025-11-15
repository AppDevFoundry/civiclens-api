# Performance Optimization Safety Guide

## 🛡️ Safety Mechanisms in Place

### 1. Conservative Default Configuration

**Current Defaults** (can be tuned via env vars):
- `PARALLEL_CONCURRENCY=3` - Maximum 3 concurrent requests
- `PARALLEL_DELAY_MS=150` - 150ms delay between starting each request
- `PARALLEL_MAX_RPS=10` - Hard limit of 10 requests/second

### 2. Actual vs. Theoretical Usage

**⚠️ IMPORTANT**: The configuration test shows *theoretical continuous* rates. **We don't sync continuously!**

**Actual Usage Pattern**:
```
Typical sync: 200 bills once per hour
= 200 API requests per hour
= 4% of the 5,000/hour limit ✅

Even with parallel execution:
- We fetch 200 bills total
- Takes ~3-5 minutes with parallelization
- Then we stop until next sync (usually 1 hour later)
- Result: 200 requests/hour (SAFE!)
```

**Theoretical "Continuous" Rate** (shown in test):
```
If we were syncing non-stop 24/7:
- Concurrency=3, Delay=150ms
- Could theoretically make 24,000 req/hour
- But we DON'T do this!
```

### 3. Built-in Safety Features

#### A. Rate Limit Monitoring
```typescript
// Tracks actual API usage in real-time
// Warns when approaching limits
// Auto-throttles if needed
```

#### B. Automatic Throttling
- Pauses sync if rate limit hit
- Waits 60 seconds before retry
- Logs all throttling events

#### C. Retry with Exponential Backoff
- Max 2 retries by default
- Increasing delays between retries
- Prevents hammering the API on failures

#### D. Request Tracking
- Counts requests per hour/minute
- Calculates average rate
- Provides warnings at 80% and 90% of limit

---

## 📊 Real-World Usage Scenarios

### Scenario 1: Hourly Sync (Typical)
```
Configuration: Default (concurrency=3, delay=150ms)
Action: Sync 200 bills once per hour
API Calls: 200 per hour
Limit Usage: 4% ✅ SAFE
```

### Scenario 2: Initial Sync (One-time)
```
Configuration: Aggressive (concurrency=5, delay=120ms)
Action: Sync 2,000 bills (one-time import)
API Calls: 2,000 in ~10 minutes
Limit Usage: 2,000 in first hour (40%), then 0 for rest of hour
Average: 2,000/hour = 40% ✅ SAFE
```

### Scenario 3: High-Frequency Sync (Edge case)
```
Configuration: Default
Action: Sync 200 bills every 15 minutes (4x per hour)
API Calls: 200 × 4 = 800 per hour
Limit Usage: 16% ✅ SAFE
```

### Scenario 4: Multiple Resource Sync
```
Configuration: Default
Action: Sync bills (200) + members (100) + hearings (50) per hour
API Calls: 350 per hour
Limit Usage: 7% ✅ SAFE
```

---

## 🎛️ How to Tune for Your Needs

### Starting Point (Recommended)
```bash
# Use conservative settings for first week
PARALLEL_CONCURRENCY=2 PARALLEL_DELAY_MS=200 npm run sync:bills
```
**Result**: ~5 req/sec burst, ~10,000 theoretical (but only 200 actual per sync)

### After Monitoring (Week 2+)
```bash
# If no issues, increase slightly
PARALLEL_CONCURRENCY=3 PARALLEL_DELAY_MS=150 npm run sync:bills
```
**Result**: Faster syncs, still well under limits

### For Development/Testing
```bash
# Faster for testing (use cautiously)
PARALLEL_CONCURRENCY=5 PARALLEL_DELAY_MS=120 npm run sync:bills
```
**Result**: Much faster, but watch for rate limits

### Emergency Slowdown
```bash
# If getting rate limited
PARALLEL_CONCURRENCY=1 PARALLEL_DELAY_MS=500 npm run sync:bills
```
**Result**: Very conservative, ~2 req/sec

---

## 📈 Monitoring Checklist

### Before Each Sync
- [ ] Check last sync completed successfully
- [ ] Verify no rate limit errors in logs
- [ ] Confirm API is responding

### During Sync
- [ ] Watch for rate limit warnings
- [ ] Monitor sync progress
- [ ] Check for errors

### After Sync
- [ ] Review sync duration
- [ ] Check records synced vs expected
- [ ] Look for any errors
- [ ] Verify no rate limit hits

### Weekly Review
- [ ] Calculate actual API usage (req/hour average)
- [ ] Review error logs
- [ ] Assess if concurrency can be increased
- [ ] Update configuration if needed

---

## 🚨 Warning Signs & Actions

### Warning: Approaching Rate Limit
**Signs**:
- Logs show "warningLevel: warning"
- X-RateLimit-Remaining < 1000

**Action**:
1. Don't panic - you have buffer
2. Complete current sync
3. Delay next sync by 15 minutes
4. Lower concurrency for next run

### Critical: Rate Limit Hit
**Signs**:
- HTTP 429 errors
- "Rate limit exceeded" messages
- Sync fails

**Action**:
1. STOP all syncs immediately
2. Wait 1 hour for limit reset
3. Use PARALLEL_CONCURRENCY=1 for next run
4. Investigate why limit was hit
5. Adjust schedule or configuration

### Error: High Failure Rate
**Signs**:
- Many retries
- > 5% of requests failing

**Action**:
1. Check Congress.gov API status
2. Reduce concurrency to 2
3. Increase delay to 200ms
4. Check network/database connections

---

## ✅ Safe Configurations by Use Case

### Production - Hourly Sync
```env
PARALLEL_CONCURRENCY=3
PARALLEL_DELAY_MS=150
PARALLEL_MAX_RPS=10
RATE_LIMIT_MONITORING=true
RATE_LIMIT_PAUSE=true
```
**Why**: Balanced speed and safety

### Production - Conservative
```env
PARALLEL_CONCURRENCY=2
PARALLEL_DELAY_MS=200
PARALLEL_MAX_RPS=5
RATE_LIMIT_MONITORING=true
RATE_LIMIT_PAUSE=true
```
**Why**: Maximum safety, slightly slower

### Development - Fast Testing
```env
PARALLEL_CONCURRENCY=5
PARALLEL_DELAY_MS=100
PARALLEL_MAX_RPS=15
RATE_LIMIT_MONITORING=true
RATE_LIMIT_PAUSE=true
```
**Why**: Fast feedback, acceptable risk in dev

### Emergency - Ultra Safe
```env
PARALLEL_CONCURRENCY=1
PARALLEL_DELAY_MS=500
PARALLEL_MAX_RPS=2
RATE_LIMIT_MONITORING=true
RATE_LIMIT_PAUSE=true
```
**Why**: After rate limit issues, rebuilding trust

---

## 🔍 Understanding the Numbers

### Congress.gov API Limit
- **5,000 requests per hour**
- This is a sliding window (not reset at top of hour)
- Unknown burst limits (we stay conservative)

### Our Usage
- **200-500 requests per sync**
- **1 sync per hour typically**
- **= 200-500 requests per hour**
- **= 4-10% of limit** ✅

### Safety Margin
- We use only 4-10% of limit
- **90-96% buffer** for:
  - Traffic spikes
  - Manual syncs
  - Development testing
  - Other API users on same IP (if shared)

---

## 💡 Best Practices

1. **Start Conservative**
   - Use concurrency=2-3 initially
   - Monitor for 1 week
   - Gradually increase if stable

2. **Monitor Actively**
   - Check logs after each sync
   - Review weekly API usage
   - Set up alerts for rate limit warnings

3. **Test in Development**
   - Use aggressive settings in dev/staging
   - Verify handling of rate limits
   - Test throttling logic

4. **Document Changes**
   - Log any configuration changes
   - Note reasons for changes
   - Track correlation with errors

5. **Have Fallback Plan**
   - Know how to quickly reduce concurrency
   - Have emergency config ready
   - Document rollback procedure

---

## 📞 Quick Reference

### Check Current Config
```bash
npm run test:config  # (we'll add this command)
```

### Safe Sync Commands
```bash
# Conservative
PARALLEL_CONCURRENCY=2 npm run sync:bills

# Default
npm run sync:bills

# After verifying stable
PARALLEL_CONCURRENCY=4 npm run sync:bills
```

### Emergency Commands
```bash
# Ultra-safe after rate limit hit
PARALLEL_CONCURRENCY=1 PARALLEL_DELAY_MS=500 npm run sync:bills

# Check rate limit status
curl -I https://api.congress.gov/v3/bill
```

---

## Summary

✅ **You're Safe**: Our actual usage (200 req/hour) is only 4% of the limit

✅ **Buffer Built-in**: 96% headroom for spikes/errors/testing

✅ **Monitoring Active**: Real-time tracking and warnings

✅ **Easy to Tune**: Simple environment variables

✅ **Multiple Safeguards**: Throttling, retry logic, pause on limit

**Bottom Line**: The current configuration is conservative and safe. You can confidently start with the defaults and gradually increase based on monitoring.

---

**Last Updated**: November 15, 2025
**Recommended Starting Config**: concurrency=3, delay=150ms
**Expected API Usage**: 4-10% of limit (very safe)
