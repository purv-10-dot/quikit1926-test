/**
 * Resolve the right ScmProvider for an org's installation.
 *
 * This is the single extension point for adding GitLab / Bitbucket: today it
 * only builds a GithubProvider, but a new provider slots in here (switch on the
 * installation's system) without any service above it changing — repo-service,
 * backfill-service, and the create-branch route all depend on ScmProvider, not
 * on GitHub directly.
 *
 * Token acquisition stays provider-specific: GitHub uses an installation access
 * token minted/refreshed by repo-service; a future GitLab provider would read a
 * stored PAT. The caller passes whatever credential the chosen provider needs.
 */

import type { ScmProvider, ScmSystem } from "@/lib/services/scm/types";
import { GithubProvider } from "@/lib/services/github/github-provider";

export interface ProviderContext {
  /** Which SCM this installation is for. Defaults to github. */
  system?: ScmSystem;
  /** The ready-to-use access credential for that provider. */
  token: string;
}

/** Build the provider implementation for the given system + credential. */
export function makeScmProvider(ctx: ProviderContext): ScmProvider {
  const system = ctx.system ?? "github";
  switch (system) {
    case "github":
      return new GithubProvider(ctx.token);
    // case "gitlab":    return new GitlabProvider(ctx.token);
    // case "bitbucket": return new BitbucketProvider(ctx.token);
    default: {
      // Exhaustiveness guard — adding an ScmSystem without a case is a
      // compile error here once the commented branches are implemented.
      throw new Error(`Unsupported SCM provider: ${system}`);
    }
  }
}
