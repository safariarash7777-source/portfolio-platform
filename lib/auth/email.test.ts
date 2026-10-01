import {test} from 'node:test';import assert from 'node:assert/strict';
import {emailReturnPath,emailLinkDestination} from './email';
test('Email final destinations are local and use the existing route contract',()=>{
  assert.equal(emailReturnPath('/market?view=funds'),'/market?view=funds');
  for(const path of ['https://evil.test','//evil.test','/login','/auth/callback','/unowned','/dashboard\\evil'])assert.equal(emailReturnPath(path),'/dashboard');
  const base='#type=signup&token_hash='+'a'.repeat(64)+'&redirect=';
  assert.equal(emailLinkDestination(base+encodeURIComponent('https://site.test/auth/callback?next=%2Fmarket'),'https://site.test')?.next,'/market');
  assert.equal(emailLinkDestination(base+encodeURIComponent('https://evil.test/auth/callback?next=%2Fadmin'),'https://site.test')?.next,'/dashboard');
  assert.equal(emailLinkDestination('#type=recovery&token_hash='+'b'.repeat(64),'https://site.test')?.next,'/reset-password');
  assert.equal(emailLinkDestination('#type=recovery&token_hash=pkce_'+'b'.repeat(64),'https://site.test')?.next,'/reset-password');
  assert.equal(emailLinkDestination('#type=recovery&token_hash=broken','https://site.test'),null);
});
