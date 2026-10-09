# Contribution instructions

YOU CANNOT HAVE AI AS A CO-AUTHOR, OR YOUR CONTRIBUTIONS WILL BE REJECTED.

AI author, committer and identity-bearing attribution trailers are also prohibited.
Preserve legitimate human credit and asset/license provenance. Technical discussion
of tools is permitted. Onboard identities through the reviewed registry when
approved mode is enabled. Run the installed common validator and consumer conformance
locally, then the component's documented checks. Authorship checks run on every
change, including documentation and content. Workflow/policy updates use the
coordinator's trusted review path. Never publish synthetic invalid fixture commits.

## Repository-only attribution tooling

The canonical pin is `.attribution-release.json`: `@foss-earth/ci@0.1.0`, source
`9e046dd482e0229dc7c7b2d71b079d5905664656`, archive SHA-256
`450ede699f55f9b9c78146eadb73de7c6297e56553e7d7f9e5b164786a7beb24`,
55,587 bytes; policy SHA-256
`9ca88bf5861685e22e65e5f39fa65b05faaf9c218875fccbecce1b9f2dca5bd3`.
The descriptor also seals the shared executable, policy and fixture files.

Obtain that exact reviewed archive through the coordinator's approved channel,
then install it from this checkout:

```sh
npm run attribution:install -- /path/to/foss-earth-ci-0.1.0.tgz
```

Installation checks the archive size/digest, materializes the actual package
and invokes its shared integrity helper. It makes no registry request and
preserves existing installed tooling, runtime dependencies and the lockfile.
Installation copies/logs remain in ignored `build/`; retain them. An existing
different or symlinked common installation fails instead of being overwritten.
Run this command again after a package-manager operation removes the local
development tool. It is separate from the MIT runtime package and its public
exports; its upstream license remains AGPL-3.0-only. No shared validator source
or fixture implementation is copied into this repository's tracked files.

The reviewed local archive is available for migration preparation. A public
download URL and public availability of the reusable workflow at the pinned
source are still pending. Do not substitute a floating revision, registry
version, neighboring source link or unreviewed URL.

## Local checks and complete history

Once the coordinator grants the shared check slot, run the actual installed
consumer conformance with an independently reviewed release descriptor:

```sh
npm run attribution:conformance -- --consumer . --trusted-release /path/to/reviewed/release.json --output-root build/repository-split/checks/devices-policy/conformance
npm run attribution -- --repo . --refs-file build/repository-split/checks/devices-policy/publication.json
```

Conformance exercises the common positive/negative metadata cases in isolated
ignored fixture repositories. It does not qualify controllers, browsers or
WebGPU. The publication manifest must explicitly list every intended branch
and tag with exact object IDs, including the metadata-only migration branch;
all their reachable history and annotated tag metadata must pass. A range
check or main-only scope is insufficient for complete publication acceptance.
Keep local source locations and detailed historical violation evidence private
in ignored `build/`. Preserve legitimate history and raw recorded human
identities; report violations for reviewed disposition rather than changing
identity headers or adding exclusions.

For controller implementation, use the existing `npm run typecheck` and
`npm run build` as applicable. This package has no general test, lint or `ci`
script. The attribution scripts are separate development checks.

## Hosted caller and remaining gates

`.github/workflows/attribution-check.yml` is the unconditional shared scaffold
caller for pull requests, merge groups and pushes, without changed-path skips.
It pins both reusable workflow and validator to the reviewed source. The
required context is `attribution / Attribution policy`.

The coordinator owns trusted policy/caller updates, publication and actual
remote admission settings. A local caller or passing fixture result does not
prove hosted availability, Linux behavior, required-check/App identities,
restricted branch/tag/bypass routes, trusted-job witnesses or guarded
publication/race behavior. Those receipts remain required before acceptance.
