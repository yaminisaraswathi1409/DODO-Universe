package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	Port               string
	Env                string
	DatabaseURL        string
	SupabaseJWTSecret  string
	CORSAllowedOrigins string
}

func LoadConfig() *Config {
	if err := godotenv.Load(); err != nil {
		log.Println("Notice: No .env file found or loaded, using environment variables")
	}

	return &Config{
		Port:               getEnv("PORT", "8080"),
		Env:                getEnv("ENV", "development"),
		DatabaseURL:        getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/postgres?sslmode=disable"),
		SupabaseJWTSecret:  getEnv("SUPABASE_JWT_SECRET", "super-secret-jwt-key-for-local-testing-change-in-production"),
		CORSAllowedOrigins: getEnv("CORS_ALLOWED_ORIGINS", "*"),
	}
}

func getEnv(key, fallback string) string {
	if val, ok := os.LookupEnv(key); ok && val != "" {
		return val
	}
	return fallback
}
