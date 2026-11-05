package config

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
	"github.com/uop/backend/internal/runtimeenv"
)

// MinSecretLength is the minimum accepted length (bytes) of any signing secret.
const MinSecretLength = 32

type Config struct {
	Port        string
	Env         string
	DatabaseURL string

	// SupabaseJWTSecret enables validation of Supabase-issued access tokens.
	// Empty disables that token source entirely (there is no default value).
	SupabaseJWTSecret string

	CORSAllowedOrigins string

	// Own access/refresh token settings (see internal/auth).
	AuthJWTSecret   string
	AuthIssuer      string
	AuthAudience    string
	AccessTokenTTL  time.Duration
	RefreshTokenTTL time.Duration

	// OTPHMACSecret keys the OTP verifier hash stored in the database.
	OTPHMACSecret string
	OTPTTL        time.Duration

	// SMS gateway (provider: twilio | console | none).
	SMSProvider        string
	TwilioAccountSID   string
	TwilioAuthToken    string
	TwilioFromNumber   string
	TwilioMessagingSID string

	// PrivateUploadDir stores KYC/identity documents outside any static route.
	PrivateUploadDir string
	// FileSigningSecret signs short-lived private download URLs.
	FileSigningSecret string
}

// LoadConfig reads configuration from the environment (.env is optional).
// It never invents a signing secret in production. In an explicit development
// environment, missing secrets are replaced with random per-process values
// (sessions then do not survive a restart).
func LoadConfig() *Config {
	// Search in current directory, backend directory, and parent directories
	if err := godotenv.Load(".env", "backend/.env", "../.env", "../../backend/.env"); err != nil {
		log.Println("Notice: No .env file found or loaded, using environment variables")
	}

		defaultSMS := "none"
		if runtimeenv.IsDevelopment() {
			defaultSMS = "console"
		}

		cfg := &Config{
			Port:               getEnv("PORT", "8080"),
			Env:                getEnv("ENV", "production"),
			DatabaseURL:        getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/postgres?sslmode=disable"),
			SupabaseJWTSecret:  os.Getenv("SUPABASE_JWT_SECRET"),
			CORSAllowedOrigins: getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:3000"),

			AuthJWTSecret:   os.Getenv("AUTH_JWT_SECRET"),
			AuthIssuer:      getEnv("AUTH_JWT_ISSUER", "dodo-universe-api"),
			AuthAudience:    getEnv("AUTH_JWT_AUDIENCE", "dodo-universe-clients"),
			AccessTokenTTL:  getDuration("AUTH_ACCESS_TOKEN_TTL", 30*time.Minute),
			RefreshTokenTTL: getDuration("AUTH_REFRESH_TOKEN_TTL", 30*24*time.Hour),

			OTPHMACSecret: os.Getenv("OTP_HMAC_SECRET"),
			OTPTTL:        getDuration("OTP_TTL", 5*time.Minute),

			SMSProvider:        strings.ToLower(getEnv("SMS_PROVIDER", defaultSMS)),
		TwilioAccountSID:   os.Getenv("TWILIO_ACCOUNT_SID"),
		TwilioAuthToken:    os.Getenv("TWILIO_AUTH_TOKEN"),
		TwilioFromNumber:   os.Getenv("TWILIO_FROM_NUMBER"),
		TwilioMessagingSID: os.Getenv("TWILIO_MESSAGING_SERVICE_SID"),

		PrivateUploadDir:  getEnv("PRIVATE_UPLOAD_DIR", "./private_uploads"),
		FileSigningSecret: os.Getenv("FILE_SIGNING_SECRET"),
	}

	if runtimeenv.IsDevelopment() {
		cfg.fillDevelopmentSecrets()
	}
	return cfg
}

// Validate returns every configuration problem that makes the server unsafe to
// start.
func (c *Config) Validate() []error {
	var problems []error
	check := func(name, value string) {
		if len(value) < MinSecretLength {
			problems = append(problems, fmt.Errorf("%s must be set to a random value of at least %d characters", name, MinSecretLength))
		}
	}
	check("AUTH_JWT_SECRET", c.AuthJWTSecret)
	check("OTP_HMAC_SECRET", c.OTPHMACSecret)
	check("FILE_SIGNING_SECRET", c.FileSigningSecret)

	if c.SupabaseJWTSecret != "" && len(c.SupabaseJWTSecret) < MinSecretLength {
		problems = append(problems, fmt.Errorf("SUPABASE_JWT_SECRET is set but shorter than %d characters; unset it to disable Supabase token validation", MinSecretLength))
	}
	if c.AuthJWTSecret != "" && (c.AuthJWTSecret == c.OTPHMACSecret || c.AuthJWTSecret == c.FileSigningSecret) {
		problems = append(problems, fmt.Errorf("AUTH_JWT_SECRET, OTP_HMAC_SECRET and FILE_SIGNING_SECRET must be different values"))
	}
	if runtimeenv.IsProduction() && strings.TrimSpace(c.CORSAllowedOrigins) == "*" {
		problems = append(problems, fmt.Errorf("CORS_ALLOWED_ORIGINS must list explicit origins in production"))
	}
	return problems
}

func (c *Config) fillDevelopmentSecrets() {
	fill := func(target *string, name string) {
		if *target == "" {
			*target = randomSecret()
			log.Printf("[config] %s not set: generated an ephemeral development secret (sessions reset on restart)", name)
		}
	}
	fill(&c.AuthJWTSecret, "AUTH_JWT_SECRET")
	fill(&c.OTPHMACSecret, "OTP_HMAC_SECRET")
	fill(&c.FileSigningSecret, "FILE_SIGNING_SECRET")
}

func randomSecret() string {
	b := make([]byte, 48)
	if _, err := rand.Read(b); err != nil {
		// crypto/rand failure is unrecoverable for a security-sensitive process.
		panic("crypto/rand unavailable: " + err.Error())
	}
	return hex.EncodeToString(b)
}

func getEnv(key, fallback string) string {
	if val, ok := os.LookupEnv(key); ok && val != "" {
		return val
	}
	return fallback
}

func getDuration(key string, fallback time.Duration) time.Duration {
	raw, ok := os.LookupEnv(key)
	if !ok || raw == "" {
		return fallback
	}
	if d, err := time.ParseDuration(raw); err == nil && d > 0 {
		return d
	}
	if secs, err := strconv.Atoi(raw); err == nil && secs > 0 {
		return time.Duration(secs) * time.Second
	}
	log.Printf("[config] invalid %s=%q, using default %s", key, raw, fallback)
	return fallback
}
