// gulpfile.mjs (or gulpfile.js with "type": "module")
import { src, dest, series, watch as gulpWatch } from 'gulp';
import through2 from 'through2';
import fs from 'node:fs';
import path from 'node:path';
import CleanCSS from 'clean-css';
import sass from 'sass';
import postcss from 'postcss';
import autoprefixer from 'autoprefixer';
import { deleteAsync } from 'del';

// Config
const SRC_DIR = 'src';
const OUT_DIR = 'dist';
const GLOB_JS = `${SRC_DIR}/*.js`;
const PLACEHOLDER = '__MINIFIED_CSS__';

/** Compile SCSS file to CSS (string). */
function compileScss(scssPath) {
  const result = sass.compile(scssPath, {
    style: 'expanded',
    sourceMap: false,
    loadPaths: [path.dirname(scssPath), SRC_DIR],
  });
  return result.css;
}

/** Run PostCSS + Autoprefixer. */
async function autoprefix(css, fromPath) {
  const result = await postcss([autoprefixer()]).process(css, { from: fromPath, map: false });
  return result.css;
}

/** Minify CSS string with clean-css. */
function minifyCss(cssText) {
  const minified = new CleanCSS({ level: 2 }).minify(cssText);
  if (minified.errors?.length) {
    console.warn(`[clean-css] Errors:\n  - ${minified.errors.join('\n  - ')}`);
  }
  if (minified.warnings?.length) {
    console.warn(`[clean-css] Warnings:\n  - ${minified.warnings.join('\n  - ')}`);
  }
  return minified.styles || '';
}

/** Escape backticks and ${ to avoid accidental template interpolation. */
function toBacktickString(s) {
  return '`' + s.replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`';
}

/** Replace quoted or bare placeholder tokens with the backtick CSS string. */
function replacePlaceholderSmart(js, token, cssText) {
  const bt = toBacktickString(cssText);
  const patterns = [
    { re: new RegExp(String.raw`'${token}'`, 'g'), replacement: bt },
    { re: new RegExp(String.raw`"${token}"`, 'g'), replacement: bt },
    { re: new RegExp(String.raw`\`${token}\``, 'g'), replacement: bt },
    { re: new RegExp(String.raw`\b${token}\b`, 'g'), replacement: bt },
  ];

  let out = js;
  let replaced = false;
  for (const { re, replacement } of patterns) {
    if (re.test(out)) {
      out = out.replace(re, replacement);
      replaced = true;
    }
  }
  return { out, replaced };
}

/** Main pipeline: for each src/*.js, inline minified CSS from matching src/*.scss if present. */
export function userscripts() {
  return src(GLOB_JS, { allowEmpty: true })
    .pipe(
      through2.obj(function (file, _, cb) {
        if (file.isNull()) return cb(null, file);

        const processFile = async () => {
          const jsPath = file.path;
          const base = path.basename(jsPath, '.js');
          const scssPath = path.join(path.dirname(jsPath), `${base}.scss`);

          let js = file.contents.toString('utf8');

          if (fs.existsSync(scssPath)) {
            // 1) SCSS -> CSS
            let cssCompiled;
            try {
              cssCompiled = compileScss(scssPath);
            } catch (e) {
              throw new Error(`[sass] Failed to compile ${base}.scss: ${e.message}`);
            }

            // 2) Autoprefix
            const cssPrefixed = await autoprefix(cssCompiled, scssPath);

            // 3) Minify
            const cssMin = minifyCss(cssPrefixed);

            // 4) Replace placeholder in JS
            const { out, replaced } = replacePlaceholderSmart(js, PLACEHOLDER, cssMin);
            if (!replaced) {
              console.warn(`[userscripts] Placeholder "${PLACEHOLDER}" not found in ${base}.js; CSS was NOT injected.`);
            }
            js = out;
          }

          // Set contents and rename to *.user.js
          file.contents = Buffer.from(js);
          file.path = jsPath.replace(/\.js$/i, '.user.js');
        };

        processFile()
          .then(() => cb(null, file))
          .catch(cb);
      })
    )
    .pipe(dest(OUT_DIR));
}

/** Clean dist/ */
export function clean() {
  return deleteAsync([`${OUT_DIR}/**`, `!${OUT_DIR}`]);
}

/** Watch src for changes and rebuild. */
export function watchFiles() {
  // Rebuild when any JS or SCSS changes
  gulpWatch([`${SRC_DIR}/*.js`, `${SRC_DIR}/*.scss`], userscripts);
}

/** Build: clean then userscripts */
export const build = series(clean, userscripts);

/** Default: build once then watch (so `npm run watch` works) */
export default series(build, watchFiles);
