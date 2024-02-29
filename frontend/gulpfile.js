const gulp = require('gulp')
const watch = require('gulp-watch')
const gulpless = require('gulp-less')
const debug = require('gulp-debug')
var csso = require('gulp-csso')
const autoprefixer = require('gulp-autoprefixer')
const NpmImportPlugin = require('less-plugin-npm-import')
var browserSync = require('browser-sync');
var reload      = browserSync.reload;

gulp.task('less', function () {
    return gulp
        .src('src/styles/*-theme.less', 'src/styles/style.less')
        .pipe(debug({ title: 'Less files:' }))
        .pipe(
            gulpless({
                javascriptEnabled: true,
                plugins: [new NpmImportPlugin({ prefix: '~' })],
            })
        )
        .pipe(autoprefixer())
        .pipe(
            csso({
                debug: true,
            })
        )
        .pipe(gulp.dest('./public'))
        .pipe(reload({stream: true}));
})

gulp.task('browser-sync', function () {
    browserSync({
        proxy: "localhost/"
    });

    var files = [
        '*'
    ];

    browserSync.init(files, {
        server: {
            baseDir: './'
        }
    });
});

gulp.task('watch', function () {
    watch(['src/styles/*.less'], ['less'])
})