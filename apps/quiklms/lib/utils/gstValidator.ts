/**
 * Validates Indian GST Number
 * Format: ^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$
 */
export const validateGST = (gstNumber: string): boolean => {
  const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  return gstRegex.test(gstNumber);
};

export const formatGST = (value: string): string => {
  // Remove all non-alphanumeric characters and convert to uppercase
  return value.replace(/[^0-9A-Z]/gi, '').toUpperCase();
};

