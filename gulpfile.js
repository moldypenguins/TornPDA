// gulpfile.js
import { console } from "console";
import { Buffer } from "node:buffer";
import { src, dest, series, parallel, watch as gulpWatch } from "gulp";
import through2 from "through2";
import fs from "node:fs";
import path from "node:path";
import CleanCSS from "clean-css";
import sass from "sass";
import postcss from "postcss";
import autoprefixer from "autoprefixer";
import { deleteAsync } from "del";
import gulpESLintNew from "gulp-eslint-new";
import gStylelintEsm from "gulp-stylelint-esm";

// ----------------- Config -----------------
const SRC_DIR = "src";
const OUT_DIR = "dist";
// exclude Common.js from userscript sources (but we will lint it)
const GLOB_JS_BUILD = [`${SRC_DIR}/*.js`, `!${SRC_DIR}/Common.js`];
const GLOB_JS_LINT = [`${SRC_DIR}/*.js`];
const GLOB_SCSS = [`${SRC_DIR}/*.scss`];

const PLACEHOLDER = "__MINIFIED_CSS__";
const COMMON_FILE = path.join(SRC_DIR, "Common.js");
// ------------------------------------------

/** Compile SCSS file to CSS (string). */
function compileScss(scssPath) {
  const result = sass.compile(scssPath, {
    style: "expanded",
    sourceMap: false,
    loadPaths: [path.dirname(scssPath), SRC_DIR],
  });
  return result.css;
}

/** Run PostCSS + Autoprefixer. */
async function autoprefixCss(css, fromPath) {
  const result = await postcss([autoprefixer()]).process(css, {
    from: fromPath,
    map: false,
  });
  return result.css;
}

/** Minify CSS string with clean-css. */
function minifyCss(cssText) {
  const minified = new CleanCSS({ level: 2 }).minify(cssText);
  if (minified.errors?.length) {
    console.warn(`[clean-css] Errors:\n  - ${minified.errors.join("\n  - ")}`);
  }
  if (minified.warnings?.length) {
    console.warn(
      `[clean-css] Warnings:\n  - ${minified.warnings.join("\n  - ")}`,
    );
  }
  return minified.styles || "";
}

/** Escape backticks and ${ to avoid accidental template interpolation. */
function toBacktickString(s) {
  return "`" + s.replace(/`/g, "\\`").replace(/\$\{/g, "\\${") + "`";
}

/** Replace quoted or bare placeholder tokens with the backtick CSS string. */
function replacePlaceholderSmart(js, token, cssText) {
  const bt = toBacktickString(cssText);
  const patterns = [
    { re: new RegExp(String.raw`'${token}'`, "g"), replacement: bt },
    { re: new RegExp(String.raw`"${token}"`, "g"), replacement: bt },
    { re: new RegExp(String.raw`\`${token}\``, "g"), replacement: bt },
    { re: new RegExp(String.raw`\b${token}\b`, "g"), replacement: bt },
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

/** Find end of userscript header (after "// ==/UserScript=="). */
function userscriptHeaderEndIndex(js) {
  const endTag = /\/\/\s*==\/UserScript==[^\n]*\n?/;
  const m = endTag.exec(js);
  return m ? m.index + m[0].length : 0;
}

/** --------- Lint tasks --------- */
export const lintJs = () => {
  return src(GLOB_JS_LINT, { allowEmpty: true })
    .pipe(gulpESLintNew({ configType: "flat" }))
    .pipe(gulpESLintNew.format())
    .pipe(gulpESLintNew.failAfterError());
};

export const lintScss = () => {
  return src(GLOB_SCSS, { allowEmpty: true }).pipe(
    gStylelintEsm({
      reporters: [{ formatter: "string", console: true }],
      failAfterError: true,
      fix: false,
      debug: false,
    }),
  );
};

export const lintFixJs = () => {
  return src(GLOB_JS_LINT, { allowEmpty: true })
    .pipe(gulpESLintNew({ configType: "flat", fix: true }))
    .pipe(gulpESLintNew.fix())
    .pipe(gulpESLintNew.format())
    .pipe(gulpESLintNew.failAfterError());
};

export const lintFixScss = () => {
  return src(GLOB_SCSS, { allowEmpty: true }).pipe(
    gStylelintEsm({
      reporters: [{ formatter: "string", console: true }],
      failAfterError: true,
      fix: true,
      debug: false,
    }),
  );
};

export const lint = parallel(lintJs, lintScss);

export const lintFix = parallel(lintFixJs, lintFixScss);
/** -------------------------------- */

/** Build userscripts: inline minified CSS from SCSS (if present), then inject Common.js. */
export const userscripts = () => {
  return src(GLOB_JS_BUILD, { allowEmpty: true })
    .pipe(
      through2.obj(function (file, _, cb) {
        if (file.isNull()) return cb(null, file);

        const processFile = async () => {
          const jsPath = file.path;
          const base = path.basename(jsPath, ".js");
          const scssPath = path.join(path.dirname(jsPath), `${base}.scss`);

          let js = file.contents.toString("utf8");

          // 1) CSS pipeline (optional)
          if (fs.existsSync(scssPath)) {
            let cssCompiled;
            try {
              cssCompiled = compileScss(scssPath);
            } catch (e) {
              throw new Error(
                `[sass] Failed to compile ${base}.scss: ${e.message}`,
              );
            }

            const cssPrefixed = await autoprefixCss(cssCompiled, scssPath);
            const cssMin = minifyCss(cssPrefixed);

            const { out, replaced } = replacePlaceholderSmart(
              js,
              PLACEHOLDER,
              cssMin,
            );
            if (!replaced) {
              console.warn(
                `[userscripts] Placeholder "${PLACEHOLDER}" not found in ${base}.js; CSS was NOT injected.`,
              );
            }
            js = out;
          }

          // 2) Inject Common.js after 'use strict';
          if (fs.existsSync(COMMON_FILE)) {
            const commonCode = fs.readFileSync(COMMON_FILE, "utf8");
            // Corrected insertion using a safe implementation:
            const eol = js.includes("\r\n") ? "\r\n" : "\n";
            const headerEnd = userscriptHeaderEndIndex(js);
            const before = js.slice(0, headerEnd);
            let body = js.slice(headerEnd);
            const strictRe = /(['"])use strict\1\s*;?/;
            const m = strictRe.exec(body);
            if (m) {
              const insertPos = m.index + m[0].length;
              body =
                body.slice(0, insertPos) +
                eol +
                commonCode +
                eol +
                body.slice(insertPos);
            } else {
              body = `'use strict';${eol}${commonCode}${eol}${body}`;
            }
            js = before + body;
          } else {
            console.warn(
              `[userscripts] ${path.basename(COMMON_FILE)} not found; skipping common code injection.`,
            );
          }

          // 3) Rename to *.user.js and output
          file.contents = Buffer.from(js);
          file.path = jsPath.replace(/\.js$/i, ".user.js");
        };

        processFile()
          .then(() => cb(null, file))
          .catch(cb);
      }),
    )
    .pipe(dest(OUT_DIR));
};

/** Clean dist/ */
export const clean = () => {
  return deleteAsync([`${OUT_DIR}/**`, `!${OUT_DIR}`]);
};

/** Watch: lint then build on changes. */
export const watchFiles = () => {
  // JS sources (excluding Common.js) → lint JS, then build
  gulpWatch(
    [`${SRC_DIR}/*.js`, `!${SRC_DIR}/Common.js`],
    series(lintJs, userscripts),
  );

  // Common.js → lint JS, then build (since it’s inlined)
  gulpWatch(`${SRC_DIR}/Common.js`, series(lintJs, userscripts));

  // SCSS → lint SCSS, then build
  gulpWatch(`${SRC_DIR}/*.scss`, series(lintScss, userscripts));
};

/** Build: clean → lint → userscripts */
export const build = series(clean, lint, userscripts);

/** Default: build once then watch */
export default series(build, watchFiles);
