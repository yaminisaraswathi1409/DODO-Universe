package service

import (
	"testing"
)

func TestGenerateRandomOTP(t *testing.T) {
	otp1 := GenerateRandomOTP()
	otp2 := GenerateRandomOTP()

	if len(otp1) != 6 {
		t.Errorf("Expected 6-digit OTP code, got %s", otp1)
	}

	if len(otp2) != 6 {
		t.Errorf("Expected 6-digit OTP code, got %s", otp2)
	}
}
