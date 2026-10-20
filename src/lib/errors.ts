export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (code: string, message: string) => new HttpError(400, code, message);
export const forbidden = (code: string, message: string) => new HttpError(403, code, message);
export const notFound = (code: string, message: string) => new HttpError(404, code, message);
export const conflict = (code: string, message: string) => new HttpError(409, code, message);
