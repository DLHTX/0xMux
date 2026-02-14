export function getErrorMessage(e: unknown, fallback = 'Unknown error'): string {
  if (e && typeof e === 'object' && 'message' in e) {
    return (e as { message: string }).message
  }
  return fallback
}
