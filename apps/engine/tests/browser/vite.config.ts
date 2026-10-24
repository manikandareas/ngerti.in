import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const fixture=path.join(root,'apps/engine/tests/browser');
const meta=JSON.parse(fs.readFileSync('.dev/nma-025-browser.json','utf8'));
export default defineConfig({root:fixture,plugins:[react(),tailwindcss()],define:{'import.meta.env.VITE_API_URL':JSON.stringify('http://127.0.0.1:3025')},resolve:{alias:{'@clerk/tanstack-react-start':path.join(fixture,'auth.tsx'),'@tanstack/react-router':path.join(fixture,'router.tsx'),'@':path.join(root,'apps/web/src')}},server:{host:'127.0.0.1',port:3025,strictPort:true,fs:{allow:[root]},proxy:{'/api':meta.base}}});
