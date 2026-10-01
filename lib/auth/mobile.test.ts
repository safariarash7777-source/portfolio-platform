import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMobile,nationalIdFormatValid,authMessage} from './mobile';
test('Mobile digits and national ID leading zeros',()=>{
  for(const value of ['۰۹۰۰۰۰۰۰۰۰۱','٠٩٠٠٠٠٠٠٠٠١','+98 9000000001','00989000000001','989000000001'])assert.equal(normalizeMobile(value),'+989000000001');
  assert.equal(normalizeMobile('+15551234567'),null);assert.equal(normalizeMobile('0912'),null);
  assert.equal(nationalIdFormatValid('۰۰۰۰۰۰۰۰۱۹'),true);assert.equal(nationalIdFormatValid('0000000000'),false);assert.equal(nationalIdFormatValid('0000000018'),false);
});
test('Credentials, expired/replayed OTP, outage and limits distinct',()=>{
  assert.match(authMessage({code:'otp_expired'}),/منقضی/);assert.match(authMessage({code:'invalid_credentials'}),/رمز خود سایت/);
  assert.match(authMessage({status:503}),/سرویس ورود/);assert.match(authMessage({status:429}),/تعداد تلاش/);
});
