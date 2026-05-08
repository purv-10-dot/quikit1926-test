#!/usr/bin/env perl
# One-shot codemod: insert `import { unwrap } ...` and rewrite every
# fetch-handler json() call to pipe through unwrap().
#
# Usage: perl scripts/patch-envelope-unwrap.pl <files...>
#
# Idempotent guards:
#   - Won't add the import again if it's already in the file.
#   - Won't double-wrap an `await ... .json()` already inside `unwrap(...)`.
#   - Won't re-append `.then(unwrap)` to chains that already have it.
use strict;
use warnings;

for my $file (@ARGV) {
    open my $fh, '<', $file or die "open $file: $!";
    local $/;
    my $src = <$fh>;
    close $fh;

    my $orig = $src;

    # 1. Insert import once, before the first existing import line, only if not
    #    already present.
    if ($src !~ /from\s+["']\@\/lib\/utils\/api-fetch["']/ ) {
        $src =~ s/^(import\s)/import { unwrap } from "\@\/lib\/utils\/api-fetch";\n$1/m;
    }

    # 2. .then((X) => X.json())  →  .then((X) => X.json()).then(unwrap)
    $src =~ s{
        ( \.then\(\(\w+\)\s*=>\s*\w+\.json\(\)\) )
        (?!\.then\(unwrap\))
    }{$1.then(unwrap)}xg;

    # 3. .then((X) => (X.ok ? X.json() : Y))  →  same + .then(unwrap)
    $src =~ s{
        ( \.then\(\(\w+\)\s*=>\s*\(\w+\.ok\s*\?\s*\w+\.json\(\)\s*:\s*[^)]+\)\) )
        (?!\.then\(unwrap\))
    }{$1.then(unwrap)}xg;

    # 4. .then((X) => X.ok ? X.json() : Y)  →  same + .then(unwrap)  (no parens)
    $src =~ s{
        ( \.then\(\(\w+\)\s*=>\s*\w+\.ok\s*\?\s*\w+\.json\(\)\s*:\s*[^)]+\) )
        (?!\.then\(unwrap\))
    }{$1.then(unwrap)}xg;

    # 5. await VAR.json().catch((...) => (...))   →   wrap with unwrap(...)
    #    Handles `.catch(() => null)`, `.catch(() => ({}))`, etc.  Allows one
    #    level of nested parens inside the catch callback.
    $src =~ s{
        (?<!unwrap\()
        ( await\s+[\w.]+\.json\(\)\.catch\((?:[^()]|\([^()]*\))*\) )
    }{unwrap($1)}xg;

    # 6. bare await VAR.json()  (no .catch)   →   wrap with unwrap(...)
    $src =~ s{
        (?<!unwrap\()
        ( await\s+[\w.]+\.json\(\) )
        (?!\s*\.catch)
    }{unwrap($1)}xg;

    if ($src eq $orig) {
        print "skip (no change): $file\n";
        next;
    }

    open my $out, '>', $file or die "write $file: $!";
    print $out $src;
    close $out;
    print "patched: $file\n";
}
