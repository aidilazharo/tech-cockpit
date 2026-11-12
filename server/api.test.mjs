import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {makeApp} from './index.mjs';
test('SQLite-backed task API supports create/list/delete',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'atgv-sqlite-'));
 const {app,client}=await makeApp('file:'+join(folder,'test.db'));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const health=await fetch(base+'/api/health');assert.equal(health.status,200);
  const created=await fetch(base+'/api/tasks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'Example task'})});assert.equal(created.status,201);
  const task=await created.json();assert.equal(task.title,'Example task');
  const all=await(await fetch(base+'/api/tasks')).json();assert.ok(all.some(t=>t.id===task.id));
  assert.equal((await fetch(base+'/api/tasks/'+task.id,{method:'DELETE'})).status,204);
 }finally{await new Promise(r=>server.close(r));await client.close();await rm(folder,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
});
