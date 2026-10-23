import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { draftPayload, emptyGoal, goalsDraft } from "./draft";
import GoalsSummary from "./GoalsSummary";
import GoalsEditor from "./GoalsEditor";

const goal = () => ({ ...emptyGoal("goal-test"), title: "هدف مصنوعی", targetAmountToman: "۱۲۳۴", targetOn: "۲۰۲۷-۱۰-۰۱" });
test("Persian digits and blank versus explicit zero survive draft round-trip with provenance", () => {
  const unknown = draftPayload({ goals: [goal()] });
  assert.equal(unknown.goals[0].targetAmountToman, 1234); assert.equal(unknown.goals[0].targetOn, "2027-10-01"); assert.equal(unknown.goals[0].declaredSavedToman, null);
  const zero = draftPayload({ goals: [{ ...goal(), declaredSavedToman: "۰", sourceLabel: "یادداشت مصنوعی", observedOn: "۲۰۲۶-۱۰-۲۳" }] });
  assert.equal(zero.goals[0].declaredSavedToman, 0); assert.equal(goalsDraft(zero).goals[0].declaredSavedToman, "0"); assert.equal(goalsDraft(unknown).goals[0].declaredSavedToman, "");
  assert.deepEqual(draftPayload(goalsDraft(zero)), zero);
});
test("zero target, invalid date and source-less savings cannot become a valid draft", () => {
  assert.throws(() => draftPayload({ goals: [{ ...goal(), targetAmountToman: "۰" }] }));
  assert.throws(() => draftPayload({ goals: [{ ...goal(), targetOn: "2027-02-30" }] }));
  assert.throws(() => draftPayload({ goals: [{ ...goal(), declaredSavedToman: "۰" }] }), /منبع و تاریخ/);
  assert.throws(() => draftPayload({ goals: [{ ...goal(), sourceLabel: "منبع" }] }), /همراه مبلغ/);
});
test("summary preserves unknown progress, identifies declared savings and sorts deadlines without mutating snapshot", () => {
  const payload = draftPayload({ goals: [goal(), { ...goal(), goalKey: "early", title: "زودتر", targetOn: "2027-01-01", declaredSavedToman: "۰", sourceLabel: "یادداشت مصنوعی", observedOn: "2026-10-23" }] });
  const html = renderToStaticMarkup(<GoalsSummary goals={payload.goals} />);
  assert.match(html, /نامعلوم/); assert.match(html, /۰ تومان/); assert.match(html, /پیشرفت اظهارشده/); assert.match(html, /تاریخ مشاهده/); assert.match(html, /پیش‌بینی بازده/);
  assert.ok(html.indexOf("زودتر") < html.indexOf("هدف مصنوعی")); assert.equal(payload.goals[0].goalKey, "goal-test");
});
test("read-only editor disables the entire history form and labels dates and money units", () => {
  const html = renderToStaticMarkup(<GoalsEditor draft={{ goals: [goal()] }} locked onChange={() => assert.fail()} onSave={() => assert.fail()} onCancel={() => assert.fail()} />);
  assert.match(html, /fieldset disabled/); assert.match(html, /مبلغ هدف \(تومان\)/); assert.match(html, /موعد هدف \(میلادی\)/); assert.doesNotMatch(html, /localStorage/);
});
