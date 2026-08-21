import { NextResponse } from "next/server";

/**
 * GET /.well-known/assetlinks.json
 *
 * Android Digital Asset Links statement — lets Android verify that
 * `com.quikinfra.app` is allowed to handle this domain's HTTPS links as
 * App Links (native invite acceptance), instead of always falling back to
 * the browser. Must be served with no redirects and no auth gate — Android
 * fetches this unauthenticated at install/verification time (see
 * middleware.ts's `publicRoutes`).
 *
 * Two signing certs are listed, both SHA-256 (Digital Asset Links uses
 * SHA-256, not the SHA-1 that the Google Cloud OAuth client registration
 * asks for):
 *   1. Local/debug key — `flutter run` / Android Studio builds.
 *   2. Google Play App Signing key — covers BOTH UAT internal testing and
 *      production, which share the same Play signing key.
 */
export async function GET() {
  return NextResponse.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.quikinfra.app",
          sha256_cert_fingerprints: [
            // Local development (Flutter run / Android Studio)
            "D0:A1:FF:09:4F:BE:37:C2:C5:98:19:11:54:2F:82:9E:FF:A1:83:4D:EE:D8:D4:59:F5:91:24:4E:A6:24:6E:29",
            // Google Play App Signing (UAT internal testing + production)
            "64:81:3C:36:21:01:99:2F:15:13:C6:CA:63:FF:21:8F:BF:01:C3:E8:70:5D:20:B2:7B:A7:CE:22:CE:DE:04:48",
          ],
        },
      },
    ],
    {
      headers: {
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}
