export class UnaConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnaConfigurationError";
  }
}

export class UnaHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "UnaHttpError";
  }
}

export class UnaMcpError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status?: number,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "UnaMcpError";
  }
}
