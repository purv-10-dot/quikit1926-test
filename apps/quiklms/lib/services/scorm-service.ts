/**
 * SCORM service — ported from ScormService (`src/scorm/scorm.service.ts`) and the
 * SCORM half of UploadService (`src/upload/upload.service.ts:88-317`).
 *
 * Behavioral parity notes (deliberate, do not "fix"):
 *  - `parseScormPackage` reads the title from `metadata[0].schema[0].schemaversion[0]`
 *    FIRST — that is the legacy precedence and it yields a schema string (e.g. "1.2")
 *    rather than a human title. Reproduced verbatim; see QUESTION in the summary.
 *  - `extractScormFiles` does NOT extract anything. The legacy implementation ignored
 *    its `extractPath` argument entirely and returned relative paths only
 *    (`scorm.service.ts:69-85`). Reproduced.
 *  - The legacy code used `adm-zip` here and `jszip` in ScormService. We use `jszip`
 *    for both: `entry.entryName` ≡ the JSZip relative path, `entry.isDirectory` ≡
 *    `file.dir`. Iteration order follows the zip's central directory in both.
 *
 * The original had no Mongoose models in this module — it is pure file processing,
 * so there are no hooks/virtuals to replicate.
 */
import JSZip from 'jszip';
import { parseStringPromise } from 'xml2js';
import { randomUUID } from 'crypto';
import { S3_BUCKET, putObject } from '@/lib/s3';
import { BadRequest } from '@/lib/http';

/** A zip member, normalized to the legacy adm-zip entry shape. */
interface ZipEntry {
  entryName: string;
  isDirectory: boolean;
  getData: () => Promise<Buffer>;
}

/** Read every member of the zip in archive order (adm-zip `getEntries()` parity). */
async function readEntries(zipBuffer: Buffer): Promise<ZipEntry[]> {
  const zip = await JSZip.loadAsync(zipBuffer);
  const entries: ZipEntry[] = [];
  zip.forEach((relativePath, file) => {
    entries.push({
      entryName: relativePath,
      isDirectory: file.dir,
      getData: () => file.async('nodebuffer'),
    });
  });
  return entries;
}

export interface ParsedScormPackage {
  title: string;
  launchUrl: string;
  manifest: unknown;
}

/**
 * Parse a SCORM zip and extract manifest information.
 * Port of `ScormService.parseScormPackage` (`scorm.service.ts:10-64`).
 */
export async function parseScormPackage(zipBuffer: Buffer): Promise<ParsedScormPackage> {
  try {
    const zip = await JSZip.loadAsync(zipBuffer);
    const manifestFile = zip.file('imsmanifest.xml');

    if (!manifestFile) {
      throw BadRequest('Invalid SCORM package: imsmanifest.xml not found');
    }

    const manifestContent = await manifestFile.async('string');
    const manifest = await parseStringPromise(manifestContent);

    // Title precedence is the legacy one, quirk included (see file docblock).
    const title =
      manifest.manifest?.metadata?.[0]?.schema?.[0]?.schemaversion?.[0] ||
      manifest.manifest?.metadata?.[0]?.lom?.[0]?.general?.[0]?.title?.[0]?.string?.[0]?._ ||
      'SCORM Course';

    // Launch URL = first resource href.
    let launchUrl = '';
    const resources = manifest.manifest?.resources?.[0]?.resource || [];
    if (resources.length > 0) {
      const firstResource = resources[0];
      launchUrl = firstResource.$?.href || firstResource.href?.[0] || '';
    }

    if (!launchUrl) {
      throw BadRequest('Invalid SCORM package: No launch URL found');
    }

    return { title, launchUrl, manifest };
  } catch (error: unknown) {
    // Legacy rethrows BadRequestException untouched and wraps everything else.
    if (error instanceof Error && 'statusCode' in error && (error as { statusCode: number }).statusCode === 400) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw BadRequest(`Failed to parse SCORM package: ${message}`);
  }
}

/**
 * Port of `ScormService.extractScormFiles` (`scorm.service.ts:69-85`).
 * Returns relative paths of non-directory members. Writes nothing — matching the
 * original, whose `extractPath` param was accepted and then never used.
 */
export async function extractScormFiles(zipBuffer: Buffer, _extractPath: string): Promise<string[]> {
  const entries = await readEntries(zipBuffer);
  return entries.filter((e) => !e.isDirectory).map((e) => e.entryName);
}

/** Legacy content-type map (`upload.service.ts:186-202`). Order preserved. */
function contentTypeFor(entryName: string): string {
  const name = entryName.toLowerCase();
  if (name.endsWith('.html') || name.endsWith('.htm')) return 'text/html';
  if (name.endsWith('.css')) return 'text/css';
  if (name.endsWith('.js')) return 'application/javascript';
  if (name.endsWith('.json')) return 'application/json';
  if (name.endsWith('.xml')) return 'application/xml';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.gif')) return 'image/gif';
  if (name.endsWith('.svg')) return 'image/svg+xml';
  if (name.endsWith('.mp3')) return 'audio/mpeg';
  if (name.endsWith('.mp4')) return 'video/mp4';
  if (name.endsWith('.woff') || name.endsWith('.woff2')) return 'font/woff2';
  return 'application/octet-stream';
}

/**
 * Inject a self-contained SCORM API bridge into the entry-point HTML.
 *
 * Reproduced byte-for-byte from `upload.service.ts:259-317` — the inventory calls
 * this "the single highest-risk item in the migration". The bridge creates
 * window.API (SCORM 1.2) and window.API_1484_11 (SCORM 2004), services every call
 * from a local CMI store so returns stay synchronous, and relays to the parent LMS
 * window via postMessage. Do not reformat: SCORM packages bind to these exact
 * symbols and the parent listens for these exact message types.
 */
export function injectScormBridge(html: string): string {
  const bridgeScript = `<script>
(function(){
  if(window.__scormBridgeLoaded) return;
  window.__scormBridgeLoaded=true;
  var _d={},_init=false,_err='0';
  function notify(t,p){try{window.parent.postMessage({source:'scorm-bridge',type:t,data:p},'*');}catch(e){}}
  window.addEventListener('message',function(e){
    if(e.data&&e.data.source==='scorm-lms'){
      if(e.data.type==='init-data'&&e.data.data){var d=e.data.data;for(var k in d){if(d.hasOwnProperty(k))_d[k]=d[k];}}
    }
  });
  notify('ready',{});
  var _statusSet=false;
  window.API={
    LMSInitialize:function(){_init=true;_err='0';notify('init',{});return 'true';},
    LMSFinish:function(){
      if(!_statusSet){_d['cmi.core.lesson_status']='completed';}
      notify('commit',_d);notify('completed',_d);notify('finish',_d);_init=false;_err='0';return 'true';
    },
    LMSGetValue:function(el){if(!_init){_err='301';return '';}if(!el){_err='201';return '';}_err='0';return _d[el]||'';},
    LMSSetValue:function(el,val){if(!_init){_err='301';return 'false';}if(!el){_err='201';return 'false';}_d[el]=String(val);_err='0';
      if(el==='cmi.core.lesson_status'){_statusSet=true;if(val==='completed'||val==='passed')notify('completed',_d);}
      if(el==='cmi.core.score.raw')notify('score',{score:val,data:_d});
      return 'true';},
    LMSCommit:function(){if(!_init){_err='301';return 'false';}notify('commit',_d);_err='0';return 'true';},
    LMSGetLastError:function(){return _err;},
    LMSGetErrorString:function(c){return({'0':'No error','101':'General exception','201':'Invalid argument','301':'Not initialized','401':'Not implemented','403':'Read only'})[c]||'Unknown error';},
    LMSGetDiagnostic:function(c){return 'Error '+c;}
  };
  window.API_1484_11={
    Initialize:function(){_init=true;_err='0';notify('init',{});return 'true';},
    Terminate:function(){
      if(!_d['cmi.completion_status']){_d['cmi.completion_status']='completed';}
      notify('commit',_d);notify('completed',_d);notify('finish',_d);_init=false;_err='0';return 'true';
    },
    GetValue:function(el){if(!_init){_err='301';return '';}if(!el){_err='201';return '';}_err='0';return _d[el]||'';},
    SetValue:function(el,val){if(!_init){_err='301';return 'false';}if(!el){_err='201';return 'false';}_d[el]=String(val);_err='0';
      if(el==='cmi.completion_status'){_statusSet=true;if(val==='completed'||val==='passed')notify('completed',_d);}
      if(el==='cmi.success_status'&&val==='passed')notify('completed',_d);
      if(el==='cmi.score.raw'||el==='cmi.score.scaled')notify('score',{score:val,data:_d});
      return 'true';},
    Commit:function(){if(!_init){_err='301';return 'false';}notify('commit',_d);_err='0';return 'true';},
    GetLastError:function(){return parseInt(_err);},
    GetErrorString:function(c){return({'0':'No error','101':'General exception','201':'Invalid argument','301':'Not initialized','401':'Not implemented','403':'Read only'})[c]||'Unknown error';},
    GetDiagnostic:function(c){return 'Error '+c;}
  };
})();
</script>`;

  // Three-way head injection (`upload.service.ts:309-316`).
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/(<head[^>]*>)/i, `$1\n${bridgeScript}\n`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/(<html[^>]*>)/i, `$1\n<head>${bridgeScript}</head>\n`);
  }
  return `${bridgeScript}\n${html}`;
}

export interface ProcessedScormPackage {
  indexHtmlUrl: string;
  manifest: unknown;
  title: string;
  scormVersion: string;
  entryPoint: string;
  launchPath: string;
}

/**
 * Process a SCORM ZIP: parse the manifest, upload the whole tree to S3 preserving
 * directory structure, then overwrite the entry-point HTML with a bridge-injected
 * copy. Port of `UploadService.processScormFile` (`upload.service.ts:90-251`).
 *
 * `orgId` is the legacy `tenantId` parameter (renamed org-wide); the literal
 * 'master' sentinel is preserved because it selects the master-courses prefix.
 */
export async function processScormFile(
  zipBuffer: Buffer,
  orgId: string,
): Promise<ProcessedScormPackage> {
  try {
    const zipEntries = await readEntries(zipBuffer);

    const manifestEntry = zipEntries.find(
      (entry) => entry.entryName === 'imsmanifest.xml' || entry.entryName.endsWith('/imsmanifest.xml'),
    );

    if (!manifestEntry) {
      throw BadRequest('Invalid SCORM package: imsmanifest.xml not found');
    }

    const manifestContent = (await manifestEntry.getData()).toString('utf8');
    const manifest = await parseStringPromise(manifestContent);

    // Version from schema — note this reads `metadata[0].schemaversion`, a
    // different path than parseScormPackage's title. Legacy behavior.
    const schemaVersion: string = manifest.manifest?.metadata?.[0]?.schemaversion?.[0] || '';
    const scormVersion = schemaVersion.includes('2004') ? '2004' : '1.2';

    const orgs = manifest.manifest?.organizations?.[0]?.organization || [];
    const courseTitle =
      orgs[0]?.title?.[0] || manifest.manifest?.organizations?.[0]?.title?.[0] || 'SCORM Course';

    let launchPath = '';
    const resources = manifest.manifest?.resources?.[0]?.resource || [];
    if (resources.length > 0) {
      const firstResource = resources[0];
      launchPath = firstResource.$?.href || firstResource.href?.[0] || '';
    }

    // Launch entry precedence: manifest launch path → index.html → any .html.
    let launchEntry: ZipEntry | undefined;
    if (launchPath) {
      launchEntry = zipEntries.find(
        (entry) => entry.entryName === launchPath || entry.entryName.endsWith(`/${launchPath}`),
      );
    }
    if (!launchEntry) {
      launchEntry = zipEntries.find(
        (entry) => entry.entryName === 'index.html' || entry.entryName.endsWith('/index.html'),
      );
    }
    if (!launchEntry) {
      launchEntry = zipEntries.find((entry) => entry.entryName.endsWith('.html'));
    }
    if (!launchEntry) {
      throw BadRequest('Invalid SCORM package: no HTML entry point found');
    }

    const scormId = randomUUID();
    const basePath =
      orgId === 'master' ? `master-courses/scorm/${scormId}` : `tenants/${orgId}/scorm/${scormId}`;

    // Upload ALL files preserving directory structure. Sequential, as in the
    // original — a SCORM package can hold thousands of members and parallelising
    // would change storage throttling behavior.
    for (const entry of zipEntries) {
      if (!entry.isDirectory) {
        await putObject(
          `${basePath}/${entry.entryName}`,
          await entry.getData(),
          contentTypeFor(entry.entryName),
        );
      }
    }

    const entryPoint = launchEntry.entryName;
    const entryKey = `${basePath}/${entryPoint}`;

    // Re-upload the entry point with the bridge injected, overwriting the original.
    const originalHtml = (await launchEntry.getData()).toString('utf8');
    await putObject(entryKey, Buffer.from(injectScormBridge(originalHtml), 'utf8'), 'text/html');

    return {
      indexHtmlUrl: `https://storage.googleapis.com/${S3_BUCKET}/${entryKey}`,
      manifest,
      title: courseTitle,
      scormVersion,
      entryPoint,
      launchPath: launchPath || entryPoint,
    };
  } catch (error: unknown) {
    if (error instanceof Error && 'statusCode' in error && (error as { statusCode: number }).statusCode === 400) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw BadRequest(`Failed to process SCORM file: ${message}`);
  }
}
