/**
 * Shared Phone Input & Validation Utility for DODO-Universe
 * Enforces strictly 10 digits for Indian mobile numbers (+91), prevents entering/pasting > 10 digits,
 * and validates full E.164 compliance without breaking international support or unrelated numeric inputs.
 */

export interface PhoneValidationResult {
  isValid: boolean;
  error: string | null;
  formattedPhone: string;
  nationalDigits: string;
}

/**
 * Extracts numeric digits from string
 */
export function extractDigits(value: string): string {
  if (!value) return '';
  return value.replace(/\D/g, '');
}

/**
 * Sanitizes input value as the user types or pastes.
 * Guarantees that the national mobile number portion never exceeds 10 digits for Indian numbers.
 */
export function sanitizePhoneInput(rawInput: string, defaultCountryCode: string = '+91'): string {
  if (!rawInput) return '';

  let trimmed = rawInput.trim();

  // If user typed or pasted with +91 or starts with +
  if (trimmed.startsWith('+91')) {
    const afterCode = trimmed.slice(3).replace(/\D/g, '');
    const limited = afterCode.slice(0, 10);
    return `+91${limited}`;
  }

  if (trimmed.startsWith('+')) {
    // Other international number: allow '+' and up to 15 digits (E.164 max)
    const digitsOnly = trimmed.slice(1).replace(/\D/g, '').slice(0, 15);
    return `+${digitsOnly}`;
  }

  // If input starts with 91 followed by digits (length > 10)
  const allDigits = trimmed.replace(/\D/g, '');
  if (allDigits.startsWith('91') && allDigits.length > 10) {
    const national = allDigits.slice(2, 12); // max 10 national digits
    return `+91${national}`;
  }

  // Otherwise, treat as raw national mobile digits (max 10 digits)
  const max10Digits = allDigits.slice(0, 10);
  if (trimmed.startsWith('+91')) {
    return `+91${max10Digits}`;
  }
  return max10Digits;
}

/**
 * Validates a mobile phone number on form submission.
 * Enforces exactly 10 digits for Indian numbers, and 7-15 digits for international numbers.
 */
export function validatePhoneNumber(phone: string, defaultCountryCode: string = '+91'): PhoneValidationResult {
  if (!phone || phone.trim() === '' || phone.trim() === '+91' || phone.trim() === '+') {
    return {
      isValid: false,
      error: 'Mobile phone number is required.',
      formattedPhone: '',
      nationalDigits: '',
    };
  }

  const trimmed = phone.trim();
  const digits = extractDigits(trimmed);

  // If input starts with '+' and NOT '+91', it's explicitly an international number
  const isExplicitInternational = trimmed.startsWith('+') && !trimmed.startsWith('+91');

  if (!isExplicitInternational) {
    let national = digits;
    if (national.startsWith('91') && national.length > 10) {
      national = national.slice(2);
    }

    if (national.length === 0) {
      return {
        isValid: false,
        error: 'Please enter a mobile phone number.',
        formattedPhone: '',
        nationalDigits: '',
      };
    }

    if (national.length < 10) {
      return {
        isValid: false,
        error: `Incomplete mobile number: exactly 10 digits required (entered ${national.length} digits).`,
        formattedPhone: `+91${national}`,
        nationalDigits: national,
      };
    }

    if (national.length > 10) {
      return {
        isValid: false,
        error: `Mobile number cannot exceed 10 digits (entered ${national.length} digits).`,
        formattedPhone: `+91${national.slice(0, 10)}`,
        nationalDigits: national.slice(0, 10),
      };
    }

    return {
      isValid: true,
      error: null,
      formattedPhone: `+91${national}`,
      nationalDigits: national,
    };
  }

  // International phone number validation (7 to 15 digits)
  if (trimmed.startsWith('+')) {
    if (digits.length < 7) {
      return {
        isValid: false,
        error: 'International phone number is too short (minimum 7 digits).',
        formattedPhone: `+${digits}`,
        nationalDigits: digits,
      };
    }
    if (digits.length > 15) {
      return {
        isValid: false,
        error: 'International phone number cannot exceed 15 digits.',
        formattedPhone: `+${digits.slice(0, 15)}`,
        nationalDigits: digits.slice(0, 15),
      };
    }
    return {
      isValid: true,
      error: null,
      formattedPhone: `+${digits}`,
      nationalDigits: digits,
    };
  }

  // Fallback 10-digit validation
  if (digits.length !== 10) {
    return {
      isValid: false,
      error: `Please enter a valid 10-digit mobile number (entered ${digits.length} digits).`,
      formattedPhone: `+91${digits}`,
      nationalDigits: digits,
    };
  }

  return {
    isValid: true,
    error: null,
    formattedPhone: `+91${digits}`,
    nationalDigits: digits,
  };
}

/**
 * Formats phone number for readable display: +91 98765 43210
 */
export function formatPhoneDisplay(phone: string): string {
  if (!phone) return '';
  const digits = extractDigits(phone);
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    const nat = digits.slice(2);
    return `+91 ${nat.slice(0, 5)} ${nat.slice(5)}`;
  }
  return phone;
}
