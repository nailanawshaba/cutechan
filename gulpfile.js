"use strict";

const fs = require("fs");
const path = require("path");
const del = require("del");
const merge = require("merge-stream");
const stripAnsi = require("strip-ansi");
const uglifyes = require("uglify-es");
const gulp = require("gulp");
const gutil = require("gulp-util");
const concat = require("gulp-concat");
const gulpif = require("gulp-if");
const tap = require("gulp-tap");
const shell = require("gulp-shell");
const sourcemaps = require("gulp-sourcemaps");
const ts = require("gulp-typescript");
const rjsOptimize = require("gulp-requirejs-optimize");
const spritesmith = require("gulp.spritesmith");
const less = require("gulp-less");
const postcss = require("gulp-postcss");
const rename = require("gulp-rename");
const uglify = require("gulp-uglify/composer")(uglifyes, console);
const notify = require("gulp-notify");
const livereload = require("gulp-livereload");
const runSequence = require("run-sequence");

const LANGS_GLOB = "i18n/*.json";
const TEMPLATES_GLOB = "mustache-pp/**/*.mustache";
const SMILESJS_GLOB = "smiles-pp/smiles.js";
const TYPESCRIPT_GLOB = "{app,ts/**/*}.[tj]s?(x)";

const DIST_DIR = "dist";
const STATIC_DIR = path.join(DIST_DIR, "static");
const JS_DIR = path.join(STATIC_DIR, "js");
const CSS_DIR = path.join(STATIC_DIR, "css");
const IMG_DIR = path.join(STATIC_DIR, "img");
const FONTS_DIR = path.join(STATIC_DIR, "fonts");

// Keep script alive and rebuild on file changes.
// Triggered with the `-w` flag.
const watch = gutil.env.w;

// Dependency tasks for the default tasks.
const tasks = [];

// Notify about errors.
const notifyError = notify.onError({
  title: "<%= error.name %>",
  message: "<%= options.stripAnsi(error.message) %>",
  templateOptions: {stripAnsi},
});

// Simply log the error on continuos builds, but fail the build and exit
// with an error status, if failing a one-time build. This way we can
// use failure to build the client to not pass Travis CL tests.
function handleError(err) {
  if (watch) {
    notifyError(err);
    if (this) {
      this.emit("end");
    }
  } else {
    throw err;
  }
}

// Create a new gulp task and set it to execute on default and
// incrementally.
function createTask(name, path, task, watchPath) {
  tasks.push(name);
  gulp.task(name, () =>
    task(gulp.src(path))
  );

  // Recompile on source update, if running with the `-w` flag.
  if (watch) {
    gulp.watch(watchPath || path, [name]);
  }
}

function langs() {
  return gulp.src(LANGS_GLOB)
    .pipe(tap(function(file) {
      const name = JSON.stringify(path.basename(file.path, ".json"));
      let contents = file.contents.toString();
      try {
        // Basically just a validation.
        contents = JSON.parse(contents);
      } catch(e) {
        handleError(e);
        contents = null;
      }
      const lang = JSON.stringify(contents);
      file.contents = new Buffer(`langs[${name}] = ${lang};`);
    }))
    .pipe(concat("langs.js"))
    .pipe(tap(function(file) {
      file.contents = Buffer.concat([
        new Buffer('define("cc-langs", ["exports"], function(exports) {\n'),
        new Buffer("var langs = {};\n"),
        file.contents,
        new Buffer("\nexports.default = langs;\n"),
        new Buffer("});\n"),
      ]);
    }));
}

function templates() {
  return gulp.src(TEMPLATES_GLOB)
    .pipe(tap(function(file) {
      const name = JSON.stringify(path.basename(file.path, ".mustache"));
      const template = JSON.stringify(file.contents.toString());
      file.contents = new Buffer(`templates[${name}] = ${template};`);
    }))
    .pipe(concat("templates.js"))
    .pipe(tap(function(file) {
      file.contents = Buffer.concat([
        new Buffer('define("cc-templates", ["exports"], function(exports) {\n'),
        new Buffer("var templates = {};\n"),
        file.contents,
        new Buffer("\nexports.default = templates;\n"),
        new Buffer("});\n"),
      ]);
    }));
}

function typescript(opts) {
  const project = ts.createProject("tsconfig.json", opts);
  return gulp.src("app.ts")
    .pipe(project(ts.reporter.nullReporter()))
    .on("error", handleError);
}

function buildClient(tsOpts) {
  return merge(langs(), templates(), typescript(tsOpts))
    .on("error", () => {})
    .pipe(sourcemaps.init())
    .pipe(concat(tsOpts.outFile));
}

// Builds the client files of the appropriate ECMAScript version.
function buildES6() {
  const name = "es6";
  tasks.push(name);
  gulp.task(name, () =>
    buildClient({target: "ES6", outFile: "app.js"})
      .pipe(gulpif(!watch, uglify({mangle: {safari10: true}})))
      .pipe(sourcemaps.write("maps"))
      .pipe(gulp.dest(JS_DIR)));

  // Recompile on source update, if running with the `-w` flag.
  if (watch) {
    gulp.watch([
      LANGS_GLOB,
      TEMPLATES_GLOB,
      SMILESJS_GLOB,
      TYPESCRIPT_GLOB,
    ], [name]);
  }
}

// Build legacy ES5 client for old browsers.
function buildES5() {
  const name = "es5";
  tasks.push(name);
  gulp.task(name, () =>
    buildClient({target: "ES5", outFile: "app.es5.js"})
      .pipe(uglify())
      .pipe(sourcemaps.write("maps"))
      .pipe(gulp.dest(JS_DIR))
  );
}

// Special task, run separately.
gulp.task("smiles", () => {
  const allSmiles = fs.readdirSync("smiles");
  const allSet = new Set(allSmiles);
  const smileIds = allSmiles
    .filter(s => /^[a-z0-9_]+\.png$/.test(s))
    .map(s => s.slice(0, -4))
    .sort();
  const pathsWithRetina = [];
  smileIds
    .filter(s => allSet.has(s + "@2x.png"))
    .forEach(s =>
      pathsWithRetina.push(
        `smiles/${s}.png`,
        `smiles/${s}@2x.png`
      ));
  const pathsWithoutRetina = smileIds
    .filter(s => !allSet.has(s + "@2x.png"))
    .map(s => `smiles/${s}.png`);

  if (pathsWithRetina.length + pathsWithoutRetina.length !== allSmiles.length) {
    throw new Error("Smiles mismatch");
  }

  const withRetina = gulp
    .src(pathsWithRetina)
    .pipe(spritesmith({
      imgName: "_smiles.png",
      cssName: "smiles.css",
      imgPath: "/static/img/smiles.png",
      retinaSrcFilter: "smiles/*@2x.png",
      retinaImgName: "_smiles@2x.png",
      retinaImgPath: "/static/img/smiles@2x.png",
      cssOpts: {
        cssSelector: s => ".smile-" + s.name,
      },
    }));

  const withoutRetina = gulp
    .src(pathsWithoutRetina)
    .pipe(spritesmith({
      imgName: "_smileso.png",
      cssName: "smileso.css",
      imgPath: "/static/img/smileso.png",
      cssOpts: {
        cssSelector: s => ".smile-" + s.name,
      },
    }));

  return merge(withRetina, withoutRetina)
    .pipe(gulp.dest("smiles-pp"))
    // gulp-imagemin requires 240+ deps, fuck that shit.
    .pipe(gulpif("*.png", shell([
      "optipng",
      "-quiet",
      "-clobber",
      "-strip", "all",
      "-out", "'<%= file.basename.slice(1) %>'",
      "'<%= file.basename %>'",
    ].join(" "), {cwd: "smiles-pp"})))
    .on("end", () => {
      const jsSmiles = smileIds.map(s => `"${s}"`).join(",");
      const jsModule = `
        // AUTOGENERATED, DO NOT EDIT
        export default new Set([${jsSmiles}]);
      `;
      fs.writeFileSync("smiles-pp/smiles.js", jsModule);

      const goSmiles = smileIds.map(s => `"${s}":true`).join(",");
      const goModule = `
        // AUTOGENERATED, DO NOT EDIT
        package smiles
        var Smiles = map[string]bool{${goSmiles}}
      `;
      try { fs.mkdirSync("go/src/smiles"); } catch(e) { /* pass */ }
      fs.writeFileSync("go/src/smiles/smiles.go", goModule);
    });
});

gulp.task("clean", () =>
  del(DIST_DIR)
);

// Client JS files.
buildES6();
if (!watch) buildES5();

// Third-party dependencies and loader.
createTask("loader", "loader.js", src =>
  src
    .pipe(rjsOptimize({
      optimize: "none",
      cjsTranslate: true,
      paths: {
        almond: "node_modules/almond/almond",
        events: "node_modules/events/events",
        mustache: "node_modules/mustache/mustache",
        classnames: "node_modules/classnames/index",
        preact: "node_modules/preact/dist/preact",
        "textarea-caret": "node_modules/textarea-caret/index",
      },
    }))
    .pipe(gulpif(!watch, uglify()))
    .pipe(gulp.dest(JS_DIR))
);

// Polyfills.
createTask("polyfills", [
  "node_modules/core-js/client/core.min.js",
  "node_modules/proxy-polyfill/proxy.min.js",
  "node_modules/dom4/build/dom4.js",
  "node_modules/whatwg-fetch/fetch.js",
], src =>
  src
    .pipe(gulpif(/core\.min\.js$/, rjsOptimize({optimize: "none"})))
    .pipe(gulp.dest(JS_DIR))
);

// Compile Less to CSS.
createTask("css", "less/[^_]*.less", src =>
  src
    .pipe(sourcemaps.init())
    .pipe(less())
    .on("error", handleError)
    .pipe(gulpif(!watch, postcss([
      // NOTE(Kagami): Takes ~1sec to just require them.
      require("autoprefixer")(),
      require("cssnano")({
        // Avoid fixing z-index which might be used in animation.
        zindex: false,
        // Avoid renaming counters which should be accessed from JS.
        reduceIdents: false,
        // Remove all comments.
        discardComments: {removeAll: true},
      }),
    ])))
    .on("error", handleError)
    .pipe(sourcemaps.write("maps"))
    .pipe(gulp.dest(CSS_DIR))
    .pipe(gulpif("**/*.css", livereload()))
, ["less/*.less", "smiles-pp/smiles*.css"]);

// Static assets.
createTask("assets", ["assets/**/*", "smiles-pp/smiles*.png"], src =>
  src
    .pipe(gulpif("smiles*.png",
      gulp.dest(IMG_DIR),
      gulp.dest(STATIC_DIR)
    ))
);

// Fonts.
createTask("fonts", "node_modules/font-awesome/fonts/fontawesome-webfont.*",
           src =>
  src
    .pipe(gulp.dest(FONTS_DIR))
);

// Build everything.
gulp.task("default", cb => {
  runSequence("clean", tasks, cb)
});

if (watch) {
  livereload.listen({quiet: true})
}
