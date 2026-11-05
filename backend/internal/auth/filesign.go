package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// FileSigner issues and verifies short-lived, tamper-proof download tokens for
// private files. A token binds (owner, filename, expiry) with HMAC-SHA256.
type FileSigner struct {
	secret []byte
	now    func() time.Time
}

// ErrInvalidFileToken covers malformed, tampered and expired tokens alike.
var ErrInvalidFileToken = errors.New("invalid or expired file link")

func NewFileSigner(secret string, now func() time.Time) (*FileSigner, error) {
	if len(secret) < MinSecretBytes {
		return nil, errors.New("file signing secret must be at least 32 bytes")
	}
	if now == nil {
		now = time.Now
	}
	return &FileSigner{secret: []byte(secret), now: now}, nil
}

// Sign returns a token valid for ttl.
func (s *FileSigner) Sign(owner, name string, ttl time.Duration) string {
	exp := s.now().Add(ttl).Unix()
	payload := fmt.Sprintf("%s|%s|%d", owner, name, exp)
	enc := base64.RawURLEncoding.EncodeToString([]byte(payload))
	return enc + "." + s.mac(enc)
}

// Verify checks the signature and expiry and returns the bound owner and name.
func (s *FileSigner) Verify(token string) (owner, name string, err error) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return "", "", ErrInvalidFileToken
	}
	if subtle.ConstantTimeCompare([]byte(parts[1]), []byte(s.mac(parts[0]))) != 1 {
		return "", "", ErrInvalidFileToken
	}
	raw, derr := base64.RawURLEncoding.DecodeString(parts[0])
	if derr != nil {
		return "", "", ErrInvalidFileToken
	}
	fields := strings.Split(string(raw), "|")
	if len(fields) != 3 {
		return "", "", ErrInvalidFileToken
	}
	exp, perr := strconv.ParseInt(fields[2], 10, 64)
	if perr != nil || s.now().Unix() > exp {
		return "", "", ErrInvalidFileToken
	}
	return fields[0], fields[1], nil
}

func (s *FileSigner) mac(data string) string {
	m := hmac.New(sha256.New, s.secret)
	m.Write([]byte("dodo-file-v1|"))
	m.Write([]byte(data))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}

