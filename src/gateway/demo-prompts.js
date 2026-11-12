import {Fault} from './runtime/util.js';
const initialized=new WeakMap();
export async function initPrompts(db){if(!initialized.has(db))initialized.set(db,db.prepare('CREATE TABLE IF NOT EXISTS gateway_demo_prompts(kind TEXT NOT NULL,run TEXT NOT NULL,id TEXT NOT NULL,step TEXT NOT NULL,prompt TEXT NOT NULL,target TEXT NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(kind,id))').run().catch(e=>{initialized.delete(db);throw e;}));await initialized.get(db);}
export function promptText(value,fallback){const text=value===undefined?fallback:value;if(typeof text!=='string'||!text.trim()||text.length>4000)throw new Fault(400,'Enter 1–4,000 characters of synthetic demo text.');return text;}
export async function savePrompt(db,kind,run,step,id,text,target){await db.prepare('INSERT INTO gateway_demo_prompts(kind,run,id,step,prompt,target,created) VALUES(?,?,?,?,?,?,?)').bind(kind,run,id,step,text,target,Date.now()).run();}
export async function getPrompt(db,kind,id){return (await db.prepare('SELECT prompt FROM gateway_demo_prompts WHERE kind=? AND id=?').bind(kind,id).first())?.prompt??null;}
export async function listPrompts(db,kind,run){return (await db.prepare('SELECT id,step,prompt,target,created FROM gateway_demo_prompts WHERE kind=? AND run=? ORDER BY created,id').bind(kind,run).all()).results;}
export async function clearExpiredPrompts(db,kind){await db.prepare('DELETE FROM gateway_demo_prompts WHERE kind=? AND created<?').bind(kind,Date.now()-1800000).run();}
