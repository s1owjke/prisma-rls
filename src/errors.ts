export class AuthorizationError extends Error {
  constructor(message = "Not authorized") {
    super(message);
  }
}

export class ReferentialIntegrityError extends Error {
  constructor(message = "Referential integrity violation") {
    super(message);
  }
}
