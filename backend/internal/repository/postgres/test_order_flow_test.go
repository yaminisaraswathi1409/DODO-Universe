package postgres

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

func TestOrderAcceptanceFlow(t *testing.T) {
	_ = godotenv.Load("C:/DODO-Universe/backend/.env")
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5432/postgres?sslmode=disable"
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("Failed to connect to db: %v", err)
	}
	defer pool.Close()

	// 1. Get vendor user neha
	var vendorID, vendorPhone string
	err = pool.QueryRow(ctx, "SELECT id, phone FROM users WHERE phone = '+919640754927'").Scan(&vendorID, &vendorPhone)
	if err != nil {
		t.Fatalf("Vendor neha not found: %v", err)
	}
	fmt.Printf("Vendor found: ID=%s, Phone=%s\n", vendorID, vendorPhone)

	// 2. Get a customer user
	var customerID string
	err = pool.QueryRow(ctx, "SELECT id FROM users WHERE id != $1 LIMIT 1", vendorID).Scan(&customerID)
	if err != nil {
		t.Fatalf("Customer not found: %v", err)
	}

	// 3. Insert a test opportunity directly into PostgreSQL
	var oppID string
	err = pool.QueryRow(ctx, `
		INSERT INTO opportunities (
			user_id, type, order_mode, title, description, workflow_model, status,
			location, address_text, radius_km
		) VALUES (
			$1, 'NEED', 'GENERAL_BROADCAST', 'Test Order For Vendor Acceptance', 'Direct verification order', 'INSTANT', 'OPEN',
			ST_SetSRID(ST_MakePoint(78.95, 17.25), 4326)::geography, 'Hyderabad', 50
		) RETURNING id::text;
	`, customerID).Scan(&oppID)
	if err != nil {
		t.Fatalf("Failed to insert test opportunity: %v", err)
	}
	fmt.Printf("Created test opportunity: ID=%s\n", oppID)

	// 4. Vendor accepts order passing phone number as user_id (as frontend does)
	acceptPayload := map[string]interface{}{
		"status":  "ACCEPTED",
		"user_id": vendorPhone,
	}
	acceptBytes, _ := json.Marshal(acceptPayload)
	acceptResp, err := http.Post(fmt.Sprintf("http://localhost:8080/api/v1/opportunities/%s/status", oppID), "application/json", bytes.NewBuffer(acceptBytes))
	if err != nil {
		t.Fatalf("Failed to send accept request: %v", err)
	}
	defer acceptResp.Body.Close()
	acceptBody, _ := io.ReadAll(acceptResp.Body)
	fmt.Printf("Accept response: %s\n", string(acceptBody))

	// 5. Verify database assigned_user_id on the opportunity row
	var assignedUserID, oppStatus string
	err = pool.QueryRow(ctx, "SELECT COALESCE(assigned_user_id::text, ''), status FROM opportunities WHERE id = $1", oppID).Scan(&assignedUserID, &oppStatus)
	if err != nil {
		t.Fatalf("Failed to query opp after accept: %v", err)
	}
	fmt.Printf("Database check: Opp ID=%s, Status=%s, AssignedUserID=%s\n", oppID, oppStatus, assignedUserID)

	if assignedUserID != vendorID {
		t.Fatalf("CRITICAL BUG: assigned_user_id in DB is '%s', expected vendorID '%s'", assignedUserID, vendorID)
	}

	// 6. Test GET /opportunities/accepted?user_id=+919640754927
	getResp, err := http.Get(fmt.Sprintf("http://localhost:8080/api/v1/opportunities/accepted?user_id=%s", vendorPhone))
	if err != nil {
		t.Fatalf("Failed to fetch accepted orders: %v", err)
	}
	defer getResp.Body.Close()
	getResponseBody, _ := io.ReadAll(getResp.Body)

	var listResp map[string]interface{}
	_ = json.Unmarshal(getResponseBody, &listResp)
	ordersArr, _ := listResp["data"].([]interface{})

	found := false
	for _, item := range ordersArr {
		oMap, _ := item.(map[string]interface{})
		if oMap["id"] == oppID {
			found = true
			break
		}
	}

	if !found {
		t.Fatalf("CRITICAL BUG: Accepted order %s was NOT found in vendor's accepted orders list!", oppID)
	}

	fmt.Printf("\nSUCCESS! Vendor order acceptance & order retrieval verified 100%% end-to-end!\n")

	// Cleanup test opportunity
	_, _ = pool.Exec(ctx, "DELETE FROM opportunities WHERE id = $1", oppID)
}
