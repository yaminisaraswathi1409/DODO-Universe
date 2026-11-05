package auth

import (
	"sync"
	"time"
)

// RateLimiter is a fixed-window in-memory limiter keyed by an arbitrary string
// (for example "otp:+91…" or "otp-ip:1.2.3.4").
//
// Limitation: counters live in process memory, so with several API instances
// each enforces its own limit. The persistent per-phone limit in
// UserRepository.CountRecentOTPs complements it.
type RateLimiter struct {
	mu      sync.Mutex
	limit   int
	window  time.Duration
	now     func() time.Time
	buckets map[string]*bucket
}

type bucket struct {
	count     int
	windowEnd time.Time
}

func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	return &RateLimiter{
		limit:   limit,
		window:  window,
		now:     time.Now,
		buckets: make(map[string]*bucket),
	}
}

// SetClock overrides the clock (tests only).
func (l *RateLimiter) SetClock(now func() time.Time) { l.now = now }

// Allow records an attempt for key and reports whether it is within the limit.
// When denied, retryAfter is the time until the window resets.
func (l *RateLimiter) Allow(key string) (allowed bool, retryAfter time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	l.gc(now)

	b, ok := l.buckets[key]
	if !ok || !now.Before(b.windowEnd) {
		l.buckets[key] = &bucket{count: 1, windowEnd: now.Add(l.window)}
		return true, 0
	}
	if b.count >= l.limit {
		return false, b.windowEnd.Sub(now)
	}
	b.count++
	return true, 0
}

// gc drops expired buckets opportunistically to bound memory.
func (l *RateLimiter) gc(now time.Time) {
	if len(l.buckets) < 1024 {
		return
	}
	for k, b := range l.buckets {
		if !now.Before(b.windowEnd) {
			delete(l.buckets, k)
		}
	}
}

