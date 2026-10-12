export const TRANSFER_APPROVAL_LIMIT_CENTS = 100_000;

export function dollarsToCents(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw httpError(400, 'Enter an amount greater than zero.');
  }
  const cents = Math.round(value * 100);
  if (Math.abs(value * 100 - cents) > 0.001) {
    throw httpError(400, 'Use at most two decimal places.');
  }
  return cents;
}

export function centsToDollars(cents) {
  return cents / 100;
}

export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
