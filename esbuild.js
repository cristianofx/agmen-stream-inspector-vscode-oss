const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
const { dependencies = {} } = require('./package.json');
const externalRuntimeDeps = ['vscode', ...Object.keys(dependencies)];

/** @type {esbuild.BuildOptions} */
const extensionConfig = {
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'dist/extension.js',
    external: externalRuntimeDeps,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    sourcemap: !production,
    minify: production,
    treeShaking: true,
};

// Find all webview entry points
function getWebviewEntryPoints() {
    const webviewDir = path.join(__dirname, 'src', 'webview');
    const entries = {};
    const dirs = ['main', 'editConnection', 'replayDialog', 'manageProfiles', 'sidebar'];
    for (const dir of dirs) {
        const baseName = dir === 'main' ? 'main' : dir;
        const tsFile = path.join(webviewDir, dir, `${baseName}.ts`);
        if (fs.existsSync(tsFile)) {
            entries[dir] = tsFile;
        }
    }
    return entries;
}

/** @type {esbuild.BuildOptions} */
const webviewConfig = {
    entryPoints: getWebviewEntryPoints(),
    bundle: true,
    outdir: 'dist/webview',
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    sourcemap: !production,
    minify: production,
    treeShaking: true,
};

function copyWebviewAssets() {
    // Copy CSS files from webview source directories to dist/webview
    const webviewDir = path.join(__dirname, 'src', 'webview');
    const distWebview = path.join(__dirname, 'dist', 'webview');
    const dirs = ['main', 'editConnection', 'replayDialog', 'manageProfiles', 'sidebar'];
    for (const dir of dirs) {
        const srcDir = path.join(webviewDir, dir);
        if (!fs.existsSync(srcDir)) { continue; }
        const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.css'));
        for (const file of files) {
            fs.mkdirSync(distWebview, { recursive: true });
            fs.copyFileSync(path.join(srcDir, file), path.join(distWebview, file));
        }
    }
    // Copy shared CSS
    const sharedDir = path.join(webviewDir, 'shared');
    if (fs.existsSync(sharedDir)) {
        const sharedFiles = fs.readdirSync(sharedDir).filter(f => f.endsWith('.css'));
        for (const file of sharedFiles) {
            fs.mkdirSync(distWebview, { recursive: true });
            fs.copyFileSync(path.join(sharedDir, file), path.join(distWebview, file));
        }
    }
}

/** @type {esbuild.Plugin} */
function makeWatchPlugin(name, isLast) {
    return {
        name: `watch-${name}`,
        setup(build) {
            build.onStart(() => {
                if (name === 'extension') {
                    console.log('[watch] Build started');
                }
            });
            build.onEnd(result => {
                if (result.errors.length > 0) {
                    for (const err of result.errors) {
                        console.error(err);
                    }
                }
                if (isLast) {
                    copyWebviewAssets();
                    console.log('[watch] Build finished');
                }
            });
        },
    };
}

async function main() {
    if (watch) {
        // Build both in a single context by logging markers only at the boundaries
        extensionConfig.plugins = [makeWatchPlugin('extension', false)];
        webviewConfig.plugins = [makeWatchPlugin('webview', true)];
        const extCtx = await esbuild.context(extensionConfig);
        const webCtx = await esbuild.context(webviewConfig);
        copyWebviewAssets();
        // Do an initial build first so VS Code sees the end pattern immediately
        await extCtx.rebuild();
        await webCtx.rebuild();
        copyWebviewAssets();
        console.log('[watch] Build started');
        console.log('[watch] Build finished');
        // Then start watching
        await Promise.all([extCtx.watch(), webCtx.watch()]);
    } else {
        await Promise.all([
            esbuild.build(extensionConfig),
            esbuild.build(webviewConfig),
        ]);
        copyWebviewAssets();
        console.log('Build complete.');
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
