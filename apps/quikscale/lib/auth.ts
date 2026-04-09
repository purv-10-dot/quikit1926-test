import { createAuthOptions } from "@quikit/auth";
import "@quikit/auth/types";

export const authOptions = createAuthOptions({
  signInPage: "/auth/login",
  errorPage: "/auth/error",
});
