import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export function createDb(filename) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      city TEXT NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL,
      cid TEXT NOT NULL DEFAULT '', maps_url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      query TEXT NOT NULL, cluster TEXT NOT NULL DEFAULT 'Geral',
      priority TEXT NOT NULL DEFAULT 'P2' CHECK(priority IN ('P1','P2','P3')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, query)
    );
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'QUEUED', mode TEXT NOT NULL DEFAULT 'all',
      started_at TEXT, ended_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
      total INTEGER NOT NULL DEFAULT 0, completed INTEGER NOT NULL DEFAULT 0,
      message TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS measurements (
      id INTEGER PRIMARY KEY AUTOINCREMENT, run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      term_id INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'PENDING', position INTEGER,
      candidate_position INTEGER, confidence TEXT NOT NULL DEFAULT 'NONE',
      screenshot TEXT NOT NULL DEFAULT '', search_url TEXT NOT NULL DEFAULT '',
      results_json TEXT NOT NULL DEFAULT '[]', observed_count INTEGER NOT NULL DEFAULT 0,
      measured_at TEXT, review_note TEXT NOT NULL DEFAULT '',
      UNIQUE(run_id, term_id)
    );
    CREATE TABLE IF NOT EXISTS imported_batches (
      digest TEXT PRIMARY KEY, created_at TEXT NOT NULL, source_name TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_terms_company ON terms(company_id);
    CREATE INDEX IF NOT EXISTS idx_runs_company ON runs(company_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_measurements_run ON measurements(run_id);
  `);
  if (!db.prepare("PRAGMA table_info(runs)").all().some(c=>c.name==='source')){
    db.exec("ALTER TABLE runs ADD COLUMN source TEXT NOT NULL DEFAULT 'LIVE'");
  }
  return db;
}
export function insertSeed(db, records) {
  const count = db.prepare('SELECT COUNT(*) as n FROM companies').get().n;
  if (count) return 0;
  const add = db.prepare('INSERT INTO companies(name,city,latitude,longitude,cid,maps_url) VALUES (?,?,?,?,?,?)');
  const addTerm = db.prepare('INSERT OR IGNORE INTO terms(company_id, query, cluster, priority) VALUES (?,?,?,?)');
  db.exec('BEGIN');
  try {
    for (const shop of records) {
      const result=add.run(shop.unit, shop.city, shop.lat, shop.lon, shop.cid||'', shop.mapsUrl||'');
      const id=Number(result.lastInsertRowid);
      for (const term of shop.terms) addTerm.run(id, term.term, term.cluster, term.priority);
    }
    db.exec('COMMIT');
    return records.length;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function getCompany(db,id){return db.prepare('SELECT * FROM companies WHERE id=?').get(id);}
export function getRun(db,id){return db.prepare(`SELECT r.*,c.name company_name,c.city FROM runs r JOIN companies c ON c.id=r.company_id WHERE r.id=?`).get(id);}
export function getLatestRun(db,companyId){return db.prepare('SELECT * FROM runs WHERE company_id=? ORDER BY id DESC LIMIT 1').get(companyId);}
export function getMeasurements(db,runId){return db.prepare(`SELECT m.*,t.query,t.cluster,t.priority FROM measurements m JOIN terms t ON t.id=m.term_id WHERE m.run_id=? ORDER BY CASE t.priority WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END, t.cluster,t.query`).all(runId).map(m=>({...m,results_json:JSON.parse(m.results_json||'[]')}));}

/** Importa novas unidades e consultas sem modificar cadastros ou histórico existentes.
 * Vincula por CID exato; se o mesmo nome existir com CID diferente, interrompe para revisao. */
export function insertAdditionalSeed(db,records){
 const byCid=db.prepare('SELECT * FROM companies WHERE lower(cid)=lower(?)');
 const byName=db.prepare('SELECT * FROM companies WHERE name=?');
 const addCompany=db.prepare('INSERT INTO companies(name,city,latitude,longitude,cid,maps_url) VALUES(?,?,?,?,?,?)');
 const addTerm=db.prepare('INSERT OR IGNORE INTO terms(company_id,query,cluster,priority) VALUES(?,?,?,?)');
 let companiesAdded=0,termsAdded=0;
 db.exec('BEGIN');
 try{
  for(const rec of records){
   const existing=byCid.get(rec.cid),sameName=byName.get(rec.unit);
   if(sameName && !existing && sameName.cid && sameName.cid.toLowerCase()!==rec.cid.toLowerCase())
      throw Error('CID divergente para '+rec.unit+'; revise o cadastro antes de importar');
   if(existing && existing.name!==rec.unit)throw Error('CID ja cadastrado sob outro nome: '+existing.name);
   let id;
   if(existing)id=existing.id;
   else if(sameName){id=sameName.id;
    if(!sameName.cid)db.prepare('UPDATE companies SET cid=? WHERE id=?').run(rec.cid,id);
   }else{id=Number(addCompany.run(rec.unit,rec.city,rec.lat,rec.lon,rec.cid,rec.mapsUrl).lastInsertRowid);companiesAdded++;}
   for(const term of rec.terms){termsAdded+=Number(addTerm.run(id,term.term,term.cluster,term.priority).changes);}
  }
  db.exec('COMMIT');return {companiesAdded,termsAdded};
 }catch(e){db.exec('ROLLBACK');throw e;}
}
