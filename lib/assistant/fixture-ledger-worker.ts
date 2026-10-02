// Test subprocess only: synthetic inputs; deliberately absent from app imports.
import { FixtureBudgetLedger, type BudgetPolicy } from './fixture-ledger';
const [directory,key,subject,policyJson] = process.argv.slice(2);
const policy = JSON.parse(policyJson) as BudgetPolicy;
new FixtureBudgetLedger(directory,policy,() => 100).reserve(key,subject,10).then(
  () => { process.stdout.write('reserved'); },
  () => { process.stdout.write('denied'); process.exitCode=2; },
);
