// Windows build machine only. Publishes split ZIPs into the Git checkout.
// Target ATGV machines extract these files without npm installation.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'vendor','windows-x64');
const policy=JSON.parse(await fs.readFile(path.join(dir,'bundle-policy.json'),'utf8'));
if(process.platform!=='win32'||process.arch!=='x64'||Number(process.versions.node.split('.')[0])!==policy.nodeMajor)throw Error('Windows x64 Node.js 24 required.');
const npm=process.env.npm_execpath||path.join(path.dirname(process.execPath),'node_modules','npm','bin','npm-cli.js');
const run=(bin,args,cwd)=>execFileSync(bin,args,{cwd,stdio:'inherit',windowsHide:true});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-bundle-'));
const manifest={schema:1,platform:policy.platform,arch:policy.arch,nodeMajor:policy.nodeMajor,applications:{}};
try{
 for(const app of policy.applications){
  const cwd=path.join(root,app);
  run(process.execPath,[npm,'ci','--include=dev','--include=optional','--no-audit','--no-fund'],cwd);
  run(process.execPath,[npm,'run','build'],cwd);
  run(process.execPath,[npm,'ls','--depth=0','--json'],cwd);
  const zip=path.join(temp,app+'.zip');
  run('tar.exe',['-a','-cf',zip,'-C',cwd,'node_modules'],cwd);
  const handle=await fs.open(zip,'r'),chunks=[],digest=crypto.createHash('sha256');
  try{
   const buf=Buffer.alloc(32*1024*1024);
   let index=0;
   for(;;){
    const {bytesRead}=await handle.read(buf,0,buf.length,null);
    if(!bytesRead)break;
    const bytes=buf.subarray(0,bytesRead),file=app+'.'+String(++index).padStart(3,'0')+'.zip.part';
    digest.update(bytes);
    await fs.writeFile(path.join(temp,file),bytes);
    chunks.push({file,sha256:hash(bytes),bytes:bytesRead});
   }
  }finally{await handle.close();}
  const inventory=[];
  async function walk(folder){
   for(const entry of await fs.readdir(folder,{withFileTypes:true})){
    if(!entry.isDirectory()||entry.name.startsWith('.'))continue;
    const p=path.join(folder,entry.name);
    if(entry.name.startsWith('@')){await walk(p);continue;}
    const pkg=await fs.readFile(path.join(p,'package.json'),'utf8').then(JSON.parse,()=>null);
    if(pkg)inventory.push({name:pkg.name,version:pkg.version,path:path.relative(cwd,p).split(path.sep).join('/')});
    if(await fs.stat(path.join(p,'node_modules')).then(s=>s.isDirectory(),()=>false))await walk(path.join(p,'node_modules'));
   }
  }
  await walk(path.join(cwd,'node_modules'));
  await fs.writeFile(path.join(temp,app+'.modules.json'),JSON.stringify(inventory,null,2)+'\n');
  manifest.applications[app]={packageSha256:hash(await fs.readFile(path.join(cwd,'package.json'))),lockSha256:hash(await fs.readFile(path.join(cwd,'package-lock.json'))),archiveSha256:digest.digest('hex'),chunks,packageCount:inventory.length};
 }
 for(const file of await fs.readdir(dir))if(/^(?:ReactTS_Frontend|NestJS_Backend)\.(?:\d{3}\.zip\.part|modules\.json)$/.test(file))await fs.rm(path.join(dir,file));
 for(const file of await fs.readdir(temp))if(file.endsWith('.part')||file.endsWith('.modules.json'))await fs.copyFile(path.join(temp,file),path.join(dir,file));
 await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
}finally{await fs.rm(temp,{recursive:true,force:true});}
