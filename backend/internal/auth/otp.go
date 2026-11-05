package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
)

// OTPLength is the number of digits in a one-time code.
const OTPLength = 6

// StoredOTPLength is the length of the verifier stored in the database. The
// existing columns (users.otp_code, user_otps.otp_code) are VARCHAR(10), so the
// keyed HMAC-SHA256 is truncated to 10 hex characters (40 bits). The verifier
// is bound to the phone number and a server-side secret, so a database leak
// does not allow offline recovery of the 6-digit code without that secret.
// Widening the columns to store the full digest is proposed in
// backend/docs/proposed_migrations.
const StoredOTPLength = 10

// GenerateOTP returns a uniformly distributed 6-digit code using crypto/rand.
// There is deliberately no fallback value: if the system CSPRNG fails the error
// is returned and no code is issued.
func GenerateOTP() (string, error) {
	max := big.NewInt(1_000_000)
	n, err := rand.Int(rand.Reader, max)
	if err != nil {
		return "", fmt.Errorf("generate otp: %w", err)
	}
	return fmt.Sprintf("%0*d", OTPLength, n.Int64()), nil
}

// OTPHasher derives and checks the stored OTP verifier.
type OTPHasher struct {
	secret []byte
}

// NewOTPHasher requires a strong secret.
func NewOTPHasher(secret string) (*OTPHasher, error) {
	if len(secret) < MinSecretBytes {
		return nil, errors.New("otp secret must be at least 32 bytes")
	}
	return &OTPHasher{secret: []byte(secret)}, nil
}

// Hash returns the verifier for (phone, code).
func (h *OTPHasher) Hash(phone, code string) string {
	mac := hmac.New(sha256.New, h.secret)
	mac.Write([]byte("dodo-otp-v1|"))
	mac.Write([]byte(phone))
	mac.Write([]byte("|"))
	mac.Write([]byte(code))
	return hex.EncodeToString(mac.Sum(nil))[:StoredOTPLength]
}

// Matches compares a stored verifier with a candidate code in constant time.
func (h *OTPHasher) Matches(stored, phone, candidateCode string) bool {
	if len(candidateCode) != OTPLength || len(stored) != StoredOTPLength {
		// Still perform one comparison to keep timing uniform for bad input.
		subtle.ConstantTimeCompare([]byte(stored), []byte(h.Hash(phone, "000000")))
		return false
	}
	want := h.Hash(phone, candidateCode)
	return subtle.ConstantTimeCompare([]byte(stored), []byte(want)) == 1
}

// ValidOTPFormat reports whether code is exactly OTPLength ASCII digits.
func ValidOTPFormat(code string) bool {
	if len(code) != OTPLength {
		return false
	}
	for i := 0; i < len(code); i++ {
		if code[i] < '0' || code[i] > '9' {
			return false
		}
	}
	return true
}

// MaxOTPAttempts is the number of wrong guesses allowed per issued code.
const MaxOTPAttempts = 5

