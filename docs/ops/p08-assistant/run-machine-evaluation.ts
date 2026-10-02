import { readFileSync, writeFileSync } from 'node:fs';
import { runEvaluation, type EvaluationCase } from '../../../lib/assistant/evaluation-harness';
import { evaluateDraftValidity } from './fixtures/p07-validity-source';
const dataset=JSON.parse(readFileSync(new URL('./evaluation.json',import.meta.url),'utf8'));
runEvaluation(dataset.cases as EvaluationCase[],evaluateDraftValidity).then(report=>{
  writeFileSync(new URL('./evidence/evaluation-machine-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
  process.stdout.write(JSON.stringify({cases:report.rows.length,passed:report.passed,failed:report.failed,humanReviewed:report.humanReviewed,answerQualityScore:report.answerQualityScore})+'\n');
  if(report.failed)process.exitCode=1;
});
