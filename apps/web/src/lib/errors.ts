import { ApiError } from "../api/client";

export function errorMessage(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
) {
  if (!(err instanceof ApiError)) return fallback;
  if (err.status === 403) return "You do not have permission to do this.";
  if (err.status === 409 || err.status === 404) return err.message;
  if (err.status === 400) {
    return "Some values are not valid. Check the form and try again.";
  }
  return fallback;
}
