// gulpfile.js
import console from "node:console";
import { Buffer } from "node:buffer";
import gulp from "gulp";
import terser from "gulp-terser";
import replace from "gulp-replace";
import through2 from "through2";
import fs from "node:fs";
import path from "node:path";
import CleanCSS from "clean-css";
import * as sass from "sass";
import postcss from "postcss";
import autoprefixer from "autoprefixer";
import { deleteAsync } from "del";
import gulpESLintNew from "gulp-eslint-new";
import gStylelintEsm from "gulp-stylelint-esm";

const { src, dest, series, parallel, watch } = gulp;

// ----------------- Config -----------------
const SRC_DIR = "src";
const OUT_DIR = "dist";
const GLOB_JS = [`${SRC_DIR}/*.js`];
const GLOB_SCSS = [`${SRC_DIR}/*.scss`];

const PLACEHOLDER = "__MINIFIED_CSS__";
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
    console.warn(`[clean-css] Warnings:\n  - ${minified.warnings.join("\n  - ")}`);
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

/** --------- Lint tasks --------- */
// export const lintJs = () => {
//   return src(GLOB_JS, { allowEmpty: true })
//     .pipe(gulpESLintNew({ configType: "flat" }))
//     .pipe(gulpESLintNew.format())
//     .pipe(gulpESLintNew.failAfterError());
// };

export function lintJs() {
  return src(GLOB_JS, { allowEmpty: true })
    .pipe(gulpESLintNew({ configType: "flat" }))
    .on("error", (e) => {
      console.error("[lintJs] stream error:", e);
    })
    .pipe(gulpESLintNew.format())
    .pipe(gulpESLintNew.failAfterError())
    .once("end", () => console.log("[lintJs] done"));
}

export const lintScss = () => {
  return src(GLOB_SCSS, { allowEmpty: true }).pipe(
    gStylelintEsm({
      reporters: [{ formatter: "string", console: true }],
      failAfterError: true,
      fix: false,
      debug: false,
    })
  );
};

export const lintFixJs = () => {
  return src(GLOB_JS, { allowEmpty: true })
    .pipe(gulpESLintNew({ configType: "flat", fix: true }))
    .on("error", (e) => {
      console.error("[lintJs] stream error:", e);
    })
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
    })
  );
};

export const lint = parallel(lintJs, lintScss);

export const lintFix = parallel(lintFixJs, lintFixScss);

/** -------------------------------- */

/** Build userscripts: inline minified CSS from SCSS (if present), then minify JS. */
export const userscripts = () => {
  return src(GLOB_JS, { allowEmpty: true })
    .pipe(
      through2.obj(function (file, _, cb) {
        if (file.isNull()) return cb(null, file);

        const processFile = async () => {
          const jsPath = file.path;
          let jsContents = file.contents.toString("utf8");
          const base = path.basename(jsPath, ".user.js");
          const scssPath = path.join(path.dirname(jsPath), `${base}.scss`);

          if (fs.existsSync(scssPath)) {
            try {
              const cssCompiled = compileScss(scssPath);
              const cssPrefixed = await autoprefixCss(cssCompiled, scssPath);
              const cssMin = minifyCss(cssPrefixed);

              const { out, replaced } = replacePlaceholderSmart(jsContents, PLACEHOLDER, cssMin);
              if (!replaced) {
                console.warn(`[userscripts] Placeholder missing in ${base}.user.js`);
              }
              jsContents = out;
            } catch (e) {
              return cb(new Error(`[build] Error in ${base}: ${e.message}`));
            }
          }

          file.contents = Buffer.from(jsContents);
          cb(null, file);
        };

        processFile().catch(cb);
      })
    )
    .pipe(
      terser({
        mangle: false, // { reserved: ['localStorage'] },
        compress: false, // { something: false }
        format: {
          comments: (_, comment) => {
            if (comment.type === "comment1") return true;
            if (comment.type === "comment2" && comment.value.startsWith("*")) return true;
            return false;
          },
        },
      })
    )
    .on("error", (err) => console.error("Terser Error:", err.toString()))
    .pipe(replace(/"use strict";/g, '"use strict";\n'))
    .pipe(dest(OUT_DIR));
};

/** Clean dist/ */
export const clean = () => {
  return deleteAsync([`${OUT_DIR}/**`, `!${OUT_DIR}`]);
};

/** Monitor: lint then build on changes. */
export const monitor = () => {
  // JS sources (excluding Common.js) → lint JS, then build
  watch([`${SRC_DIR}/*.js`], series(lintJs, userscripts));
  // SCSS → lint SCSS, then build
  watch(`${SRC_DIR}/*.scss`, series(lintScss, userscripts));
};

/** Build: clean → lint → userscripts */
export const build = series(clean, lint, userscripts);

/** Default: build once then monitor */
export default series(build, monitor);
