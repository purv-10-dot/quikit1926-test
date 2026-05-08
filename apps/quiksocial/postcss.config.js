module.exports = {
  plugins: {
    // postcss-import inlines `@import "@quikit/ui/styles"` at PostCSS time
    // so the @tailwind directives from the imported file land before this
    // app's @layer components block. Without it, Tailwind errors with
    // "@layer components is used but no matching @tailwind components
    // directive is present". quikscale + admin don't enable this — their
    // globals.css has no @layer block.
    "postcss-import": {},
    tailwindcss: {},
    autoprefixer: {},
  },
};
