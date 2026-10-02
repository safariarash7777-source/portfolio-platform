import {initialize,driver,results,save,redact} from './common.mjs';
try{await initialize();for(const name of ['market','valuation-recheck','03-resume','14-recheck','12','13','human','audit']){try{await import('./step-'+name+'.mjs')}catch(e){results.observations.push({at:new Date().toISOString(),label:'Resume '+name+' execution error',data:{error:redact(e.message)}});save();console.log('Resume '+name+' error: '+redact(e.message))}}}
catch(e){results.executionError=redact(e.message);save();console.log('Execution error: '+results.executionError)}
finally{results.finishedAt=new Date().toISOString();save();await driver.close()}
