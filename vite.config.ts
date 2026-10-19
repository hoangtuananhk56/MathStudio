import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { appendFileSync, cpSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const OFFICE_JS_CDN = 'https://officeapis.public.onecdn.static.microsoft/1/office.js';

/**
 * Office.js comes from Microsoft's CDN for the AppSource (online) build.
 * The offline build (`--mode offline`) serves a bundled copy instead, so the
 * add-in works with no internet connection: office.js, the Word host files and
 * the Vietnamese and English strings, copied unmodified from @microsoft/office-js.
 */
function officeJs(offline: boolean, outDir: string): Plugin {
  const dist = resolve(import.meta.dirname, 'node_modules/@microsoft/office-js/dist');
  const wanted = (f: string) =>
    /^(office|o15apptofilemappingtable|es6-promise)\.js$/.test(f) || (/^word.*\.js$/.test(f) && !f.includes('.debug.'));
  return {
    name: 'office-js',
    transformIndexHtml(html) {
      // every page sits one folder down (editor/, taskpane/, …)
      const src = offline ? '../office-js/office.js' : OFFICE_JS_CDN;
      return html.replace('%OFFICE_JS%', src);
    },
    closeBundle() {
      if (!offline) return;
      const out = resolve(outDir, 'office-js');
      mkdirSync(out, { recursive: true });
      for (const f of readdirSync(dist)) if (wanted(f)) cpSync(resolve(dist, f), resolve(out, f));
      cpSync(resolve(dist, '../LICENSE.md'), resolve(out, 'LICENSE.md'));
      for (const dir of ['telemetry', 'vi-vn', 'en-us']) {
        cpSync(resolve(dist, dir), resolve(out, dir), { recursive: true, filter: (f) => !f.includes('.debug.') });
      }
    },
  };
}

/**
 * Dev-only diagnostics: Office webviews have no visible console, so pages forward
 * errors and their user agent to the dev server, which appends them to .devlog/client.log.
 * The injected script is ES5 so it also reports from old webviews (IE11 / EdgeHTML).
 */
function devClientLog(): Plugin {
  const logFile = resolve(import.meta.dirname, '.devlog/client.log');
  const write = (line: string) => {
    mkdirSync(dirname(logFile), { recursive: true });
    appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`);
  };
  return {
    name: 'dev-client-log',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__log', (req, res) => {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          write(`[${req.headers['user-agent']}] ${body}`);
          res.statusCode = 204;
          res.end();
        });
      });
    },
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          injectTo: 'head-prepend',
          children: `(function(){function s(m){try{var x=new XMLHttpRequest();x.open('POST','/__log',true);x.send(location.pathname+' '+m);}catch(e){}}
s('load');window.onerror=function(m,u,l,c){s('error: '+m+' @'+u+':'+l+':'+c);};
window.addEventListener&&window.addEventListener('unhandledrejection',function(e){s('rejection: '+(e.reason&&(e.reason.stack||e.reason.message)||e.reason));});
var ce=console.error;console.error=function(){var a=[];for(var i=0;i<arguments.length;i++){var v=arguments[i];a.push(v&&v.stack?v.stack:String(v));}s('console.error: '+a.join(' '));ce&&ce.apply(console,arguments);};})();`,
        },
      ];
    },
  };
}

export default defineConfig(async ({ mode, command }) => {
  const offline = mode === 'offline';
  const outDir = resolve(import.meta.dirname, offline ? 'dist-offline' : 'dist');
  let https: { key: string; cert: string; ca: string } | undefined;
  if (command === 'serve' && process.env.HTTPS === '1') {
    const devCerts = await import('office-addin-dev-certs');
    https = await devCerts.getHttpsServerOptions();
  }
  return {
    root: resolve(import.meta.dirname, 'src'),
    publicDir: resolve(import.meta.dirname, 'public'),
    base: './',
    plugins: [react(), officeJs(offline, outDir), devClientLog()],
    server: { port: 3000, strictPort: true, https },
    preview: { port: 3000, strictPort: true, https },
    build: {
      outDir,
      emptyOutDir: true,
      // MathLive is ~800 kB; it only loads inside the editor dialog.
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        input: {
          editor: resolve(import.meta.dirname, 'src/editor/index.html'),
          commands: resolve(import.meta.dirname, 'src/commands/index.html'),
          taskpane: resolve(import.meta.dirname, 'src/taskpane/index.html'),
          geometry: resolve(import.meta.dirname, 'src/geometry-editor/index.html'),
        },
      },
    },
    test: {
      root: import.meta.dirname,
      environment: 'jsdom',
      include: ['tests/**/*.test.ts'],
    },
  };
});
