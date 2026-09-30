import { test } from "node:test";
import assert from "node:assert/strict";
import { postConsultation, type ConsultationGateway } from "./http";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const request = (body: unknown) => new Request("http://localhost/api/consultation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
test("status-only HTTP payload forwards no missing metadata or client-supplied identity", async () => {
  let args: Record<string, unknown> | undefined;
  const gateway: ConsultationGateway = {
    async authenticate() { return { user: { id }, error: false }; },
    async rpc(name, input) { assert.equal(name, "save_consultation_action"); args = input; return { data: id, error: null }; },
  };
  const response = await postConsultation(request({ action: "task", relationshipId: id, actionKey: id, baseVersion: "۲", status: "done", actor_id: "forged", user_id: "forged" }), async () => gateway);
  assert.equal(response.status, 201);
  assert.deepEqual(args, { p_relation: id, p_action_key: id, p_base: 2, p_body: { status: "done" } });
});
test("HTTP denies absent session before RPC and hides SQL details for conflicts/service failures", async () => {
  const gateway: ConsultationGateway = { async authenticate() { return { user: null, error: false }; }, async rpc() { throw Error("RPC must not run"); } };
  assert.equal((await postConsultation(request({}), async () => gateway)).status, 401);
  gateway.authenticate = async () => ({ user: { id }, error: false });
  for (const [code, expected] of [["42501", 403], ["PT409", 409], ["40001", 409], ["PGRST202", 503]] as const) {
    gateway.rpc = async () => ({ data: null, error: { code, message: "PRIVATE SQL payload" } });
    const response = await postConsultation(request({ action: "task", relationshipId: id, actionKey: id, baseVersion: 1, status: "done" }), async () => gateway);
    assert.equal(response.status, expected);
    assert.ok(!(await response.text()).includes("PRIVATE"));
  }
});
