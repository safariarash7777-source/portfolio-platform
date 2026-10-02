import {initialize,driver,results,save,redact} from './common.mjs';
try{await initialize();for(const name of ['01','02','03','market','14','12','13','human']){try{await import('./step-'+name+'.mjs')}catch(e){results.observations.push({at:new Date().toISOString(),label:'Step '+name+' execution error',data:{error:redact(e.message)}});save();console.log('Step '+name+' error: '+redact(e.message))}}}
catch(e){results.executionError=redact(e.message);save();console.log('Execution error: '+results.executionError)}
finally{results.finishedAt=new Date().toISOString();save();await driver.close()}
