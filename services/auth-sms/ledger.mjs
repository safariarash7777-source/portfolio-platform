import {DatabaseSync} from 'node:sqlite';
import {SmsError, fingerprint} from './core.mjs';
export class Ledger {
  constructor(config) {
    this.config=config;
    this.db=new DatabaseSync(config.dbPath);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS sends(id TEXT PRIMARY KEY,phone TEXT NOT NULL,at INTEGER NOT NULL,day TEXT NOT NULL,cost INTEGER NOT NULL,status TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS sends_phone_at ON sends(phone,at);
      CREATE TABLE IF NOT EXISTS attempts(scope TEXT NOT NULL,at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS attempts_scope_at ON attempts(scope,at);
      CREATE TABLE IF NOT EXISTS circuit(id INTEGER PRIMARY KEY CHECK(id=1),failures INTEGER NOT NULL,until_at INTEGER NOT NULL);
      INSERT OR IGNORE INTO circuit VALUES(1,0,0);`);
  }
  transaction(fn) { this.db.exec('BEGIN IMMEDIATE'); try {const result=fn();this.db.exec('COMMIT');return result;}catch(error){this.db.exec('ROLLBACK');throw error;} }
  admit(action, ip, device, target, now=Date.now()) {
    if(!['send','verify','password','link'].includes(action) || !ip || !device) throw new SmsError('invalid_admission',400);
    this.transaction(()=>{
      const scopes=[['ip:'+ip, action==='verify'?40:20],['device:'+device,action==='verify'?10:5],['phone:'+target,action==='verify'?10:5]];
      for(const [scope,limit] of scopes) {
        const key=fingerprint(this.config.hmacSecret,action+':'+scope);
        const {n}=this.db.prepare('SELECT count(*) n FROM attempts WHERE scope=? AND at>?').get(key,now-600000);
        if(n>=limit) throw new SmsError('rate_limited',429);
      }
      for(const [scope] of scopes)this.db.prepare('INSERT INTO attempts VALUES(?,?)').run(fingerprint(this.config.hmacSecret,action+':'+scope),now);
      this.db.prepare('DELETE FROM attempts WHERE at<?').run(now-86400000);
    });
  }
  reserve(message, now=Date.now()) {
    return this.transaction(()=>{
      const id=fingerprint(this.config.hmacSecret,message.id);
      const existing=this.db.prepare('SELECT status FROM sends WHERE id=?').get(id);
      if(existing) { if(existing.status==='accepted')return false; throw new SmsError('replay_rejected',409); }
      if(this.db.prepare('SELECT until_at FROM circuit WHERE id=1').get().until_at>now)throw new SmsError('circuit_open');
      const target=fingerprint(this.config.hmacSecret,message.phone);
      const latest=this.db.prepare('SELECT max(at) at,count(*) n FROM sends WHERE phone=? AND at>?').get(target,now-3600000);
      if(latest.n>=5 || (latest.at && now-latest.at<60000))throw new SmsError('rate_limited',429);
      const day=new Date(now).toISOString().slice(0,10);
      const budget=this.db.prepare('SELECT count(*) n,coalesce(sum(cost),0) cost FROM sends WHERE day=?').get(day);
      if(budget.n>=this.config.dailySends || budget.cost+this.config.reserveCost>this.config.dailyBudget)throw new SmsError('budget_exhausted',429);
      this.db.prepare('INSERT INTO sends VALUES(?,?,?,?,?,?)').run(id,target,now,day,this.config.reserveCost,'pending');
      return true;
    });
  }
  settle(message, receipt, now=Date.now()) {
    this.transaction(()=>{
      const id=fingerprint(this.config.hmacSecret,message.id);
      // Failed/ambiguous attempts retain full cost reservation; never retry automatically.
      this.db.prepare('UPDATE sends SET status=? WHERE id=?').run(receipt?'accepted':'failed',id);
      if(receipt && receipt.costRial<=this.config.reserveCost) {
        this.db.prepare('UPDATE sends SET cost=? WHERE id=?').run(receipt.costRial,id);
        this.db.prepare('UPDATE circuit SET failures=0,until_at=0 WHERE id=1').run();
      } else {
        if(receipt)this.db.prepare('UPDATE sends SET cost=? WHERE id=?').run(Math.max(receipt.costRial,this.config.reserveCost),id);
        const failures=this.db.prepare('SELECT failures FROM circuit WHERE id=1').get().failures+1;
        this.db.prepare('UPDATE circuit SET failures=?,until_at=? WHERE id=1').run(failures,receipt||failures>=3?now+86400000:0);
      }
    });
  }
  close(){this.db.close();}
}
