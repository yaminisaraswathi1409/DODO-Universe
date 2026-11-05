package auth_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/uop/backend/internal/auth"
)

func TestGenerateOTP_FormatAndEntropy(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 300; i++ {
		code, err := auth.GenerateOTP()
		if err != nil {
			t.Fatal(err)
		}
		if !auth.ValidOTPFormat(code) {
			t.Fatalf("bad otp format %q", code)
		}
		seen[code] = true
	}
	// 300 draws from 10^6 values: a fixed or tiny-range generator would collapse.
	if len(seen) < 290 {
		t.Fatalf("OTP generator looks non-random: only %d distinct codes in 300 draws", len(seen))
	}
	if seen["123456"] && len(seen) < 295 {
		t.Fatal("suspicious fixed fallback value")
	}
}

func TestOTPHasher_BindsPhoneAndSecret(t *testing.T) {
	h, err := auth.NewOTPHasher(testSecret)
	if err != nil {
		t.Fatal(err)
	}
	stored := h.Hash("+919876543210", "482913")

	if len(stored) != auth.StoredOTPLength {
		t.Fatalf("stored verifier length %d, want %d (VARCHAR(10) column)", len(stored), auth.StoredOTPLength)
	}
	if strings.Contains(stored, "482913") {
		t.Fatal("verifier must not contain the plaintext code")
	}
	if !h.Matches(stored, "+919876543210", "482913") {
		t.Fatal("correct code rejected")
	}
	if h.Matches(stored, "+919876543210", "482914") {
		t.Fatal("wrong code accepted")
	}
	if h.Matches(stored, "+919876543211", "482913") {
		t.Fatal("verifier must be bound to the phone number")
	}
	for _, bad := range []string{"", "12345", "1234567", "abcdef", "123456 "} {
		if h.Matches(stored, "+919876543210", bad) {
			t.Fatalf("malformed code %q accepted", bad)
		}
	}
	// The legacy development bypass codes must never match by accident.
	for _, legacy := range []string{"123456", "777888"} {
		if h.Matches(stored, "+919876543210", legacy) {
			t.Fatalf("legacy dev code %s accepted", legacy)
		}
	}

	other, _ := auth.NewOTPHasher("another-secret-another-secret-another-0001")
	if other.Matches(stored, "+919876543210", "482913") {
		t.Fatal("a different server secret must not validate the verifier")
	}
}

func TestOTPHasher_RejectsWeakSecret(t *testing.T) {
	if _, err := auth.NewOTPHasher("short"); err == nil {
		t.Fatal("weak secret accepted")
	}
}

func TestRateLimiter(t *testing.T) {
	now := time.Now()
	l := auth.NewRateLimiter(3, time.Minute)
	l.SetClock(func() time.Time { return now })

	for i := 0; i < 3; i++ {
		if ok, _ := l.Allow("k"); !ok {
			t.Fatalf("attempt %d should be allowed", i+1)
		}
	}
	ok, wait := l.Allow("k")
	if ok || wait <= 0 || wait > time.Minute {
		t.Fatalf("4th attempt must be denied with a retry delay, got ok=%v wait=%v", ok, wait)
	}
	if ok, _ := l.Allow("other"); !ok {
		t.Fatal("limits are per key")
	}
	now = now.Add(61 * time.Second)
	if ok, _ := l.Allow("k"); !ok {
		t.Fatal("window should reset")
	}
}

func TestFileSigner(t *testing.T) {
	now := time.Now()
	s, err := auth.NewFileSigner(testSecret, func() time.Time { return now })
	if err != nil {
		t.Fatal(err)
	}
	tok := s.Sign("owner-1", "abc.pdf", 5*time.Minute)
	owner, name, err := s.Verify(tok)
	if err != nil || owner != "owner-1" || name != "abc.pdf" {
		t.Fatalf("verify failed: %v %q %q", err, owner, name)
	}

	// Tamper with the payload and with the signature.
	parts := strings.Split(tok, ".")
	if _, _, err := s.Verify("x" + parts[0] + "." + parts[1]); err == nil {
		t.Error("tampered payload accepted")
	}
	if _, _, err := s.Verify(parts[0] + ".AAAA"); err == nil {
		t.Error("tampered signature accepted")
	}
	if _, _, err := s.Verify("garbage"); err == nil {
		t.Error("garbage accepted")
	}

	now = now.Add(6 * time.Minute)
	if _, _, err := s.Verify(tok); err == nil {
		t.Error("expired link accepted")
	}
	if _, err := auth.NewFileSigner("short", nil); err == nil {
		t.Error("weak signing secret accepted")
	}
}

// ---- SMS gateway --------------------------------------------------------
//
// These tests exercise the Twilio client against an in-process fake transport
// (no sockets). They prove the request we build and how we interpret gateway
// answers; they do NOT prove delivery through the real Twilio service.

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func fakeGateway(h http.HandlerFunc) *http.Client {
	return &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		rec := httptest.NewRecorder()
		h(rec, r)
		return rec.Result(), nil
	})}
}

func TestTwilioSMS_SendsToGateway(t *testing.T) {
	var gotPath, gotUser, gotPass, gotBody string
	client := fakeGateway(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotUser, gotPass, _ = r.BasicAuth()
		b, _ := io.ReadAll(r.Body)
		gotBody = string(b)
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(map[string]string{"sid": "SMtest123", "status": "queued"})
	})

	sms := &auth.TwilioSMS{AccountSID: "ACtest", AuthToken: "tok", From: "+15005550006", BaseURL: "http://twilio.test", Client: client}
	if err := sms.Send(context.Background(), "+919876543210", "Your code is 482913"); err != nil {
		t.Fatalf("send failed: %v", err)
	}
	if gotPath != "/2010-04-01/Accounts/ACtest/Messages.json" {
		t.Errorf("unexpected path %q", gotPath)
	}
	if gotUser != "ACtest" || gotPass != "tok" {
		t.Errorf("basic auth not sent correctly: %q/%q", gotUser, gotPass)
	}
	for _, want := range []string{"To=%2B919876543210", "From=%2B15005550006", "Body=Your+code+is+482913"} {
		if !strings.Contains(gotBody, want) {
			t.Errorf("request body %q missing %q", gotBody, want)
		}
	}
}

func TestTwilioSMS_MessagingServiceTakesPrecedence(t *testing.T) {
	var body string
	client := fakeGateway(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		body = string(b)
		_ = json.NewEncoder(w).Encode(map[string]string{"sid": "SM1"})
	})
	sms := &auth.TwilioSMS{AccountSID: "AC", AuthToken: "t", From: "+1", MessagingServiceSID: "MG123", BaseURL: "http://twilio.test", Client: client}
	if err := sms.Send(context.Background(), "+911234567890", "x"); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(body, "MessagingServiceSid=MG123") || strings.Contains(body, "From=") {
		t.Errorf("unexpected body %q", body)
	}
}

func TestTwilioSMS_GatewayErrorsAreReported(t *testing.T) {
	cases := map[string]http.HandlerFunc{
		"http 400": func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(400)
			_, _ = w.Write([]byte(`{"code":21211,"message":"Invalid 'To' Phone Number"}`))
		},
		"http 401": func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(401) },
		"2xx without sid": func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(200)
			_, _ = w.Write([]byte(`{}`))
		},
	}
	for name, h := range cases {
		sms := &auth.TwilioSMS{AccountSID: "AC", AuthToken: "t", From: "+1", BaseURL: "http://twilio.test", Client: fakeGateway(h)}
		if err := sms.Send(context.Background(), "+911234567890", "x"); err == nil {
			t.Errorf("%s: expected an error, delivery must not be reported as successful", name)
		}
	}

	// Transport failure (gateway unreachable).
	down := &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return nil, io.ErrUnexpectedEOF
	})}
	sms := &auth.TwilioSMS{AccountSID: "AC", AuthToken: "t", From: "+1", BaseURL: "http://twilio.test", Client: down}
	if err := sms.Send(context.Background(), "+911234567890", "x"); err == nil {
		t.Error("unreachable gateway must produce an error")
	}
}

func TestNewSMSSender_NeverPretends(t *testing.T) {
	// Missing credentials => unconfigured, every send fails.
	s := auth.NewSMSSender(auth.SMSSettings{Provider: "twilio"})
	if _, ok := s.(auth.UnconfiguredSMS); !ok {
		t.Fatalf("incomplete twilio settings must yield UnconfiguredSMS, got %T", s)
	}
	if err := s.Send(context.Background(), "+911234567890", "x"); err == nil {
		t.Fatal("unconfigured sender must fail")
	}

	// No provider.
	if _, ok := auth.NewSMSSender(auth.SMSSettings{}).(auth.UnconfiguredSMS); !ok {
		t.Fatal("empty provider must be unconfigured")
	}

	// Console sender only in development.
	if _, ok := auth.NewSMSSender(auth.SMSSettings{Provider: "console", IsDevelopmentEnv: false}).(auth.UnconfiguredSMS); !ok {
		t.Fatal("console sender must be refused outside development")
	}
	if _, ok := auth.NewSMSSender(auth.SMSSettings{Provider: "console", IsDevelopmentEnv: true}).(auth.ConsoleSMS); !ok {
		t.Fatal("console sender expected in development")
	}

	// Fully configured twilio.
	if _, ok := auth.NewSMSSender(auth.SMSSettings{Provider: "twilio", TwilioAccountSID: "AC", TwilioAuthToken: "t", TwilioFromNumber: "+1"}).(*auth.TwilioSMS); !ok {
		t.Fatal("complete settings must yield the Twilio sender")
	}
}

func TestMaskPhone(t *testing.T) {
	cases := []struct {
		input string
		want  string
	}{
		{"+919876543210", "+91 98****3210"},
		{"+916302803606", "+91 63****3606"},
		{"+15551234567", "+1******4567"},
		{"1234", "****"},
		{"", "****"},
	}
	for _, tc := range cases {
		got := auth.MaskPhone(tc.input)
		if got != tc.want {
			t.Errorf("MaskPhone(%q) = %q, want %q", tc.input, got, tc.want)
		}
		if tc.input != "" && len(tc.input) > 4 && strings.Contains(got, tc.input) {
			t.Errorf("MaskPhone(%q) leaked full phone: %s", tc.input, got)
		}
	}
}

func TestConsoleSMS_LogFormatting(t *testing.T) {
	var buf bytes.Buffer
	prevWriter := log.Writer()
	prevFlags := log.Flags()
	log.SetOutput(&buf)
	log.SetFlags(0)
	defer func() {
		log.SetOutput(prevWriter)
		log.SetFlags(prevFlags)
	}()

	sender := auth.ConsoleSMS{}
	err := sender.Send(context.Background(), "+919876543210", "Your DODO Universe verification code is 482913. It expires in 5 minutes.")
	if err != nil {
		t.Fatalf("ConsoleSMS.Send failed: %v", err)
	}

	output := buf.String()
	if !strings.Contains(output, "[DEV-OTP]") {
		t.Errorf("Console output missing [DEV-OTP] tag: %s", output)
	}
	if !strings.Contains(output, "Target:  +91 98****3210") {
		t.Errorf("Console output does not contain masked phone: %s", output)
	}
	if strings.Contains(output, "+919876543210") {
		t.Errorf("Console output leaked full unmasked phone number: %s", output)
	}
	if !strings.Contains(output, "482913") {
		t.Errorf("Console output missing OTP code: %s", output)
	}
}
