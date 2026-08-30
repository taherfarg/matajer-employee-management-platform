import type { AuthContext } from '../common/auth-context';

declare global {
  namespace Express {
    interface Request {
      /** Correlation id echoed in responses and attached to every log line. */
      id: string;
      /** Present only after the `authenticate` middleware has run. */
      auth?: AuthContext;
    }
  }
}

export {};
