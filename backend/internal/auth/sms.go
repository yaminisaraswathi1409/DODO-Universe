package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// ErrSMSNotConfigured is returned when no SMS gateway is available. Callers
// must surface this honestly (HTTP 503) instead of pretending a code was sent.
var ErrSMSNotConfigured = errors.New("sms gateway is not configured")

// SMSSender delivers a text message through a real gateway.
type SMSSender interface {
	// Name identifies the provider for logs and health output.
	Name() string
	// Send delivers body to the E.164 phone number. A nil error means the
	// gateway accepted the message (it does not prove handset delivery).
	Send(ctx context.Context, toE164, body string) error
}

// UnconfiguredSMS is used when SMS_PROVIDER is "none" or credentials are
// missing. It never reports success.
type UnconfiguredSMS struct{ Reason string }

func (u UnconfiguredSMS) Name() string { return "none" }
func (u UnconfiguredSMS) Send(context.Context, string, string) error {
	return fmt.Errorf("%w: %s", ErrSMSNotConfigured, u.Reason)
}

// ConsoleSMS is a development-only sender. It prints the verification code
// directly to the backend development terminal so that developers can complete
// OTP verification during local development without a third-party SMS gateway.
// Outside an explicit development environment (ENV=development), NewSMSSender
// strictly refuses ConsoleSMS and fails safe.
type ConsoleSMS struct{}

func (ConsoleSMS) Name() string { return "console" }
func (ConsoleSMS) Send(_ context.Context, to, body string) error {
	log.Println("[DEV-OTP] ===================================================")
	log.Printf("[DEV-OTP] Target:  %s", maskPhone(to))
	log.Printf("[DEV-OTP] %s", body)
	log.Println("[DEV-OTP] ===================================================")
	return nil
}

// TwilioSMS sends through the Twilio Programmable Messaging REST API.
type TwilioSMS struct {
	AccountSID          string
	AuthToken           string
	From                string // E.164 sender number, or
	MessagingServiceSID string // Messaging Service SID (preferred when set)
	// BaseURL defaults to https://api.twilio.com; overridable for tests.
	BaseURL string
	Client  *http.Client
}

func (t *TwilioSMS) Name() string { return "twilio" }

func (t *TwilioSMS) Send(ctx context.Context, to, body string) error {
	base := t.BaseURL
	if base == "" {
		base = "https://api.twilio.com"
	}
	client := t.Client
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}

	form := url.Values{}
	form.Set("To", to)
	form.Set("Body", body)
	if t.MessagingServiceSID != "" {
		form.Set("MessagingServiceSid", t.MessagingServiceSID)
	} else {
		form.Set("From", t.From)
	}

	endpoint := fmt.Sprintf("%s/2010-04-01/Accounts/%s/Messages.json", strings.TrimRight(base, "/"), url.PathEscape(t.AccountSID))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.SetBasicAuth(t.AccountSID, t.AuthToken)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("twilio request failed: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 64<<10))

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var apiErr struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		}
		_ = json.Unmarshal(raw, &apiErr)
		return fmt.Errorf("twilio rejected message: http %d code %d: %s", resp.StatusCode, apiErr.Code, apiErr.Message)
	}

	var ok struct {
		SID    string `json:"sid"`
		Status string `json:"status"`
	}
	if err := json.Unmarshal(raw, &ok); err != nil || ok.SID == "" {
		return errors.New("twilio response did not contain a message sid")
	}
	return nil
}

// SMSSettings carries what NewSMSSender needs, independent of the config package.
type SMSSettings struct {
	Provider            string
	TwilioAccountSID    string
	TwilioAuthToken     string
	TwilioFromNumber    string
	TwilioMessagingSID  string
	IsDevelopmentEnv    bool
}

// NewSMSSender builds the configured sender. It never silently downgrades:
// missing credentials yield an UnconfiguredSMS that fails every send.
func NewSMSSender(s SMSSettings) SMSSender {
	switch strings.ToLower(strings.TrimSpace(s.Provider)) {
	case "twilio":
		if s.TwilioAccountSID == "" || s.TwilioAuthToken == "" || (s.TwilioFromNumber == "" && s.TwilioMessagingSID == "") {
			return UnconfiguredSMS{Reason: "SMS_PROVIDER=twilio but TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER (or TWILIO_MESSAGING_SERVICE_SID) are not all set"}
		}
		return &TwilioSMS{
			AccountSID:          s.TwilioAccountSID,
			AuthToken:           s.TwilioAuthToken,
			From:                s.TwilioFromNumber,
			MessagingServiceSID: s.TwilioMessagingSID,
		}
	case "console":
		if !s.IsDevelopmentEnv {
			return UnconfiguredSMS{Reason: "SMS_PROVIDER=console is only allowed when ENV=development"}
		}
		return ConsoleSMS{}
	default:
		return UnconfiguredSMS{Reason: "SMS_PROVIDER is not set (supported: twilio)"}
	}
}

func MaskPhone(p string) string {
	p = strings.TrimSpace(p)
	if len(p) <= 4 {
		return "****"
	}
	if strings.HasPrefix(p, "+91") && len(p) >= 12 {
		return "+91 " + p[3:5] + strings.Repeat("*", len(p)-9) + p[len(p)-4:]
	}
	if len(p) > 7 {
		return p[:2] + strings.Repeat("*", len(p)-6) + p[len(p)-4:]
	}
	return strings.Repeat("*", len(p)-4) + p[len(p)-4:]
}

func maskPhone(p string) string {
	return MaskPhone(p)
}

