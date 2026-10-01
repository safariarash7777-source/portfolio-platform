import {isAuthSessionMissingError} from '@supabase/supabase-js';

/** HTTP translation only: same SDK-error categories as Auth190, no identity decision. */
export function notificationSessionStatus(user:unknown,error:unknown):200|401|503 {
 if(error){
  if(isAuthSessionMissingError(error))return 401;
  const status=typeof error==='object'&&'status' in error?error.status:undefined;
  return typeof status==='number'&&status>=400&&status<500?401:503;
 }
 return user?200:401;
}
