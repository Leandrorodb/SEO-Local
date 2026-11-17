export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message = code,
  ) {
    super(message);
  }
}
export function requireThat(value: unknown, status: number, code: string): asserts value {
  if (!value) throw new AppError(status, code);
}
