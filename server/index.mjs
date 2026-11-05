import express from 'express';
import swaggerUi from 'swagger-ui-express';
import {createClient} from '@libsql/client';
import {drizzle} from 'drizzle-orm/libsql';
import {sqliteTable,integer,text} from 'drizzle-orm/sqlite-core';
import {eq} from 'drizzle-orm';
import {mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const tasks=sqliteTable('tasks',{
 id:integer('id').primaryKey({autoIncrement:true}),
 title:text('title').notNull(),
 description:text('description').notNull().default(''),
 status:text('status').notNull().default('todo'),
 createdAt:text('created_at').notNull(),
 updatedAt:text('updated_at').notNull()
});
const apiSpec={openapi:'3.0.3',info:{title:'ATGV Starter Task API',version:'1.0.0'},paths:{
 '/api/health':{get:{responses:{200:{description:'Ready'}}}},
 '/api/tasks':{get:{responses:{200:{description:'Tasks'}}},post:{responses:{201:{description:'Created'}}}},
 '/api/tasks/{id}':{get:{responses:{200:{description:'Task'}}},put:{responses:{200:{description:'Updated'}}},delete:{responses:{204:{description:'Deleted'}}}}
}};
export async function makeApp(databaseUrl=process.env.DATABASE_URL||'file:./data/app.db'){
 if(!databaseUrl.startsWith('file:'))throw Error('Starter permits local SQLite file: URLs only.');
 const filename=databaseUrl.slice(5);
 if(!filename || filename===':memory:' )throw Error('Use a local file SQLite URL.');
 await mkdir(dirname(resolve(filename)),{recursive:true});
 const client=createClient({url:databaseUrl});
 // Idempotent initial SQL migration; add versioned SQL migrations in production.
 await client.execute(`CREATE TABLE IF NOT EXISTS tasks (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'todo',
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL)`);
 const db=drizzle(client);const app=express();app.use(express.json({limit:'24kb'}));
 app.get('/api/health',(_req,res)=>res.json({status:'ok',database:'sqlite'}));
 app.use('/api/docs',swaggerUi.serve,swaggerUi.setup(apiSpec));
 app.get('/api/openapi.json',(_req,res)=>res.json(apiSpec));
 app.get('/api/tasks',async(_req,res,next)=>{try{res.json(await db.select().from(tasks));}catch(e){next(e);}});
 app.get('/api/tasks/:id',async(req,res,next)=>{try{
  const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'invalid id'});
  const [row]=await db.select().from(tasks).where(eq(tasks.id,id));return row?res.json(row):res.sendStatus(404);
 }catch(e){next(e);}});
 app.post('/api/tasks',async(req,res,next)=>{try{
  const title=req.body?.title,status=req.body?.status||'todo';
  if(typeof title!=='string'||!title.trim()||title.length>200||!['todo','doing','done'].includes(status))return res.status(400).json({error:'invalid task'});
  const now=new Date().toISOString();const [row]=await db.insert(tasks).values({title:title.trim(),description:String(req.body.description||'').slice(0,4000),status,createdAt:now,updatedAt:now}).returning();
  return res.status(201).json(row);
 }catch(e){next(e);}});
 app.put('/api/tasks/:id',async(req,res,next)=>{try{
  const id=Number(req.params.id),title=req.body?.title,status=req.body?.status;
  if(!Number.isSafeInteger(id)||id<1||typeof title!=='string'||!title.trim()||title.length>200||!['todo','doing','done'].includes(status))return res.status(400).json({error:'invalid task'});
  const [row]=await db.update(tasks).set({title:title.trim(),description:String(req.body.description||'').slice(0,4000),status,updatedAt:new Date().toISOString()}).where(eq(tasks.id,id)).returning();
  return row?res.json(row):res.sendStatus(404);
 }catch(e){next(e);}});
 app.delete('/api/tasks/:id',async(req,res,next)=>{try{
  const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'invalid id'});
  const rows=await db.delete(tasks).where(eq(tasks.id,id)).returning();return rows.length?res.sendStatus(204):res.sendStatus(404);
 }catch(e){next(e);}});
 app.use((err,_req,res,_next)=>{console.error(err);res.status(500).json({error:'internal server error'});});
 return {app,client};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {app}=await makeApp();const port=Number(process.env.API_PORT||3001);
 app.listen(port,'127.0.0.1',()=>console.log(`ATGV API http://127.0.0.1:${port}/api/docs`));
}
