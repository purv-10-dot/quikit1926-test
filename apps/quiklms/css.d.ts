// Ambient declaration for side-effect CSS imports, e.g. `import './globals.css'`.
//
// This app's tsconfig uses `moduleResolution: "bundler"`, under which TypeScript
// has no built-in type for a plain `*.css` import — `next-env.d.ts` only pulls in
// declarations for `*.module.css` (CSS Modules). Without this, `import
// './globals.css'` reports ts(2882) "Cannot find module or type declarations for
// side-effect import". The bundler resolves the import at build time; this only
// satisfies the type checker. `*.module.css` stays covered by Next's own, more
// specific declaration, so CSS-module typing is unaffected.
declare module '*.css';
