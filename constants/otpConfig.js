export const USE_STATIC_OTP = true;
export const STATIC_OTP = '123456';

export const getOtpPlaceholder = () =>
  USE_STATIC_OTP ? `Enter ${STATIC_OTP}` : 'Enter OTP (e.g., 1234)';
