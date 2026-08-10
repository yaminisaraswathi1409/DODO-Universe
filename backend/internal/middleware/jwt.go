package middleware

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"github.com/uop/backend/pkg/response"
)

type contextKey string

const UserContextKey contextKey = "user_claims"

type UserClaims struct {
	SupabaseUID string `json:"sub"`
	Email       string `json:"email"`
	Role        string `json:"role"`
	jwt.RegisteredClaims
}

func JWTAuthMiddleware(jwtSecret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				response.Error(w, http.StatusUnauthorized, "Missing Authorization header", nil)
				return
			}

			parts := strings.Split(authHeader, " ")
			if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
				response.Error(w, http.StatusUnauthorized, "Invalid Authorization header format. Expected Bearer <token>", nil)
				return
			}

			tokenString := parts[1]

			claims := &UserClaims{}
			token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
				if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
				}
				return []byte(jwtSecret), nil
			})

			if err != nil || !token.Valid {
				response.Error(w, http.StatusUnauthorized, "Invalid or expired token", map[string]string{"details": err.Error()})
				return
			}

			// Inject user claims into Request Context
			ctx := context.WithValue(r.Context(), UserContextKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// Helper function to extract user claims from context in HTTP handlers
func GetUserClaims(ctx context.Context) (*UserClaims, bool) {
	claims, ok := ctx.Value(UserContextKey).(*UserClaims)
	return claims, ok
}
